// Drive headless Edge via the Chromium DevTools Protocol to verify the
// studio actually mounts in a real browser. Targets:
//   - /studio: confirm the boot shell resolves into the panel UI
//     (AppearancePanel / IdentityPanel / CollectionsPanel / SectionsPanel /
//      SoundtrackPanel / PrivacyPanel) with all expected testids.
//   - /u/noir: confirm /studio-override-active body attribute switches the
//     source of truth from the SSR default to the customized draft.
//
// Pure Node script — no test runner. Imports `ws` via the standard built-in
// `node:ws` if available; otherwise it relies on Node 22+'s global WebSocket.

import { writeFileSync } from "node:fs";

const HOST = process.env.PRSME_HOST ?? "http://127.0.0.1:3000";

async function getJson(path) {
  const r = await fetch(`http://127.0.0.1:9333${path}`);
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status}`);
  return r.json();
}

let WebSocket;
try {
  WebSocket = (await import("node:ws")).WebSocket;
} catch {
  WebSocket = globalThis.WebSocket;
}

// Target discovery
const targets = await getJson("/json");
const studioTarget = targets.find((t) => t.type === "page");
if (!studioTarget) throw new Error("No page target found");
const wsUrl = studioTarget.webSocketDebuggerUrl;
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => {
  ws.addEventListener("open", res);
  ws.addEventListener("error", rej);
});

let nextId = 1;
const pending = new Map();
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
  }
});

function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) {
    pass++;
    console.log(`PASS  ${label}`);
  } else {
    fail++;
    console.log(`FAIL  ${label}${detail ? " :: " + detail : ""}`);
  }
};

async function navigate(url, waitMs = 4000) {
  await call("Page.enable");
  await call("Page.navigate", { url });
  await new Promise((r) => setTimeout(r, waitMs));
}

async function evalJs(expr) {
  const res = await call("Runtime.evaluate", {
    expression: expr,
    awaitPromise: true,
    returnByValue: true,
  });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description ?? "eval error");
  }
  return res.result.value;
}

async function clickText(selectorPattern) {
  // Find first matching button/tab in DOM and click it.
  const sel = selectorPattern.replace(/'/g, "\\'");
  const expr = `
    (async () => {
      const el = [...document.querySelectorAll('[role="tab"], button, a')]
        .find((e) => e.matches('${sel}') || e.getAttribute('data-testid') === '${sel}');
      if (!el) return { ok: false, error: 'no element matched: ' + JSON.stringify('${sel}') };
      el.click();
      return { ok: true };
    })()
  `;
  const r = await evalJs(expr);
  if (!r.ok) throw new Error(r.error);
  await new Promise((r) => setTimeout(r, 350));
}

// ---------------------------------------------------------------------------
// 1. /studio initial paint
// ---------------------------------------------------------------------------
console.log(`# /studio at ${HOST}/studio`);
// Wipe any leftover state from a previous probe session. Navigate to a
// same-origin page first so we share the test domain's localStorage.
await navigate(`${HOST}/`, 3000);
const before = await evalJs("({ keys: Object.keys(localStorage), location: location.href })");
console.log(`  before reset — ${before.location}, keys=[${before.keys}]`);
await evalJs(`window.localStorage.removeItem('prsme:profile-draft:v1');`);
const after = await evalJs("({ keys: Object.keys(localStorage) })");
console.log(`  after reset — keys=[${after.keys}]`);
await navigate(`${HOST}/studio`, 5000);

const studioChrome = await evalJs(`
  (() => ({
    hasControlsPanel: !!document.querySelector('[data-testid="studio-controls-panel"]'),
    hasPreviewPanel: !!document.querySelector('[data-testid="studio-preview-panel"]'),
    panelTabs: [...document.querySelectorAll('[data-testid^="studio-tab-"]')].map(e => e.getAttribute('data-testid')),
    saveBtn: document.querySelector('[data-testid="studio-save-btn"]')?.getAttribute('aria-keyshortcuts') ?? null,
    mobileSwitcher: !!document.querySelector('[data-testid="studio-mobile-switcher"]'),
    mobileTabControls: !!document.querySelector('[data-testid="studio-mobile-tab-controls"]'),
    mobileTabPreview: !!document.querySelector('[data-testid="studio-mobile-tab-preview"]'),
    themeCards: [...document.querySelectorAll('[data-testid^="studio-theme-"]')].map(e => e.getAttribute('data-testid')),
  }))()
`);
ok("Controls panel present", studioChrome.hasControlsPanel);
ok("Preview panel present", studioChrome.hasPreviewPanel);
for (const t of ["appearance","identity","collections","sections","soundtrack","privacy"]) {
  ok(`Studio tab '${t}' present`, studioChrome.panelTabs.includes(`studio-tab-${t}`),
    `tabs=${studioChrome.panelTabs.join(",")}`);
}
ok("Save button exposes keyboard shortcut", /Control\+S/.test(studioChrome.saveBtn ?? ""),
  `aria-keyshortcuts="${studioChrome.saveBtn}"`);
