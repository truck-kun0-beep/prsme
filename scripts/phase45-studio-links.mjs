// Drive the Studio Custom Links panel: add, edit, reorder, remove, validate.
import { connect } from "./cdp.mjs";

const HOST = process.env.PRSME_HOST ?? "http://127.0.0.1:3000";
const browser = await connect();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (l, c, d = "") => {
  if (c) { pass++; console.log(`PASS  ${l}`); } else { fail++; console.log(`FAIL  ${l} :: ${JSON.stringify(d)}`); }
};

const setVal = (sel, value) => browser.evalJs(`
  const el = document.querySelector('${sel}');
  if (!el) return { ok: false };
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement : window.HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value').set;
  setter.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return { ok: true };
`, { once: true });

const rows = () => browser.evalJs(`
  return Array.from(document.querySelectorAll('[data-testid^="studio-links-row-"]'))
    .map(li => ({
      id: li.getAttribute('data-testid').replace('studio-links-row-', ''),
      label: li.querySelector('p') ? li.querySelector('p').textContent.trim() : null,
      url: li.querySelectorAll('p')[1] ? li.querySelectorAll('p')[1].textContent.trim() : null,
    }));
`, { once: true });

await browser.setViewport(1400, 1000);

/*
 * Clear storage ONCE, on the current page.
 *
 * `browser.seed(null)` installs a Page.addScriptToEvaluateOnNewDocument script
 * that removes the draft key on EVERY navigation — so it would have wiped the
 * very save this suite is trying to verify. A one-off localStorage clear after
 * the first load is the correct setup.
 */
await browser.goto(`${HOST}/studio`, { waitMs: 6000 });
await browser.evalJs(`localStorage.removeItem('prsme:profile-draft:v1'); return true;`, { once: true });
await browser.goto(`${HOST}/studio`, { waitMs: 6000 });
await wait(1500);

await browser.evalJs(`document.querySelector('[data-testid="studio-tab-links"]')?.click();`, { once: true });
await wait(900);

ok("panel: Custom Links tab exists and opens",
  Boolean(await browser.evalJs(`
    const p = document.querySelector('[data-panel-id="links"]');
    return p && !p.hidden && !!p.querySelector('[data-testid="studio-links-editor"]');
  `)));

/* ---- 1. Reject an invalid entry ---- */
await setVal('#custom-link-label', 'Bad');
await setVal('#custom-link-url', 'not-a-url');
await browser.evalJs(`document.querySelector('[data-testid="studio-links-save"]').click();`, { once: true });
await wait(600);
const afterBad = await rows();
ok("validation: invalid URL is rejected", afterBad.length === 0, afterBad);
const errShown = await browser.evalJs(`
  return !!document.querySelector('[data-testid="studio-links-editor"] [role="alert"]');
`, { once: true });
ok("validation: an error message is shown", errShown);

/* ---- 2. Blank label is rejected ---- */
await setVal('#custom-link-label', '   ');
await setVal('#custom-link-url', 'https://example.com/ok');
await browser.evalJs(`document.querySelector('[data-testid="studio-links-save"]').click();`, { once: true });
await wait(600);
ok("validation: blank label is rejected", (await rows()).length === 0);

/* ---- 3. http:// is rejected (https only) ---- */
await setVal('#custom-link-label', 'Insecure');
await setVal('#custom-link-url', 'http://example.com/insecure');
await browser.evalJs(`document.querySelector('[data-testid="studio-links-save"]').click();`, { once: true });
await wait(600);
ok("validation: http:// is rejected", (await rows()).length === 0);

/* ---- 4. Add three valid buttons ---- */
for (const [label, url] of [
  ["Portfolio", "https://example.com/portfolio"],
  ["Print shop", "https://example.com/shop"],
  ["Newsletter", "https://example.com/news"],
]) {
  await setVal('#custom-link-label', label);
  await setVal('#custom-link-url', url);
  await browser.evalJs(`document.querySelector('[data-testid="studio-links-save"]').click();`, { once: true });
  await wait(500);
}
const three = await rows();
ok("add: three buttons saved", three.length === 3, three);
ok("add: ids are stable, not indexes",
  three.every((r, i) => r.id !== String(i)) && new Set(three.map(r => r.id)).size === 3,
  three.map(r => r.id));

/* ---- 5. Preview uses the real public component ---- */
const preview = await browser.evalJs(`
  const btns = Array.from(document.querySelectorAll('[data-testid="studio-links-preview-scope"] [data-testid="custom-link"]'));
  return btns.map(b => ({ text: b.textContent.trim(), href: b.getAttribute('href'), rel: b.getAttribute('rel') }));
`, { once: true });
ok("preview: renders the real public buttons",
  preview.length === 3 && preview.every(b => b.rel === "noopener noreferrer"), preview);
