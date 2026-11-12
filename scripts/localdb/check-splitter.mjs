/**
 * A temporary diagnostic: does the splitter still handle the UNTAGGED form?
 *
 * The splitter was changed to understand TAGGED dollar quotes (`$tag$`) as
 * well as the untagged one (`$$`). The migrations use the untagged form, so
 * this checks that the migration chain still splits into the same units, and
 * that the tagged form is now handled too.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { splitSqlUnits } from "./sql-split.mjs";

const dir = "supabase/migrations";

console.log("--- the migration chain ---");
for (const name of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) {
  const source = readFileSync(join(dir, name), "utf8");
  const { units } = splitSqlUnits(source);

  /*
   * A unit that still contains an OPENING dollar-quote but no closing one
   * would mean the scanner lost track of the body.
   */
  const unbalanced = units.filter((unit) => {
    const opens = (unit.match(/\$\$/g) ?? []).length;
    return opens % 2 !== 0;
  });

  /*
   * A unit that ends inside a function body would show up as a unit whose
   * text contains "create or replace function" but no "$$" — because the
   * body was cut in half.
   */
  const cutBodies = units.filter(
    (unit) =>
      /create\s+or\s+replace\s+function/i.test(unit) &&
      !unit.includes("$$"),
  );

  console.log(
    `${name.padEnd(46)} ${String(units.length).padStart(3)} units` +
      `  unbalanced=${unbalanced.length} cut=${cutBodies.length}`,
  );

  for (const unit of cutBodies) {
    console.log(`   CUT: ${unit.replace(/\s+/g, " ").slice(0, 120)}`);
  }
}

console.log("\n--- the tagged form ---");
const tagged = `
create function public.probe_tagged() returns int
language sql
as $tag$
  select 1; -- a semicolon inside the body
$tag$;

select 2;
`;
const { units } = splitSqlUnits(tagged);
console.log(`${units.length} units`);
units.forEach((unit, index) => {
  console.log(`  ${index + 1}: ${unit.replace(/\s+/g, " ").slice(0, 100)}`);
});

console.log("\n--- a tagged body must not be cut at its semicolon ---");
console.log(
  units[0].includes("select 1; -- a semicolon inside the body")
    ? "the tagged body survived intact"
    : "THE TAGGED BODY WAS CUT",
);