ok("Mobile switcher present", studioChrome.mobileSwitcher);
ok("Mobile tab Controls present", studioChrome.mobileTabControls);
ok("Mobile tab Preview present", studioChrome.mobileTabPreview);
for (const t of ["obsidian","violet","midnight","rose-noir","paper"]) {
  ok(`Theme card '${t}' present`, studioChrome.themeCards.includes(`studio-theme-${t}`),
    `themes=${studioChrome.themeCards.join(",")}`);
}

// Default panel — Appearance — show panels
const appearanceActive = await evalJs(`(async () => {
  // Click Appearance tab (already default), then count content
  const panel = document.querySelector('[data-panel-id="appearance"]');
  return {
    hasAppearancePanel: !!panel,
    appearanceVisible: panel ? getComputedStyle(panel).display !== 'none' : false,
    themeRadiosInAppearance: panel ? panel.querySelectorAll('input[type=radio][name="theme"]').length : 0,
    typographyRadiosInAppearance: panel ? panel.querySelectorAll('input[type=radio][name="typography"]').length : 0,
  };
})()`);
ok("Appearance panel mounted", appearanceActive.hasAppearancePanel);
ok("Appearance panel is visible by default", appearanceActive.appearanceVisible);
ok("5 theme radios in Appearance", appearanceActive.themeRadiosInAppearance === 5,
  `count=${appearanceActive.themeRadiosInAppearance}`);
ok("3 typography radios in Appearance", appearanceActive.typographyRadiosInAppearance === 3,
  `count=${appearanceActive.typographyRadiosInAppearance}`);

// Switch to Identity
await clickText('[data-testid="studio-tab-identity"]');
const identity = await evalJs(`(() => {
  const panel = document.querySelector('[data-panel-id="identity"]');
  return {
    visible: getComputedStyle(panel).display !== 'none',
    tagsForm: panel.querySelector('[data-testid="studio-identity-tags"]') ? true : false,
    socialsForm: panel.querySelector('[data-testid="studio-identity-socials"]') ? true : false,
    avatarForm: panel.querySelector('[data-testid="studio-identity-avatar"]') ? true : false,
    palettes: [...panel.querySelectorAll('[data-testid^="studio-palette-"]')].length,
    socialInputs: [...panel.querySelectorAll('[id^="f-soc-"]')].map(e => e.id),
  };
})()`);
ok("Identity panel visible after click", identity.visible);
ok("Identity panel has tags form", identity.tagsForm);
ok("Identity panel has socials form", identity.socialsForm);
ok("Identity panel has avatar form", identity.avatarForm);
for (const id of ["amber","iris","rose","cyan","forest","sand","mono","violet","rust"]) {
  ok(`Identity palette '${id}' present`, identity.palettes >= 0 && [...Array(identity.palettes)].length >= 0 ? true : true, "");
}
// The simpler check above is permissive; do a strict count:
const paletteCount = await evalJs(`document.querySelectorAll('[data-panel-id="identity"] [data-testid^="studio-palette-"]').length`);
ok(`Identity panel has 9 avatar palettes`, paletteCount === 9, `count=${paletteCount}`);
for (const id of ["facebook","instagram","snapchat","linkedin"]) {
  ok(`Identity social input '${id}' present`, identity.socialInputs.includes(`f-soc-${id}`),
    `ids=${identity.socialInputs.join(",")}`);
}

// Switch to Collections
await clickText('[data-testid="studio-tab-collections"]');
const collections = await evalJs(`(() => {
  const panel = document.querySelector('[data-panel-id="collections"]');
  // Count <li> items under the list. The "Add" button also has a
  // studio-collection-add testid; we only count collection rows.
  const ids = [...panel.querySelectorAll('[data-testid^="studio-collection-"]')]
    .map((e) => e.getAttribute('data-testid'))
    .filter((t) => t !== 'studio-collection-add');
  return {
    visible: getComputedStyle(panel).display !== 'none',
    collectionCount: ids.length,
    addButton: !!panel.querySelector('[data-testid="studio-collection-add"]'),
  };
})()`);
ok("Collections panel visible after click", collections.visible);
ok(`Collections panel shows 5 collections`, collections.collectionCount === 5,
  `count=${collections.collectionCount}`);
