/**
 * The SQL statement splitter.
 *
 * ONE implementation, shared by the local runner and the remote runner, so the
 * two can never disagree about where a statement ends.
 *
 * WHY A SPLITTER IS NEEDED AT ALL
 *
 * The Phase 8 SQL test file is written to be runnable in the Supabase SQL
 * editor, where every statement is its own submission. The runners execute
 * it statement by statement, because the file contains `begin; … rollback;`
 * blocks whose transaction scope has to be preserved — a role switch and a
 * rollback only mean anything inside one transaction, and a transaction only
 * survives inside one submission.
 *
 * A NAIVE SEMICOLON SPLIT IS NOT ENOUGH
 *
 * The file uses `$ … $` for function bodies, so a semicolon inside a body
 * would cut a function in half. On top of that, the file is heavily
 * commented, and its comments contain apostrophes ("the policy's `with
 * check`") and even what look like statement terminators.
 *
 * THE SCANNER
 *
 * One pass, tracking FOUR things at the same time:
 *
 *   - line comments          `-- …` to the end of the line
 *   - block comments         the slash-star … star-slash form
 *   - dollar-quoted bodies   `$$ … $$` or `$tag$ … $tag$`
 *   - string literals        `'…'`, with `''` as an escaped quote
 *
 * Splitting the file into two passes — strip the comments, then split what
 * is left — desynchronises the scanner state, because a comment can sit
 * inside a dollar-quoted body, and the second pass then reads the body's
 * apostrophes as string delimiters. The file's comments contain apostrophes,
 * so that mistake is not hypothetical.
 *
 * COMMENTS ARE DROPPED, NOT KEPT
 *
 * A unit's identity is its SQL, not its prose. Keeping a comment would put
 * the comment's own semicolons and apostrophes back into the statement.
 */

/**
 * Read the dollar-quote delimiter that STARTS at `index`, if there is one.
 *
 * A Postgres dollar-quote delimiter is EITHER `$$` (untagged) or `$tag$`,
 * where the tag is an identifier. The same delimiter closes it.
 *
 * Returns the TAG — the empty string for the untagged form — or `null` when
 * there is no delimiter at this position.
 *
 * A `$` followed by a DIGIT is a positional parameter (`$1`), not a
 * delimiter, and a `$` that is not followed by a closing `$` is neither.
 */
function readDollarTag(source, index) {
  if (source[index] !== "$") return null;

  const next = source[index + 1];

  // The untagged form.
  if (next === "$") return "";

  // A tag starts with a letter or an underscore, and continues with letters,
  // digits or underscores.
  if (!next || !/[A-Za-z_]/.test(next)) return null;

  let end = index + 1;
  while (end < source.length && /[A-Za-z0-9_]/.test(source[end])) end += 1;

  if (source[end] !== "$") return null;
  return source.slice(index + 1, end);
}

/**
 * Split a SQL file into executable statements.
 *
 * A `begin;` … `rollback;` block is emitted WHOLE, with its `begin;` and
 * `rollback;` intact, because the role switch and the rollback only mean
 * anything inside a transaction.
 *
 * The units are emitted IN PLACE, not collected and appended: the file builds
 * a fixture and then asserts against it, so the order matters.
 */
export function splitSqlUnits(source) {
  const units = [];
  let current = "";
  let dollarTag = null;
  let inString = false;
  let block = null;

  const emit = (text) => {
    const trimmed = text.trim();
    if (trimmed) units.push(trimmed);
  };

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];

    // A line comment runs to the end of the line. It is dropped.
    if (dollarTag === null && !inString && char === "-" && source[i + 1] === "-") {
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }

    // A block comment.
    if (dollarTag === null && !inString && char === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 1;
      continue;
    }

    /*
     * A dollar-quoted body.
     *
     * The delimiter opens and closes with the SAME tag, so one branch handles
     * both. The delimiter is copied across WHOLE.
     *
     * A TAGGED delimiter (`$tag$`) is not the same as the untagged one
     * (`$$`): a scanner that only knows about `$$` reads the body of a tagged
     * quote as ordinary SQL, and cuts it at the first semicolon inside it.
     */
    if (char === "$" && !inString) {
      const tag = readDollarTag(source, i);
      if (tag !== null) {
        if (dollarTag === null) {
          dollarTag = tag;
        } else if (dollarTag === tag) {
          dollarTag = null;
        }
        current += source.slice(i, i + tag.length + 2);
        i += tag.length + 1;
        continue;
      }
    }

    // A string literal. A doubled quote inside it is an escaped quote.
    if (char === "'" && dollarTag === null) {
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
    if (dollarTag === null && !inString && char === ";") {
      current += ";";
      const keyword = current.trim().replace(/;$/, "").trim();

      if (!block && /^begin$/i.test(keyword)) {
        block = { statements: [] };
        current = "";
        continue;
      }

      if (block) {
        if (/^rollback$/i.test(keyword)) {
          // The block is submitted WHOLE.
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
 * `phase8_sql_test.assert(condition, 'label')` is the only shape the file
 * uses, and each unit carries at most one assertion. The label is the LAST
 * string literal in the call's argument list — the condition can itself
 * contain string literals, so the first one is not necessarily the label.
 *
 * The scan does NOT treat dollar quotes as opaque: the calls sit inside
 * `$ … $` bodies, and the literals inside them are ordinary SQL strings.
 * A definition (`create or replace function … assert(…)`) is not a call and
 * is skipped.
 */
export function labelsIn(unit, schema = "phase8_sql_test") {
  const labels = [];
  const marker = `${schema}.assert(`;
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
