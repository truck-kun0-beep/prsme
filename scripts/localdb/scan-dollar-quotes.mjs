/**
 * Scan SQL files for a COLLAPSED dollar quote.
 *
 * A `$$` that has collapsed to a single `$` is invisible in a diff and fatal
 * to the statement splitter: the body is then read as ordinary SQL and cut at
 * the first semicolon inside it.
 *
 * The check is a scan, not a parse. It reports every `$` that does NOT look
 * like a well-formed dollar-quote delimiter:
 *
 *   - `$$`            — the untagged form, fine
 *   - `$tag$`         — the tagged form, fine
 *   - `$1`, `$2`      — a positional parameter, fine
 *   - `$` alone       — COLLAPSED, and the thing this script is looking for
 *   - `$body`         — a collapsed tag
 *
 * A line that both opens and closes a body on one line (`as $$ ... $$;`) is
 * fine, and so is a line that is only a closing delimiter.
 *
 * Only `$` in *code* counts. A `$` inside a string literal — `'^[0-9]{1,4}$'`
 * is a regular expression, not a collapsed delimiter — is masked out along
 * with comments and quoted identifiers before the scan, so ordinary SQL does
 * not produce false alarms.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** The directories scanned when no file is named on the command line. */
const SCAN_DIRECTORIES = ["supabase/migrations", "scripts"];

/**
 * Every `.sql` file under a directory, recursively and sorted.
 */
function sqlFilesUnder(directory) {
  const found = [];

  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);

    if (statSync(path).isDirectory()) {
      found.push(...sqlFilesUnder(path));
    } else if (entry.endsWith(".sql")) {
      found.push(path);
    }
  }

  return found.sort();
}

/**
 * The files to scan: the ones named on the command line, or every SQL file in
 * the repository when none are named.
 */
function targetFiles() {
  const named = process.argv.slice(2);
  if (named.length > 0) return named;

  return SCAN_DIRECTORIES.flatMap((directory) => {
    try {
      return sqlFilesUnder(directory);
    } catch {
      return [];
    }
  });
}

const files = targetFiles();

if (files.length === 0) {
  console.error("usage: node scripts/localdb/scan-dollar-quotes.mjs <file…>");
  process.exit(1);
}

/**
 * Replace the characters that are not SQL code with spaces, keeping the
 * length and the line structure intact so that a reported column still
 * points at the right place in the original file.
 *
 * Masked: line comments, block comments, single-quoted string literals and
 * double-quoted identifiers. Dollar-quoted bodies are NOT masked wholesale —
 * their interior is ordinary SQL and a collapsed delimiter inside one has to
 * stay visible.
 */
function maskLiterals(source) {
  const masked = source.split("");

  /** Blank one character, but never a newline. */
  const blank = (index) => {
    if (masked[index] !== "\n" && masked[index] !== "\r") masked[index] = " ";
  };

  /**
   * Whether a string literal opened here is an `E'...'` literal, in which a
   * backslash escapes the next character.
   */
  const isEscapeString = (index) => {
    if (index === 0) return false;
    if (!/[Ee]/.test(source[index - 1])) return false;
    const before = source[index - 2];
    return before === undefined || !/[A-Za-z0-9_$]/.test(before);
  };

  let index = 0;

  while (index < source.length) {
    const character = source[index];

    // A line comment runs to the end of the line.
    if (character === "-" && source[index + 1] === "-") {
      while (index < source.length && source[index] !== "\n") {
        blank(index);
        index += 1;
      }
      continue;
    }

    // A block comment runs to its terminator.
    if (character === "/" && source[index + 1] === "*") {
      const end = source.indexOf("*/", index + 2);
      const stop = end === -1 ? source.length : end + 2;
      for (let i = index; i < stop; i += 1) blank(i);
      index = stop;
      continue;
    }

    // A string literal. A doubled quote is an escaped quote inside it.
    if (character === "'") {
      const escapes = isEscapeString(index);
      let cursor = index + 1;

      while (cursor < source.length) {
        if (source[cursor] === "'") {
          if (source[cursor + 1] === "'") {
            cursor += 2;
            continue;
          }
          cursor += 1;
          break;
        }
        if (escapes && source[cursor] === "\\") {
          cursor += 2;
          continue;
        }
        if (source[cursor] === "\n") break;
        cursor += 1;
      }

      for (let i = index; i < cursor; i += 1) blank(i);
      index = cursor;
      continue;
    }

    // A quoted identifier.
    if (character === '"') {
      let cursor = index + 1;

      while (cursor < source.length) {
        if (source[cursor] === '"') {
          if (source[cursor + 1] === '"') {
            cursor += 2;
            continue;
          }
          cursor += 1;
          break;
        }
        cursor += 1;
      }

      for (let i = index; i < cursor; i += 1) blank(i);
      index = cursor;
      continue;
    }

    index += 1;
  }

  return masked;
}

/** The dollar-quote delimiters a line opens or closes with. */
function delimiters(line) {
  const found = [];
  const pattern = /\$([A-Za-z_][A-Za-z0-9_]*)?\$/g;
  let match;

  while ((match = pattern.exec(line)) !== null) {
    found.push({ at: match.index, text: match[0] });
  }

  return found;
}

/** The `$` characters that are NOT part of a delimiter or a parameter. */
function strays(line) {
  const taken = new Array(line.length).fill(false);

  for (const delimiter of delimiters(line)) {
    for (let i = delimiter.at; i < delimiter.at + delimiter.text.length; i += 1) {
      taken[i] = true;
    }
  }

  const strays = [];
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] !== "$" || taken[i]) continue;
    // A positional parameter: `$1`, `$2`.
    if (/^\$[0-9]/.test(line.slice(i))) {
      taken[i] = true;
      continue;
    }
    strays.push(i);
  }

  return strays;
}

let problems = 0;

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const lines = maskLiterals(source).join("").split(/\r?\n/);

  lines.forEach((line, index) => {
    if (!line.includes("$")) return;

    const stray = strays(line);
    if (stray.length === 0) return;

    problems += 1;
    console.log(`${file}:${index + 1}: ${JSON.stringify(lines[index])}`);
    console.log(
      `  stray $ at column ${stray.map((i) => i + 1).join(", ")} — a collapsed dollar quote?`,
    );
  });
}

if (problems > 0) {
  console.log(`\n${problems} suspicious line(s).`);
  process.exit(1);
}

console.log(`no collapsed dollar quotes (${files.length} file(s) scanned).`);
