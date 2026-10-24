/*
 * Phase 6.1 — stop the `next dev` server.
 *
 * The production build and the dev server share `.next`, so running a build
 * while `next dev` is serving corrupts the dev server's chunks. This phase
 * serves the PRODUCTION build instead, which is what the brief asks to be
 * verified anyway.
 */
import { execSync } from "node:child_process";

const output = execSync(
  "powershell -NoProfile -Command \"Get-CimInstance Win32_Process -Filter \\\"Name = 'node.exe'\\\" | Select-Object ProcessId, CommandLine | Format-List\"",
  { encoding: "utf8" },
);

const blocks = output.split(/\r?\n\r?\n/);

let killed = 0;

for (const block of blocks) {
  const pidMatch = block.match(/ProcessId:\s*(\d+)/);
  const cmdMatch = block.match(/CommandLine:\s*(.+)/);
  if (!pidMatch || !cmdMatch) continue;

  const pid = Number(pidMatch[1]);
  const cmd = cmdMatch[1];

  // Only the Next.js dev server for this project.
  const isNextDev =
    cmd.includes("next") &&
    (cmd.includes("dev") || cmd.includes("next\\dist\\bin\\next")) &&
    cmd.includes("prsme");

  if (!isNextDev) continue;

  try {
    process.kill(pid);
    killed += 1;
    console.log(`stopped next dev (pid ${pid})`);
  } catch (error) {
    console.log(`could not stop pid ${pid}: ${error.message}`);
  }
}

console.log(`\n${killed} dev server(s) stopped`);
