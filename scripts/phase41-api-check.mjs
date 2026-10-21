// Phase 4.1 — verify every provider end-to-end against the REAL running app.
// No mocks. Every result reported is what the app actually returned.
const HOST = process.env.PRSME_HOST ?? "http://127.0.0.1:3000";

async function j(url) {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

const cases = [
  { kind: "movie", q: "Interstellar", mustMatch: "interstellar" },
  { kind: "tv", q: "Crash Landing on You", mustMatch: "crash landing" },
  { kind: "tv", q: "Game of Thrones", mustMatch: "game of thrones" },
  { kind: "song", q: "Around the World Daft Punk", mustMatch: "around the world" },
  { kind: "album", q: "Random Access Memories", mustMatch: "random access memories" },
  { kind: "manga", q: "Fullmetal Alchemist", mustMatch: "fullmetal" },
  { kind: "book", q: "The Hobbit", mustMatch: "hobbit" },
];

let pass = 0;
let fail = 0;

for (const c of cases) {
  const { status, body } = await j(`${HOST}/api/media/search?kind=${c.kind}&q=${encodeURIComponent(c.q)}`);
  const results = body.results ?? [];
  const providers = (body.providers ?? []).map((p) => `${p.provider}:${p.status}`).join(", ");
  const match = results.find((r) => (r.title ?? "").toLowerCase().includes(c.mustMatch.toLowerCase()));
  const withArt = results.filter((r) => r.coverUrl).length;
  const ok = status === 200 && Boolean(match) && Boolean(match?.coverUrl);
  ok ? pass++ : fail++;
  console.log(`[${ok ? "PASS" : "FAIL"}] ${c.kind} "${c.q}"`);
  console.log(`   providers: ${providers || "(none)"}  degraded=${body.degraded}  total=${results.length}  withArtwork=${withArt}`);
  console.log(`   first: ${results[0] ? `${results[0].title} (${results[0].provider}${results[0].year ? ", " + results[0].year : ""})` : "none"}`);
  console.log(`   match: ${match ? `${match.title} | kind=${match.kind} | id=${match.id} | cover=${String(match.coverUrl).slice(0, 72)}` : "NONE"}`);
  if (!ok) console.log(`   provider messages: ${JSON.stringify((body.providers ?? []).map((p) => p.message).filter(Boolean))}`);
  console.log("");
}

console.log(`\n${pass}/${pass + fail} PASS`);
process.exit(fail === 0 ? 0 : 1);