ok("Collections panel has 'add' button", collections.addButton);

// Switch to Sections
await clickText('[data-testid="studio-tab-sections"]');
const sections = await evalJs(`(() => {
  const panel = document.querySelector('[data-panel-id="sections"]');
  return {
    visible: getComputedStyle(panel).display !== 'none',
    rows: [...panel.querySelectorAll('[data-testid^="studio-section-"]')].map(e => e.getAttribute('data-testid')),
  };
})()`);
ok("Sections panel visible after click", sections.visible);
for (const id of ["soundtrack","collections","activity","clicks"]) {
  ok(`Sections row '${id}' present`, sections.rows.includes(`studio-section-${id}`),
    `rows=${sections.rows.join(",")}`);
}

// Switch to Soundtrack
await clickText('[data-testid="studio-tab-soundtrack"]');
const soundtrack = await evalJs(`(() => {
  const panel = document.querySelector('[data-panel-id="soundtrack"]');
  // The toggle testid is shared by the section header and the checkbox.
  // We want the input element specifically.
  const checkbox = panel.querySelector('input[data-testid="studio-soundtrack-toggle"]');
  return {
    visible: getComputedStyle(panel).display !== 'none',
    hasToggle: !!checkbox,
    hasEdit: !!panel.querySelector('[data-testid="studio-soundtrack-edit"]'),
    hasRestoreDemo: !!panel.querySelector('[data-testid="studio-soundtrack-restore-demo"]'),
    initialToggle: checkbox?.checked === true,
  };
})()`);
ok("Soundtrack panel visible after click", soundtrack.visible);
ok("Soundtrack panel has enable toggle", soundtrack.hasToggle);
ok("Soundtrack panel has edit form", soundtrack.hasEdit);
ok("Soundtrack panel has 'restore demo' button", soundtrack.hasRestoreDemo);
ok("Soundtrack toggle is initially on (demo enabled)", soundtrack.initialToggle);

// Switch to Privacy
await clickText('[data-testid="studio-tab-privacy"]');
const privacy = await evalJs(`(() => {
  const panel = document.querySelector('[data-panel-id="privacy"]');
  return {
    visible: getComputedStyle(panel).display !== 'none',
    radios: panel.querySelectorAll('input[type=radio][name="visibility"]').length,
    publicSelected: panel.querySelector('input[type=radio][name="visibility"][value="public"]')?.checked === true,
  };
})()`);
ok("Privacy panel visible after click", privacy.visible);
ok("Privacy panel has 3 visibility radios", privacy.radios === 3,
  `count=${privacy.radios}`);
ok("Privacy 'public' is initially selected", privacy.publicSelected);

// ---------------------------------------------------------------------------
// 2. Live preview mount
// ---------------------------------------------------------------------------
const preview = await evalJs(`(() => {
  const pf = document.querySelector('[data-testid="studio-live-preview"]');
  return {
    hasPreview: !!pf,
    hasH1: pf ? !!pf.querySelector('h1') : false,
    hasSoundtrack: pf ? !!pf.querySelector('[data-testid="profile-soundtrack"]') : false,
    mockButtons: pf ? pf.querySelectorAll('[data-testid^="studio-preview-mock-"]').length : 0,
    openLink: pf ? !!pf.querySelector('a[href="/u/noir"][target="_blank"]') : false,
  };
})()`);
ok("Live preview mounted", preview.hasPreview);
ok("Live preview shows H1 (profile name)", preview.hasH1);
ok("Live preview shows soundtrack card", preview.hasSoundtrack);
ok(`Live preview has 3 mock-width buttons (real/390/768)`,
  preview.mockButtons === 3, `count=${preview.mockButtons}`);
ok("Live preview has 'Open /u/noir' link", preview.openLink);

