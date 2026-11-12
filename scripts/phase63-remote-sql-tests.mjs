/**
 * Phase 6.3 — run the policy-level SQL tests against the REMOTE project.
 *
 * `scripts/phase6-sql-tests.sql` is written to be runnable in the Supabase
 * SQL editor, where every statement is its own submission. This runner uses
 * the same model against the live project, through the Management API's
 * database query endpoint.
 *
 * THE VERDICT
 *
 * Every assertion in that file goes through `phase6_sql_test.assert()`, which
 * RAISES when the condition is not true. So a unit that contains one
 * assertion settles the question by itself:
 *
 *   - the unit returns 201 -> the assertion held;
 *   - the unit returns 400 -> the assertion failed, and the error message
 *     carries its label ("ASSERTION FAILED: <label>").
 *
 * A unit that contains no assertion is setup or teardown, and is reported as
 * such.
 *
 * THE UNITS
 *
 * A unit is one statement, or a whole `begin; … rollback;` block. The block
 * has to stay whole, because a role switch and a rollback only mean anything
 * inside a transaction, and a transaction only survives inside one
 * submission.
 *
 * THE SCANNER
 *
 * The file is scanned ONCE, in a single pass, tracking four things at the
 * same time: line comments, block comments, dollar-quoted bodies, and string
 * literals. Splitting the file into two passes — strip the comments, then
 * split what is left — desynchronises the scanner state, because a comment
 * can sit inside a dollar-quoted body, and the second pass then reads the
 * body's apostrophes as string delimiters. The file's comments contain
 * apostrophes ("the session's role"), so that mistake is not hypothetical.
 *
 * WHY THE MANAGEMENT API
 *
 * The project's `db` host resolves to an IPv6 address only, and this machine
 * has no IPv6 route to it, so a direct Postgres session is not available here.
 * The Management API's query endpoint reaches the same database and keeps
 * the semantics these assertions depend on — verified before relying on them:
 * a `set local role anon` inside a transaction really does filter the rows
 * (the anon view sees fewer rows than the superuser view), and an explicit
 * `rollback;` really does discard that submission's writes.
 *
 * The endpoint runs as `postgres`, which bypasses RLS. That is precisely why
 * the file's role switches matter, and why they are exercised rather than
 * assumed.
 *
 * THE ACCESS TOKEN
 *
 * Read from `SUPABASE_ACCESS_TOKEN` when it is set, otherwise from the
 * Windows Credential Manager entry the Supabase CLI itself uses. It is never
 * printed, never written to a file, and never passed as a command-line
 * argument in a way that would reach the process list.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { platform } from "node:os";

const SQL_FILE = "scripts/phase6-sql-tests.sql";
const API = "https://api.supabase.com";

/* -------------------------------------------------------------------------- */
/*                             The access token                               */
/* -------------------------------------------------------------------------- */

/**
 * Read the CLI's personal access token from the Windows Credential Manager.
 *
 * The blob comes back base64-encoded so that no console code page can
 * corrupt it, and so it can be handed straight to Node.
 */
function readTokenFromCredentialManager(profile = "supabase") {
  if (platform() !== "win32") return null;

  const script = [
    "$s = @'",
    "using System;",
    "using System.Runtime.InteropServices;",
    "public static class Cred {",
    "  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]",
    "  public struct CREDENTIAL {",
    "    public uint Flags; public uint Type; public IntPtr TargetName;",
    "    public IntPtr Comment; public long LastWritten;",
    "    public uint CredentialBlobSize; public IntPtr CredentialBlob;",
    "    public uint Persist; public uint AttributeCount; public IntPtr Attributes;",
    "    public IntPtr TargetAlias; public IntPtr UserName;",
    "  }",
    '  [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]',
    "  public static extern bool CredRead(string target, uint type, int reserved, out IntPtr credential);",
    '  [DllImport("advapi32.dll", EntryPoint = "CredFree", SetLastError = true)]',
    "  public static extern void CredFree(IntPtr cred);",
    "}",
    "'@",
    "Add-Type -TypeDefinition $s -Language CSharp",
    "$p = [IntPtr]::Zero",
    `if ([Cred]::CredRead("Supabase CLI:${profile}", 1, 0, [ref]$p)) {`,
    "  $c = [Runtime.InteropServices.Marshal]::PtrToStructure($p, [type][Cred+CREDENTIAL])",
    "  $n = [int]$c.CredentialBlobSize",
    "  $b = New-Object byte[] $n",
    "  [Runtime.InteropServices.Marshal]::Copy($c.CredentialBlob, $b, 0, $n)",
    "  [Convert]::ToBase64String($b)",
    "  [Cred]::CredFree($p)",
    "}",
  ].join("\n");

  try {
    const out = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      { encoding: "utf8" },
    );
    const base64 = out
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => /^[A-Za-z0-9+/=]{20,}$/.test(line));
    if (!base64) return null;
    return Buffer.from(base64, "base64").toString("utf8").replace(/\0+$/, "");
  } catch {
    return null;
  }
}

