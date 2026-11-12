/**
 * The Supabase personal access token, read without ever printing it.
 *
 * TWO SOURCES, IN ORDER
 *
 *   1. `SUPABASE_ACCESS_TOKEN` — the explicit, portable choice.
 *   2. The Windows Credential Manager entry the Supabase CLI itself writes
 *      (`Supabase CLI:<profile>`), so a machine that is already signed in to
 *      the CLI needs no extra setup.
 *
 * WHY A SHARED MODULE
 *
 * Both the Phase 6.3 remote SQL runner and the project-restore helper need
 * the same token, and neither may print it. The Credential Manager read is
 * the fiddly part — the blob has to be base64-encoded on the way out so no
 * console code page can corrupt it — so it lives here once.
 *
 * The token is returned to the caller in memory. It is never written to a
 * file, never logged, and never passed as a command-line argument.
 */
import { execFileSync } from "node:child_process";
import { platform } from "node:os";

/**
 * Read a generic credential from the Windows Credential Manager.
 *
 * Returns the decoded UTF-8 value, or `null` when the entry does not exist.
 */
export function readCredential(target) {
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
    `if ([Cred]::CredRead("${target}", 1, 0, [ref]$p)) {`,
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

/**
 * The access token, or `null` when there is none.
 *
 * `SUPABASE_PROFILE` selects which CLI profile to read, for a machine that
 * is signed in to more than one.
 */
export function accessToken() {
  const fromEnv = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (fromEnv) return fromEnv;

  const profile = process.env.SUPABASE_PROFILE ?? "supabase";
  return readCredential(`Supabase CLI:${profile}`);
}

/**
 * The access token, or a thrown error explaining how to supply one.
 */
export function requireAccessToken() {
  const token = accessToken();
  if (!token) {
    throw new Error(
      "No Supabase access token.\n\n" +
        "Set SUPABASE_ACCESS_TOKEN, or sign in with the Supabase CLI so the\n" +
        "token is in the Windows Credential Manager.",
    );
  }
  return token;
}

/**
 * The project's SECRET key, or `null`.
 *
 * Read from `SUPABASE_SERVICE_ROLE_KEY` when it is set, otherwise from the
 * Management API's key endpoint. It is never printed and never written to a
 * file.
 *
 * WHAT IT IS FOR
 *
 * Provisioning test accounts. The public sign-up path cannot be used for
 * that: the project rate-limits sign-ups, requires email confirmation, and
 * rejects the throwaway addresses. The admin endpoint creates a CONFIRMED
 * account with the same internal state GoTrue's own sign-up produces, so the
 * account can then sign in through the ordinary password path and exercise
 * the real session machinery.
 *
 * It is a credential with wide authority — it bypasses RLS entirely — so it
 * is used for setup and teardown only, never to make an assertion.
 */
export async function serviceRoleKey(ref = process.env.PRSME_PROJECT_REF ?? "dmuvbiojelzojeqvrcli") {
  const fromEnv = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (fromEnv) return fromEnv;

  const token = requireAccessToken();
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/api-keys`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(60000),
    },
  );
  if (!res.ok) return null;

  const keys = await res.json();
  if (!Array.isArray(keys)) return null;

  /*
   * The legacy `service_role` JWT is returned in full by this endpoint; the
   * new-style `sb_secret_…` key comes back masked, so it cannot be used
   * here. The legacy key carries the same `service_role` role.
   */
  const legacy = keys.find((key) => key.id === "service_role");
  return legacy?.api_key ?? null;
}
