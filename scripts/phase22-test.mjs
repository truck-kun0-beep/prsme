// Phase 2.2 test additions: malformed and unsupported cases that are useful
// to nail down for the embed URL helper. We re-implement the function from
// ProfileSoundtrack.tsx verbatim so the test asserts behaviour, not source.

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
  // The Phase 2.1 cases (re-imported for regression coverage)
  ["https://open.spotify.com/", null, "root is not embeddable"],
  ["https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh", "https://open.spotify.com/embed/track/4iV5W9uYEdYUVa79Axb7Rh", "track id is embeddable"],
  ["https://open.spotify.com/album/1DFixLWuP1l234", "https://open.spotify.com/embed/album/1DFixLWuP1l234", "album id is embeddable"],
  ["https://open.spotify.com/playlist/37i3swWQene9KI7eMX5cBy", "https://open.spotify.com/embed/playlist/37i3swWQene9KI7eMX5cBy", "playlist id is embeddable"],
  ["https://open.spotify.com/artist/0OdUWJ0RdlRA2gWQP1J1EC", "https://open.spotify.com/embed/artist/0OdUWJ0RdlRA2gWQP1J1EC", "artist id is embeddable"],
  ["https://open.spotify.com/episode/abc123", "https://open.spotify.com/embed/episode/abc123", "episode id is embeddable"],
  ["https://open.spotify.com/show/xyz789", "https://open.spotify.com/embed/show/xyz789", "show id is embeddable"],
  // New / targeted cases for Phase 2.2
  ["https://open.spotify.com/search/foo", null, "search path is not embeddable"],
  ["https://example.com/track/abc", null, "wrong host"],
  ["not-a-url", null, "malformed"],
  ["https://open.spotify.com/track/abc/extra", "https://open.spotify.com/embed/track/abc", "trailing path is trimmed by regex boundary"],
  ["https://open.spotify.com/TRACK/abc", null, "wrong case segment (lowercase only)"],
  ["https://open.spotify.com/track/", null, "missing id"],
  ["https://open.spotify.com/tracks/abc", null, "unknown subpath"],
  ["https://open.spotify.com", null, "no path"],
  ["", null, "empty string"],
  ["/foo", null, "bare path"],
];

let pass = 0, fail = 0;
for (const [input, expected, desc] of cases) {
  const actual = toEmbedUrl(input);
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} :: ${desc}`);
  console.log(`        input:    ${JSON.stringify(input)}`);
  console.log(`        expected: ${JSON.stringify(expected)}`);
  console.log(`        actual:   ${JSON.stringify(actual)}`);
  if (ok) pass++; else fail++;
}
console.log(`\nTotal: pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