ok("preview: URL is never the visible label",
  preview.every(b => !/https?:/.test(b.text)), preview.map(b => b.text));

/* ---- 6. Reorder ---- */
const beforeMove = (await rows()).map(r => r.id);
const secondId = beforeMove[1];
await browser.evalJs(`document.querySelector('[data-testid="studio-links-up-${secondId}"]').click();`, { once: true });
await wait(600);
const afterMove = (await rows()).map(r => r.id);
ok("reorder: second button moved to first",
  afterMove[0] === secondId && afterMove.length === beforeMove.length &&
  afterMove.sort().join() === beforeMove.sort().join(),
  { beforeMove, afterMove });

/* ---- 7. Edit ---- */
const editId = (await rows())[2].id;
await browser.evalJs(`document.querySelector('[data-testid="studio-links-edit-${editId}"]').click();`, { once: true });
await wait(500);
await setVal('#custom-link-label', 'Renamed link');
await browser.evalJs(`document.querySelector('[data-testid="studio-links-save"]').click();`, { once: true });
await wait(600);
const afterEdit = await rows();
ok("edit: label updated in place",
  afterEdit.find(r => r.id === editId)?.label === "Renamed link", afterEdit);
ok("edit: count unchanged", afterEdit.length === 3, afterEdit.length);

/* ---- 8. Remove ---- */
const rmId = afterEdit[0].id;
await browser.evalJs(`document.querySelector('[data-testid="studio-links-remove-${rmId}"]').click();`, { once: true });
await wait(600);
const afterRemove = await rows();
ok("remove: exactly one button removed",
  afterRemove.length === 2 && !afterRemove.some(r => r.id === rmId), afterRemove);

/* ---- 9. Save, then confirm on /u/noir ---- */
await browser.evalJs(`document.querySelector('[data-testid="studio-save-btn"]')?.click();`, { once: true });
await wait(900);
await browser.goto(`${HOST}/u/noir`, { waitMs: 4500 });
await wait(1800);

const onProfile = await browser.evalJs(`
  const btns = Array.from(document.querySelectorAll('[data-testid="custom-link"]'));
  const stored = JSON.parse(localStorage.getItem('prsme:profile-draft:v1') || 'null');
  return {
    labels: btns.map(b => b.textContent.trim()),
    hrefs: btns.map(b => b.getAttribute('href')),
    storedLabels: stored ? (stored.customLinks || []).map(l => l.label) : null,
  };
`, { once: true });
ok("persist: saved buttons appear on /u/noir",
  onProfile.labels.length === 2 && onProfile.labels.includes("Renamed link"), onProfile);
ok("persist: stored in the local draft",
  Array.isArray(onProfile.storedLabels) && onProfile.storedLabels.length === 2, onProfile.storedLabels);
ok("persist: edited label persisted", onProfile.storedLabels.includes("Renamed link"));

/* ---- 10. Empty after removing all -> section hidden ---- */
await browser.goto(`${HOST}/studio`, { waitMs: 4500 });
await wait(1500);
await browser.evalJs(`document.querySelector('[data-testid="studio-tab-links"]')?.click();`, { once: true });
await wait(800);
for (const r of await rows()) {
  await browser.evalJs(`document.querySelector('[data-testid="studio-links-remove-${r.id}"]').click();`, { once: true });
  await wait(500);
}
await browser.evalJs(`document.querySelector('[data-testid="studio-save-btn"]')?.click();`, { once: true });
await wait(900);
await browser.goto(`${HOST}/u/noir`, { waitMs: 4500 });
await wait(1800);
const hidden = await browser.evalJs(`
  return {
    section: !!document.querySelector('[data-testid="custom-links"]'),
    buttons: document.querySelectorAll('[data-testid="custom-link"]').length,
  };
`, { once: true });
ok("empty: removing all buttons hides the section entirely",
  !hidden.section && hidden.buttons === 0, hidden);

/* ---- 11. Reset restores the demo buttons ---- */
await browser.goto(`${HOST}/studio`, { waitMs: 4500 });
await wait(1500);
await browser.evalJs(`
  document.querySelector('[data-testid="studio-reset-btn"]')?.click();
  await new Promise(r => setTimeout(r, 400));
  document.querySelector('[data-testid="studio-reset-confirm-btn"]')?.click();
`, { once: true });
await wait(1200);
await browser.evalJs(`document.querySelector('[data-testid="studio-tab-links"]')?.click();`, { once: true });
await wait(800);
const afterReset = await rows();
ok("reset: demo buttons restored",
  afterReset.length === 3 && afterReset.some(r => r.label === "Portfolio"), afterReset);

console.log(`\n--- ${pass} pass, ${fail} fail ---`);
await browser.close();
process.exitCode = fail ? 1 : 0;