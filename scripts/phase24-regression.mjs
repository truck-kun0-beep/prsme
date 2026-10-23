// Phase 2.4 regression sweep — confirms prior-phase components are still
// wired correctly: Share dialog trigger, My Clicks gallery present,
// collections list rendered. Pure HTML parsing via fetch + tiny matchers,
// no jsdom dependency.

const HOST = process.env.PRSME_HOST ?? "http://127.0.0.1:3939";

function strip(html, tag) {
  // Replace <tag…>…</tag> with "" — no recursion; not for nested tags.
  return html.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, "gi"), "");
}

function presenceCount(html, literal) {
  return (html.match(new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
}

function countSubstrings(html, needle) {
  if (!needle) return 0;
  return (html.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
}

async function fetchStatus(path) {
  const r = await fetch(`${HOST}${path}`);
  return r.status;
}

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) { pass++; console.log(`PASS  ${label}`); }
  else { fail++; console.log(`FAIL  ${label}${detail ? " :: " + detail : ""}`); }
};

const profile = await fetch(`${HOST}/u/noir`).then(r => r.text());

// Profile header
ok("Profile header h1 contains 'Noir Aldridge'",
  /<h1[^>]*>\s*Noir Aldridge\s*<\/h1>/.test(profile),
  "");

ok("Share button id='share-profile-btn' present",
  /id="share-profile-btn"/.test(profile),
  "");

// Profile section text: location once, pronouns once, no "Public profile"
const profileSection = (() => {
  const m = profile.match(/<section[^>]*id="profile"[\s\S]*?<\/section>/i);
  return m ? m[0] : "";
})();

ok("'Public profile' label absent in profile section",
  !/public profile/i.test(profileSection),
  "");
ok("Location 'Berlin' present once in profile section",
  countSubstrings(profileSection, "Berlin") === 1,
  `count=${countSubstrings(profileSection, "Berlin")}`);
ok("Pronouns 'she/her' appear once in profile section",
  countSubstrings(profileSection, "she/her") === 1,
  `count=${countSubstrings(profileSection, "she/her")}`);

// Soundtrack card
const soundtrackMatch = profile.match(/<article[^>]*data-testid="profile-soundtrack"[\s\S]*?<\/article>/);
const soundtrack = soundtrackMatch ? soundtrackMatch[0] : "";

ok("Single soundtrack surface", !!soundtrack, "");

const soundtrackIframes = soundtrack ? countSubstrings(soundtrack, "<iframe") : 0;
ok("No iframes in soundtrack", soundtrackIframes === 0, `count=${soundtrackIframes}`);

const fakeBtn = soundtrack ? /<button\b[^>]*aria-label="[^"]*(?:listen to|stop|pause|play)[^"]*"/i.test(soundtrack) : true;
ok("No fake Listen/Stop audio buttons in soundtrack (only an <a>)", !fakeBtn, "");

const externalLinks = soundtrack ? (soundtrack.match(/<a\b[^>]*target="_blank"[^>]*rel="[^"]*noopener[^"]*"/g) || []).length : 0;
ok("Exactly one external Listen anchor with target=_blank rel=noopener",
  externalLinks === 1, `count=${externalLinks}`);

const linkText = soundtrack
  ? soundtrack.match(/<a\b[^>]*target="_blank"[^>]*rel="[^"]*noopener[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
  : null;
const linkTextNormalized = linkText ? linkText[1].replace(/<[^>]*>/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, " ").trim() : "";
// Phase 2.5: the visible link content is now logo-only — the visible text
// is empty and the brand identity lives in the inline SVG. We confirm the
// accessible name instead.
ok("Listen anchor has no visible Spotify text (logo-only, Phase 2.5)",
  !/(listen\s+on|spotify)/i.test(linkTextNormalized),
  `text="${linkTextNormalized}"`);

/*
 * Provider-agnostic soundtrack assertions.
 *
 * These two used to hardcode Spotify: an `aria-label` matching /on spotify/ and a
 * `href` pointing at one specific open.spotify.com album id. Both stopped holding
 * in Phase 4.5, when the card became provider-aware — the demo's `externalUrl` is
 * the Apple Music destination, and `ProfileSoundtrack` deliberately labels and
 * glyphs from whichever URL it actually opens, so the mark can never contradict
 * the destination.
 *
 * The intent of each assertion is preserved and is in fact checked more strictly:
 * the accessible name must name the provider the link really opens, and the href
 * must be that provider's real domain. `PROVIDERS` is derived from the rendered
 * `data-provider` attribute, so this passes for any provider and fails the moment
 * the label and the destination disagree — which is the bug a hardcoded Spotify
 * string would have hidden.
 */
const providerAttr = soundtrack.match(/data-provider="([a-z]+)"/);
const provider = providerAttr ? providerAttr[1] : null;
const PROVIDERS = {
  spotify: { label: /on spotify/i, host: /^https:\/\/open\.spotify\.com\// },
  apple: { label: /on apple music/i, host: /^https:\/\/music\.apple\.com\// },
};
const providerRule = provider ? PROVIDERS[provider] : null;

/*
 * Read the href off the anchor itself rather than pattern-matching the whole
 * fragment. The Apple Music URL contains a query string (`?i=…`), and the HTML
 * escapes its `&` — matching the raw document text would either miss the URL or
 * be brittle against entity encoding.
 */
const linkHref = (soundtrack.match(/<a\b[^>]*\bhref="([^"]+)"/i) || [])[1] || "";

ok("Soundtrack card declares its provider",
  Boolean(provider && providerRule), `provider=${provider}`);

ok("Listen anchor accessible name names its actual provider",
  providerRule ? providerRule.label.test(soundtrack) : false,
  `provider=${provider}`);

ok("Listen anchor contains an inline SVG (brand glyph)",
  /<a\b[^>]*target="_blank"[^>]*rel="[^"]*noopener[^"]*"[^>]*>[\s\S]*?<svg\b/i.test(soundtrack),
  "");

ok("Listen anchor points at its actual provider's domain",
  providerRule ? providerRule.host.test(linkHref) : false,
  `provider=${provider} href=${linkHref}`);

const headingsInSoundtrack = soundtrack ? (soundtrack.match(/<h[1-6]\b|<[^>]*role="heading"/g) || []).length : 0;
ok("Exactly one heading inside soundtrack", headingsInSoundtrack === 1, `count=${headingsInSoundtrack}`);

const imagesInSoundtrack = soundtrack ? countSubstrings(soundtrack, "<img ") : 0;
ok("Exactly one image inside soundtrack", imagesInSoundtrack === 1, `count=${imagesInSoundtrack}`);

// Collections + Activity + My Clicks
ok("At least one collection heading",
  (profile.match(/<h3[^>]*id="col-/g) || []).length >= 1,
  `count=${(profile.match(/<h3[^>]*id="col-/g) || []).length}`);
ok("My Clicks section present", /My Clicks/.test(profile), "");
ok("Activity ledger present", /What.{0,2}s been on the shelf/i.test(profile), "");
ok("Instructional 'press play inside…' sentence absent",
  !/press play inside/i.test(profile),
  "");

// Route sanity
ok("/u/foo returns 404", await fetchStatus("/u/foo") === 404, "");
ok("/bogus returns 404", await fetchStatus("/bogus") === 404, "");
ok("Landing / returns 200", await fetchStatus("/") === 200, "");

console.log(`\nTotal: pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);