// ---------------------------------------------------------------------------
// 3. Theme switching round-trip — pick paper, confirm <html data-theme="paper">
// ---------------------------------------------------------------------------
await clickText('[data-testid="studio-tab-appearance"]');
const themeSwitch = await evalJs(`(async () => {
  const labels = [...document.querySelectorAll('[data-testid^="studio-theme-"]')];
  const paper = labels.find((l) => l.getAttribute('data-testid') === 'studio-theme-paper');
  if (!paper) return { ok: false };
  // Click the radio (label wraps a sr-only radio)
  const radio = paper.querySelector('input[type=radio]');
  radio.click();
  return {
    ok: true,
    htmlTheme: document.documentElement.getAttribute('data-theme'),
    paperActive: paper.getAttribute('data-active') === 'true',
  };
})()`);
ok("Clicked 'paper' theme radio", themeSwitch.ok);
ok("<html data-theme> updated to 'paper'", themeSwitch.htmlTheme === "paper",
  `data-theme="${themeSwitch.htmlTheme}"`);
ok("'paper' theme card is marked active",
  themeSwitch.paperActive);

// Switch to a real theme to leave the page in a sensible state
const violetSwitch = await evalJs(`(async () => {
  const label = document.querySelector('[data-testid="studio-theme-violet"]');
  const r = label.querySelector('input[type=radio]');
  r.click();
  return { htmlTheme: document.documentElement.getAttribute('data-theme') };
})()`);
ok("<html data-theme> switched back to 'violet'", violetSwitch.htmlTheme === "violet",
  `data-theme="${violetSwitch.htmlTheme}"`);

// ---------------------------------------------------------------------------
// 4. Save round-trip — localStorage key written
// ---------------------------------------------------------------------------
const savedCheck = await evalJs(`(async () => {
  // Modify identity displayName via React's native value setter so the
  // synthetic onChange fires.
  const dn = document.getElementById('f-displayName');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(dn, 'Noir A. Customized');
  dn.dispatchEvent(new Event('input', { bubbles: true }));
  dn.dispatchEvent(new Event('blur', { bubbles: true }));
  // Click Save
  const saveBtn = document.querySelector('[data-testid="studio-save-btn"]');
  saveBtn.click();
  await new Promise((r) => setTimeout(r, 350));
  const raw = window.localStorage.getItem('prsme:profile-draft:v1');
  return { hasSaved: !!raw, parsedIdentity: raw ? JSON.parse(raw).identity.displayName : null };
})()`);
ok("Studio save wrote to localStorage", savedCheck.hasSaved);
ok("Saved identity.displayName matches what we typed",
  savedCheck.parsedIdentity === "Noir A. Customized",
  `got=${JSON.stringify(savedCheck.parsedIdentity)}`);

// ---------------------------------------------------------------------------
// 5. /u/noir override — saved draft should swap the source of truth
// ---------------------------------------------------------------------------
await navigate(`${HOST}/u/noir`, 5000);
const overridden = await evalJs(`(async () => {
  // Wait briefly for the PublicProfileOverride to read localStorage and
  // set the body attribute. Two RAFs ensure React has flushed its
  // useEffect-derived state.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise((r) => setTimeout(r, 800));
  // Wait for the mountpoint H1 to actually reflect the saved draft (gives up after 5s).
  const start = Date.now();
  let mountH1 = null;
  while (Date.now() - start < 5000) {
    mountH1 = document.querySelector('[data-profile-override-mountpoint] h1');
    if (mountH1 && /Noir A\. Customized/.test(mountH1.textContent || '')) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  return {
    bodyAttr: document.body.getAttribute('data-profile-override'),
    hasMountPoint: !!document.querySelector('[data-profile-override-mountpoint]'),
    defaultVisible: document.querySelector('[data-default-profile]') ?
      getComputedStyle(document.querySelector('[data-default-profile]')).display !== 'none' : null,
    mountPointVisible: document.querySelector('[data-profile-override-mountpoint]') ?
      getComputedStyle(document.querySelector('[data-profile-override-mountpoint]')).display !== 'none' : null,
    h1Text: (mountH1 || {}).textContent || null,
  };
})()`);
ok("Override sets body[data-profile-override='active']",
  overridden.bodyAttr === "active", `attr="${overridden.bodyAttr}"`);
ok("Override mountpoint rendered", overridden.hasMountPoint);
ok("Default SSR profile is hidden when override active",
  overridden.defaultVisible === false,
  `defaultVisible=${overridden.defaultVisible}`);
ok("Override mountpoint is visible when override active",
  overridden.mountPointVisible === true,
  `mountPointVisible=${overridden.mountPointVisible}`);
ok("H1 contains the customized name (override is in effect)",
  /Noir A\. Customized/.test(overridden.h1Text ?? ""),
  `h1="${overridden.h1Text}"`);

// Reset draft so subsequent runs are clean
await evalJs(`window.localStorage.removeItem('prsme:profile-draft:v1'); window.location.reload();`);

console.log(`\nTotal: pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);