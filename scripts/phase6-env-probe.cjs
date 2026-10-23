/**
 * Environment probe for Phase 6.
 *
 * Reports only WHETHER things exist — never a secret value. Safe to run in CI
 * and to commit: it cannot leak a key even if one is configured.
 */

const fs = require("fs");
const { execFileSync } = require("child_process");

function hasCommand(name) {
  if (process.platform === "win32") {
    try {
      const out = execFileSync("where.exe", [name], { encoding: "utf8" });
      return out.trim().split(/\r?\n/)[0];
    } catch {
      return null;
    }
  }
  try {
    return execFileSync("which", [name], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

const envFileExists = fs.existsSync(".env.local");
const plainEnvExists = fs.existsSync(".env");

const supabaseEnvKeys = Object.keys(process.env).filter((k) =>
  k.includes("SUPABASE"),
);

console.log("--- PRSME Phase 6 environment probe ---");
console.log(".env.local present :", envFileExists);
console.log(".env present       :", plainEnvExists);
console.log(
  "SUPABASE env vars  :",
  supabaseEnvKeys.length ? supabaseEnvKeys.join(", ") : "none",
);

for (const cmd of ["supabase", "docker", "psql", "node", "npm", "git"]) {
  const path = hasCommand(cmd);
  console.log(`${cmd.padEnd(18)}:`, path ?? "NOT FOUND");
}

// Parse .env.local for KEY NAMES only — never the values.
if (envFileExists) {
  const text = fs.readFileSync(".env.local", "utf8");
  const names = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split("=")[0].trim())
    .filter(Boolean);
  const supabaseNames = names.filter((n) => n.includes("SUPABASE"));
  console.log(
    ".env.local Supabase keys:",
    supabaseNames.length ? supabaseNames.join(", ") : "none",
  );
}
