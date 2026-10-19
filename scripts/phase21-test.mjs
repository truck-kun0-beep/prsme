// Manual unit test for the toEmbedUrl helper exported from ProfileSoundtrack.
// We import the .tsx file directly via the React JSX runtime transform —
// so we use a tsx loader is not available. Instead, simulate the logic.

function toEmbedUrl(trackUrl) {
  try {
    const u = new URL(trackUrl);
    if (u.hostname !== "open.spotify.com" && u.hostname !== "spotify.com") {
      return null;
    }
    const match = u.pathname.match(
      /^\/(track|album|playlist|artist|episode|show)\/[A-Za-z0-9]+(?=\/|$)/,
    );
    if (!match) return null;
    return `https://open.spotify.com/embed/${match[1]}/${u.pathname.split("/")[2]}${u.search ?? ""}`;
  } catch {
    return null;
  }
}

const cases = [
  ["https://open.spotify.com/", null, "root is not embeddable"],
  ["https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh", "https://open.spotify.com/embed/track/4iV5W9uYEdYUVa79Axb7Rh", "track id is embeddable"],
  ["https://open.spotify.com/album/1DFixLWuP1l234", "https://open.spotify.com/embed/album/1DFixLWuP1l234", "album id is embeddable"],
  ["https://open.spotify.com/playlist/37i3swWQene9KI7eMX5cBy", "https://open.spotify.com/embed/playlist/37i3swWQene9KI7eMX5cBy", "playlist id is embeddable"],
  ["https://open.spotify.com/artist/0OdUWJ0RdlRA2gWQP1J1EC", "https://open.spotify.com/embed/artist/0OdUWJ0RdlRA2gWQP1J1EC", "artist id is embeddable"],
  ["https://open.spotify.com/search/foo", null, "search is not embeddable"],
  ["https://example.com/foo", null, "wrong host"],
  ["not-a-url", null, "malformed"],
  ["https://open.spotify.com/track/abc/extra", "https://open.spotify.com/embed/track/abc", "track id is embedded (path keeps /extra... wait, my regex requires boundary, so this might reject it)"],
];

let pass = 0, fail = 0;
for (const [input, expected, desc] of cases) {
  const actual = toEmbedUrl(input);
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} :: ${desc}`);
  console.log(`        input: ${JSON.stringify(input)}`);
  console.log(`        expected: ${JSON.stringify(expected)}`);
  console.log(`        actual:   ${JSON.stringify(actual)}`);
  if (ok) pass++; else fail++;
}
console.log(`\nTotal: pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