function accessToken() {
  const fromEnv = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  return readTokenFromCredentialManager(process.env.SUPABASE_PROFILE ?? "supabase");
}

/* -------------------------------------------------------------------------- */
/*                                 The scanner                                */
/* -------------------------------------------------------------------------- */

/**
 * Split the file into units: single statements, and whole
 * `begin; … rollback;` blocks.
 *
 * ONE PASS. The scanner tracks line comments, block comments, dollar-quoted
 * bodies and string literals at the same time, and emits a unit at each
 * top-level semicolon.
 *
 * ORDER MATTERS. The file builds a fixture, then asserts against it, so the
 * units have to be run in the order they appear. A block is therefore
 * emitted in place, not collected and appended.
 */
function splitUnits(source) {
  const units = [];
  let current = "";
  let inDollarQuote = false;
  let inString = false;
  let block = null;

  const emit = (text) => {
    const trimmed = text.trim();
    if (trimmed) units.push(trimmed);
  };

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];

    // A line comment runs to the end of the line. It is dropped, not kept:
    // a unit's identity is its SQL, not its prose.
    if (!inDollarQuote && !inString && char === "-" && source[i + 1] === "-") {
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }

    // A block comment.
    if (!inDollarQuote && !inString && char === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 1;
      continue;
    }

    // A dollar-quoted body opens and closes with the SAME delimiter, so one
    // branch handles both. The two dollars are copied across WHOLE.
    if (char === "$" && source[i + 1] === "$") {
      inDollarQuote = !inDollarQuote;
      current += "$$";
      i += 1;
      continue;
    }

    // A string literal. A doubled quote inside it is an escaped quote.
    if (char === "'" && !inDollarQuote) {
      if (inString && source[i + 1] === "'") {
        current += "''";
        i += 1;
        continue;
      }
      inString = !inString;
      current += char;
      continue;
    }

    // A top-level semicolon ends a statement.
    if (!inDollarQuote && !inString && char === ";") {
      current += ";";
      const keyword = current.trim().replace(/;$/, "").trim();

      if (!block && /^begin$/i.test(keyword)) {
        block = { statements: [] };
        current = "";
        continue;
      }

      if (block) {
        if (/^rollback$/i.test(keyword)) {
          // The block is submitted WHOLE, with its `begin;` and `rollback;`
          // intact, because the role switch and the rollback only mean
          // anything inside a transaction.
          units.push(`begin;\n${block.statements.join("\n")}\nrollback;`);
          block = null;
          current = "";
          continue;
        }
        block.statements.push(current.trim());
        current = "";
        continue;
      }

      emit(current);
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) emit(current);

  return {
    units,
    blocks: units.filter((unit) => /^begin;/i.test(unit)).length,
  };
}

/**
 * The assertion labels a unit contains.
 *
 * `phase6_sql_test.assert(condition, 'label')` is the only shape the file
 * uses, and each unit carries at most one assertion. The label is the LAST
 * string literal in the call's argument list — the condition can itself
 * contain string literals (`not public.can_read_review('…', 'draft')` has
 * two), so the first one is not necessarily the label.
 *
 * The scan does NOT treat dollar quotes as opaque: the calls sit inside
 * `$ … $` bodies, and the literals inside them are ordinary SQL strings.
 * A definition (`create or replace function … assert(…)`) is not a call and
 * is skipped.
 */
