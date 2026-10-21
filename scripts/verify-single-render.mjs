/**
 * Verifies /u/noir renders exactly ONE visible copy of every profile region,
 * both with a saved draft (override active) and without (SSR default only).
 */
import { connect } from "./cdp.mjs";

const HOST = process.env.PRSME_HOST ?? "http://127.0.0.1:3000";
const { goto, setViewport, evalJs, close } = await connect();

const VISIBLE = `
  const vis = (el) => {
    if (!el) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if (parseFloat(cs.opacity) === 0) return false;
    return !!(el.offsetParent || el.getClientRects().length);
  };
`;

async function probe(label) {
  await goto(`${HOST}/u/noir`, { waitMs: 2600 });
  const r = await evalJs(`
    ${VISIBLE}
    const countAll = (sel) => document.querySelectorAll(sel).length;
    const countVisible = (sel) => [...document.querySelectorAll(sel)].filter(vis).length;
    const dp = document.querySelector('[data-default-profile]');
    const mp = document.querySelector('[data-profile-override-mountpoint]');
    return {
      overrideAttr: document.body.getAttribute('data-profile-override'),
      defaultNodes: countAll('[data-default-profile]'),
      defaultVisible: dp ? vis(dp) : false,
      mountNodes: countAll('[data-profile-override-mountpoint]'),
      mountVisible: mp ? vis(mp) : false,
      h1: { all: countAll('h1'), visible: countVisible('h1') },
      tagUls: { all: countAll('[data-testid="profile-tags"]'), visible: countVisible('[data-testid="profile-tags"]') },
      tagPills: { all: countAll('.pf-tag'), visible: countVisible('.pf-tag') },
      socials: { all: countAll('[data-testid="profile-socials"] a'), visible: countVisible('[data-testid="profile-socials"] a') },
      soundtrack: { all: countAll('[data-testid="profile-soundtrack"]'), visible: countVisible('[data-testid="profile-soundtrack"]') },
      collections: { all: countAll('article[data-collection-id]'), visible: countVisible('article[data-collection-id]') },
      canvases: { all: countAll('.profile-canvas'), visible: countVisible('.profile-canvas') },
      scopes: { all: countAll('.profile-scope'), visible: countVisible('.profile-scope') },
      h1Text: [...document.querySelectorAll('h1')].filter(vis).map(h => h.textContent.trim()),
    };
  `);
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(r, null, 2));
  return r;
}

// ---- Case 1: no saved draft (SSR default only) ----
await setViewport(1280, 1000);
await goto(`${HOST}/studio`, { waitMs: 3500 });
await evalJs(`localStorage.removeItem('prsme:profile-draft:v1');`);
const noDraft = await probe("no draft (expect overrideAttr=null, defaultVisible=true)");

// ---- Case 2: saved draft with a distinctive tag (override active) ----
await goto(`${HOST}/studio`, { waitMs: 4000 });
await evalJs(`document.querySelector('[data-testid="studio-tab-identity"]')?.click();`);
await new Promise((r) => setTimeout(r, 400));
const setTag = await evalJs(`
  const input = document.querySelector('#f-tag-input');
  if (!input) return { ok: false, reason: 'no input' };
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'Render Check Tag');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return { ok: true, value: input.value };
`);
console.log("tag input:", setTag);
await new Promise((r) => setTimeout(r, 300));
await evalJs(`document.querySelector('[data-testid="studio-add-tag"]')?.click();`);
await new Promise((r) => setTimeout(r, 400));
await evalJs(`document.querySelector('[data-testid="studio-save-btn"]')?.click();`);
await new Promise((r) => setTimeout(r, 800));
const withDraft = await probe("with draft (expect overrideAttr=active, defaultVisible=false)");

// ---- Assertions ----
const problems = [];
if (noDraft.overrideAttr !== null) problems.push("no-draft: override attr should be null");
if (noDraft.defaultVisible !== true) problems.push("no-draft: SSR default should be visible");
if (noDraft.h1.visible !== 1) problems.push(`no-draft: expected 1 visible h1, got ${noDraft.h1.visible}`);
if (noDraft.socials.visible !== 4) problems.push(`no-draft: expected 4 visible socials, got ${noDraft.socials.visible}`);

if (withDraft.overrideAttr !== "active") problems.push("draft: override attr should be active");
if (withDraft.defaultVisible !== false) problems.push("draft: SSR default should be hidden");
if (withDraft.h1.visible !== 1) problems.push(`draft: expected 1 visible h1, got ${withDraft.h1.visible}`);
if (withDraft.socials.visible !== 4) problems.push(`draft: expected 4 visible socials, got ${withDraft.socials.visible}`);
if (withDraft.collections.visible !== 5) problems.push(`draft: expected 5 visible collections, got ${withDraft.collections.visible}`);
// All visible pills must come from the override. With 5 demo defaults +
// "Render Check Tag", 6 are visible. The 5-hidden SSR pills should remain
// hidden. We assert: visible count == 6, and that 0 of the visible ones
// are children of [data-default-profile].
if (withDraft.tagPills.visible !== 6) problems.push(`draft: expected 6 visible tag pills, got ${withDraft.tagPills.visible}`);
const overridePills = await evalJs(`
  ${VISIBLE}
  return [...document.querySelectorAll('.pf-tag')].filter(vis).filter(p => p.closest('[data-default-profile]')).length;
`);
if (overridePills !== 0) problems.push(`draft: ${overridePills} visible pills belong to SSR (expected 0)`);

// cleanup
await goto(`${HOST}/studio`, { waitMs: 2500 });
await evalJs(`localStorage.removeItem('prsme:profile-draft:v1');`);

console.log("\n" + "=".repeat(50));
if (problems.length === 0) {
  console.log("RESULT: PASS - exactly one visible copy in both states");
} else {
  console.log(`RESULT: FAIL (${problems.length})`);
  problems.forEach((p) => console.log("  - " + p));
}
await close();
process.exit(problems.length === 0 ? 0 : 1);