function labelsIn(unit) {
  const labels = [];
  const marker = "phase6_sql_test.assert(";
  let from = 0;

  for (;;) {
    const start = unit.indexOf(marker, from);
    if (start === -1) break;
    from = start + marker.length;

    // A definition is not a call.
    const before = unit.slice(Math.max(0, start - 12), start);
    if (/function\s*$/.test(before)) continue;

    // Walk to the matching close paren, respecting string literals.
    let depth = 1;
    let i = from;
    let inString = false;
    let literal = null;
    const literals = [];

    while (i < unit.length && depth > 0) {
      const char = unit[i];

      if (char === "'") {
        if (inString && unit[i + 1] === "'") {
          literal += "''";
          i += 2;
          continue;
        }
        if (inString) {
          literals.push(literal);
          literal = null;
        } else {
          literal = "";
        }
        inString = !inString;
        i += 1;
        continue;
      }

      // A character inside a literal is part of the literal.
      if (inString) {
        literal += char;
        i += 1;
        continue;
      }

      if (char === "(") depth += 1;
      if (char === ")") {
        depth -= 1;
        if (depth === 0) break;
      }

      i += 1;
    }

    // The label is the last literal: the condition comes first.
    if (literals.length > 0) {
      labels.push(literals[literals.length - 1].replace(/''/g, "'"));
    }
  }

  return labels;
}

/* -------------------------------------------------------------------------- */
/*                                   Run                                      */
/* -------------------------------------------------------------------------- */

const token = accessToken();
if (!token) {
  console.error(
    "No Supabase access token.\n\n" +
      "Set SUPABASE_ACCESS_TOKEN, or sign in with the Supabase CLI so the token\n" +
      "is in the Windows Credential Manager.",
  );
  process.exit(1);
}

const ref = process.env.PRSME_PROJECT_REF ?? "dmuvbiojelzojeqvrcli";

/** The endpoint rate-limits, so submissions are spaced and retried. */
const SUBMIT_DELAY_MS = 1500;

async function submit(sql) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const res = await fetch(`${API}/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
      signal: AbortSignal.timeout(120000),
    });
    const text = await res.text();

    if (res.status === 429 || /Too Many Requests/i.test(text)) {
      const wait = attempt * 5000;
      console.log(`  ..   rate limited, retrying in ${wait}ms`);
      await new Promise((resolve) => setTimeout(resolve, wait));
      continue;
    }

    return { ok: res.ok, status: res.status, text };
  }

  return { ok: false, status: 429, text: "rate limited" };
}

const sql = readFileSync(SQL_FILE, "utf8");
const { units, blocks } = splitUnits(sql);

console.log(`PRSME - Phase 6.3 policy assertions against ${ref}`);
console.log(`${units.length} units (${blocks} transaction blocks) from ${SQL_FILE}\n`);

const verdicts = [];
const failures = [];

for (const unit of units) {
  const preview = unit.replace(/\s+/g, " ").slice(0, 64);

  const { ok, text } = await submit(unit);
  await new Promise((resolve) => setTimeout(resolve, SUBMIT_DELAY_MS));

  if (ok) {
    const labels = labelsIn(unit);
    for (const label of labels) {
      verdicts.push({ label, passed: true });
      console.log(`  ok   ${label}`);
    }
    if (labels.length === 0) console.log(`  --   ${preview}`);
    continue;
  }

  let message = text;
  try {
    message = JSON.parse(text).message ?? text;
  } catch {
    /* not JSON */
  }

  const match = message.match(/ASSERTION FAILED:\s*([^\n\r]+)/);
  const label = match
    ? match[1].trim()
    : `${preview} - ${message.replace(/\s+/g, " ").slice(0, 180)}`;

  verdicts.push({ label, passed: false });
  failures.push(label);
  console.log(`  FAIL ${label}`);
  console.log(`       ${message.replace(/\s+/g, " ").slice(0, 260)}`);
}

console.log(`\n${"=".repeat(60)}`);

const passed = verdicts.filter((v) => v.passed).length;
console.log(
  `${passed} passed, ${failures.length} failed, ${verdicts.length} assertions`,
);

if (failures.length > 0) {
  console.log("\nFailures:");
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exitCode = 1;
}
