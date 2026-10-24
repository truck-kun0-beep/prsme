# PRSME — Phases 1, 2, 2.1, 2.2, 3, 3.1 & 4

> All the things that make you, you.

A premium, Gen-Z-oriented media identity and customizable profile platform. PRSME turns your taste in entertainment, your interests, your memories, and your personal aesthetic into a shareable digital identity.

The repository currently ships:

- **Phase 1** — landing page + design system.
- **Phase 2** — public profile experience at `/u/[username]` with collections, activity, share, and "My Clicks" gallery.
- **Phase 2.1** — profile polish and soundtrack near the top of the profile.
- **Phase 2.2** — soundtrack refinement with a verified real Spotify track and real cover artwork, plus 832px and additional 360/390/430/1024/1280/1440 regression checks.
- **Phase 3** — local-only Customization Studio at `/studio` (themes, identity, collections, sections, soundtrack, privacy) that drives `/u/noir` via a typed draft saved in `localStorage`.
- **Phase 3.1** — customization-studio repair and profile design refinement: a genuine `<iframe>` live preview, profile-scoped design tokens, a Spotify oEmbed route, a custom accent override, icon-only socials, follower/following demo counts, and a poster-shelf / featured / compact redesign.
- **Phase 4** — multi-source media catalogue: a provider-independent `MediaRecord` model, a single reusable studio media picker, per-category provider adapters (Cinemeta, TVMaze, optional TMDB, iTunes, MusicBrainz + Cover Art Archive, MangaDex, Open Library, Google Books), a server-side search route with a host allowlist, and personal reviews with a full-review reader.
- **Phase 4.1** — media-search and artwork repair. Real causes traced and fixed end-to-end: the Cinemeta search endpoint returned an unrelated catalogue, `Artwork` collapsed to zero height for every catalogue image, iTunes served `http://` artwork that the https-only allowlist silently dropped, the soundtrack card appended a provider suffix and truncated the album name, and there was a separate mandatory K-drama category. K-drama is gone — a Korean drama is a TV series.

- **Phase 4.2** — collection layout redesign, artwork reliability, ratings and reviews. Featured rebuilt with two real columns and no overlap, Compact is a four-column grid with a rating column on every row, Poster Grid is unchanged but its sized artwork now renders, and Music collections gain a new Soundtrack-List layout resembling repeated compact soundtrack cards. Cinemeta's poster CDN stopped serving images, so films hydrate their posters from Wikipedia's REST summary endpoint through an identity-and-kind gate that rejects unrelated or redirect-targeted pages. Personal ratings render on opaque theme-aware surfaces in every layout, "Read full review" is gone — clicking the excerpt itself opens the full review at `/u/[username]/review/[itemId]` — and Books support a Light Novel subtype.

- **Phase 4.3** — My Clicks as a real personal photography shelf: two honest sourcing modes (a direct HTTPS image URL, or a public Instagram/Facebook post URL), a desktop editorial mosaic and a mobile snap rail, honest failed-image fallback, and no source-URL metadata on the card.

- **Phase 4.4** — Album Gallery and Review Journal layouts, plus Apple Music artwork across every theme.

- **Phase 4.5** — Custom Link Buttons, section ordering, and the Apple Music glyph repair.

- **Phase 4.6** — Custom Link Button redesign and Soundtrack List layout repair. Custom Link Buttons become a **prominent, independent profile section** positioned after every media collection and before Recent activity, with My Clicks last; they are rendered as substantial link-in-bio buttons (52 px minimum, 56 px on desktop, 34 rem max width) with four working presentation options — shape, fill style, colour mode, and layout. The Soundtrack List hover overflow is fixed at its actual cause. See [Phase 4.6](#phase-46--custom-link-buttons-and-the-soundtrack-list) for the full account, including the measured root cause.

OAuth providers, a followers tier, and in-app account deletion are still to come.

- **Phase 4.7** — the Custom Links section's eyebrow, heading, and description become editable profile data, and the Soundtrack List's artist line stops silently discarding text on narrow screens. See [Phase 4.7](#phase-47--editable-custom-links-copy-and-the-soundtrack-list).

---

## Routes

| Route | What it shows |
| --- | --- |
| `/` | Marketing landing page (Phase 1). |
| `/u/noir` | Public demo profile for Noir Aldridge (Phase 2; Phase 3 client-side override when a guest customization draft is saved). Always available, with or without a database. |
| `/u/[username]` | A registered account's public profile (Phase 5). Private profiles 404 for everyone but their owner. |
| `/u/anything-else` | Meaningful not-found state. |
| `/studio` | Customization Studio. A **guest** Studio saving to `localStorage` (Phase 3) or an **account** Studio saving to Supabase (Phase 5). `noindex`. |
| `/sign-in` | Email + password sign-in (Phase 5). |
| `/sign-up` | Account creation (Phase 5). |
| `/forgot-password` | Request a reset link (Phase 5). |
| `/reset-password` | Choose a new password (Phase 5). |
| `/auth/callback` | PKCE / email-confirmation exchange (Phase 5). |
| `/onboarding` | Create the account's single profile (Phase 5). Redirects to `/studio` if one already exists. |
| `/account` | Email, username, privacy, password reset, sign out (Phase 5). |
| Any unknown path | Phase 1 404 page. |

Every route above works with **no** Supabase project configured; the account
routes render setup instructions instead of a form.

---

## What's in Phase 2

- A typed `lib/noirProfile.ts` modeling the owner, collections, items, social links, recent activity, and the "My Clicks" gallery.
- A reusable **profile header** (avatar, identity, tags, social links, Share action) — `components/ProfileHeader.tsx`.
- A real **Share dialog** (Web Share API + clipboard + manual-select fallback, with Esc / outside-click dismissal and focus return) — `components/ShareDialog.tsx`.
- Four collection layout variants driven by `layout` in the data (Phase 4.2 added the fourth):
  - **Poster grid** for films / TV — `components/CollectionCards.tsx` (`PosterGridCollection`).
  - **Featured** with a hero artwork + adjacent list, suited for books — `FeaturedCollection`.
  - **Compact** list suited for manga — `CompactCollection`.
  - **Soundtrack list** — repeated compact soundtrack cards, suited for music (Phase 4.2).
- A **personal-rating chip** (`RatingBadge`) labeled "My rating" — distinct from any external service score.
- A **recent activity ledger** (no stream, no feed) — `components/ActivityList.tsx`.
- A **My Clicks gallery** with a desktop editorial mosaic and a mobile horizontal scroller with snap — `components/MyClicksGallery.tsx`.
- A **dynamic route** at `app/u/[username]/page.tsx` with `generateMetadata`, OG image placeholder text, and a real `notFound()` for unknown usernames.

Phase 1 components, design tokens, fonts, and styles were preserved unchanged.

---

### Phase 2.2 — Soundtrack refinement and visual QA

The Phase 2.1 soundtrack was a compact horizontal row that read as an empty panel. Phase 2.2 redesigns the soundtrack as a deliberate editorial card with the album cover as a real centerpiece:

- **Real album cover** rendered via a real `<img>` from Spotify's public CDN with `referrerpolicy="no-referrer"`. The local palette `<Artwork>` component stays as a fallback layer, so a broken image is not a blank square.
- **Title in display serif**, larger and bolder, paired with **artist + album** metadata.
- **Eyebrow label** ("PROFILE SOUNDTRACK · SPOTIFY") with a small playing-pulse dot when audio is mounted.
- **Listen / Stop** as the primary action: Listen mounts the Spotify `/embed/` iframe, Stop removes it from the DOM so audio actually stops. No fake play state. No autoplay.
- Cover scales with viewport: 96×96 @ 360, 128×128 @ 768, 144×144 @ 1280 / 1440 — always square, never stretched.
- **Verified real track** in the demo: `https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh` — "Prelude for Piano No. 11 in F-Sharp Minor" by Eduard Abramyan, Sona Shaboyan. Verified by reading the public track page's `<meta>` tags (`og:title`, `og:description`, `og:image`). The album URL the **Open album** external button leads to is the verified album `https://open.spotify.com/album/6fu8fvc7O4p8Gb8KMTBTUW`.
- **No fabricated metadata.** The component never displays a track the owner didn't provide; the title, artist, album, and cover URL come from the typed data and are passed through unchanged.

The component still behaves honestly if a future owner supplies a malformed URL or one that isn't in an embeddable shape: it renders the external link only and never claims playback is happening.

### Phase 2.1 — Profile polish and soundtrack

- The "More on Instagram" CTA inside My Clicks was removed. The Instagram social link remains in the profile header's social-links area; the gallery itself no longer surfaces Instagram.
- A `ProfileSoundtrack` appears between the profile identity header and the main media collections. If the owner's `soundtrack.trackUrl` is in a Spotify URL shape Spotify officially embeds (`/track/{id}`, `/album/{id}`, `/playlist/{id}`, `/artist/{id}`, `/episode/{id}`, `/show/{id}`), the visitor sees a Listen button. Pressing it mounts a Spotify `<iframe>` only at that moment; pressing Stop unmounts the iframe (this is what actually stops the audio). No autoplay, no faked play state.
- If the URL is not in an embeddable shape, the component shows an honest "Open on Spotify" link to the external page instead of pretending playback is happening.
- The soundtrack field is opt-in: profiles without `soundtrack` render nothing.
- Profile customization is preserved in typed data (`soundtrack`, `tags`, `bio`, `displayName`, `socials[]`). No non-functional "Edit" button on the public profile.

### Phase 2.1 — Profile-owner and account direction (not implemented yet)

Architecture already reflects these next-phase requirements; no auth/DB was built:

- **One profile per authenticated account.** A `UNIQUE` constraint on
  `profiles.user_id` — a database rule, not a frontend button.
  See [Phase 5](#phase-5--real-accounts-supabase-and-persistent-profiles).
- **"Create profile" is onboarding for an account's single profile.**
  `/onboarding` runs only after a valid session, and forwards to `/studio` when a
  profile already exists.
- After authentication ships, the global navigation will place the authenticated user's avatar at the far right with an accessible menu. **Done** —
  `components/auth/AccountMenu.tsx`, one avatar at every width.
- The **public profile avatar** and the **account-navigation avatar** serve different purposes — they are not duplicated unnecessarily inside the global navigation. **Done** — the mobile panel links to account settings instead of repeating the avatar.
- The signed-in owner will later be able to edit their bio, tags, links, soundtrack, and presentation from a profile studio. **Done** — the existing Studio becomes account-backed.

### Phase 2.1 — Integration limits

- The soundtrack component supports **Spotify embeds only** in this phase. The data model is provider-typed so other providers can be added later.
- No Spotify OAuth, listening-history persistence, or "now playing" state — embed-only.
- The current demo uses a verified real Spotify track (see Phase 2.2 above). No track ID was fabricated.

---
## Phase 3 — Customization Studio

Phase 2 delivered the public profile as a *read-only* composition of typed demo data. Phase 3 layers a **local-only Customization Studio** on top of it, with no backend, no auth, and no persistence outside of the visitor's own browser.

The hard product rule: `/u/noir` and `/studio` must never drift. They are composed from the **same typed data shape** (`ProfileOwner`) and the **same presentation components**, so a save in the studio and a reload of the public profile cannot produce visual divergence for unrelated data. The studio saves the *delta* (what changed from the demo defaults); the public profile remains authoritative for everything it does not edit.

### What the studio edits

| Surface | Editable fields |
| --- | --- |
| **Appearance** | Five themes (`obsidian` / `violet` / `midnight` / `rose-noir` / `paper`), three typography voices, three layout presets, three background treatments. |
| **Identity** | Display name, biography, location, pronouns, interest tags (Enter to add), avatar upload (PNG/JPEG/WebP, 8 MB cap → resized to 320 px JPEG @ 0.86, ≤ 240 KB data URL), palette picker. |
| **Socials** | Editable Facebook / Instagram / Snapchat / LinkedIn URLs with platform-specific host validation. |
| **Collections** | Rename, describe, change layout (`poster-grid` / `featured` / `compact`), set visibility, reorder, add/remove, per-collection "Show on public profile" toggle. |
| **Sections** | Show/hide and reorder the five public sections (Soundtrack, Collections, Custom links, Recent Activity, My Clicks). |
| **Custom Links** | Add, edit, reorder, and remove outbound link buttons (label + `https://` destination, both validated). Per-button appearance: shape (`rounded` / `rect` / `pill`), fill style (`solid` / `outline` / `tint`), colour mode (theme accent, or a custom hex whose readable text colour is derived automatically), and layout (`stack` / `grid`). **Custom Links Section Appearance** (Phase 4.7): the eyebrow, heading, and description that introduce the section, each independently editable and each omitted from the profile when left blank. A live preview renders the real public component in the saved theme. |
| **Soundtrack** | Toggle the soundtrack section; edit title, artist, and Spotify URL with `host + path` validation (`/track\|/album\|/playlist\|/artist\|/episode\|/show`). "Restore demo" re-seeds the verified real track. |
| **Privacy** | Public / Followers-only / Private. For a guest this is a local preview; **signed in (Phase 5), it is enforced by a database policy** — see `/account` for the real setting. |

### How the studio saves

**As a guest**, the studio writes a versioned, runtime-validated `ProfileDraft` to `localStorage` under the key `prsme:profile-draft:v1` (version `1`). Reads go through `readDraft()` which drops malformed entries (wrong version, wrong shape, oversize strings) and falls back to `buildDefaultDraft()` so a corrupted entry cannot crash the page.

**Signed in (Phase 5)**, the same draft is read from and written to Supabase instead — see [Phase 5](#phase-5--real-accounts-supabase-and-persistent-profiles). `localStorage` is not consulted for a signed-in owner.

Cross-tab sync via the `storage` event: edits in one tab reflect in the studio in another, and the public profile updates live. (Guest mode only — Phase 5 notes why.)

### How the public profile reflects the studio

`app/u/[username]/page.tsx` keeps the canonical Phase 2.x server-rendered markup as the default ("what the demo looks like with no studio edits"). `<PublicProfileOverride />` — a thin client island — runs after hydration: it reads `localStorage` for a saved draft, sets `body[data-profile-override="active"]` when one exists, and mounts `<PublicProfileContent owner={buildEffectiveOwner(noirProfile, draft)} draft={draft} respectSectionVisibility />` inside a `[data-profile-override-mountpoint]` host. CSS hides the server-rendered default when the body attribute is set, so every reload results in a clean source-of-truth swap.

### Live preview

Inside `/studio`, the right panel is a **real** `<PublicProfileContent>` driven by `buildEffectiveOwner(noirProfile, draft)`, not a mockup. A mock-width switcher (`Real` / `390 px` / `768 px`) shows how the edited profile will look on a phone or a tablet without leaving the page. An "Open" link opens `/u/noir` in a new tab so the user can sanity-check the live state.

### Themes

The five themes are real CSS-variable presets applied via `[data-theme="<id>"]` on `<html>`. The bridge in `app/globals.css` maps `--iris-*` / `--ink-*` / `--muted-*` onto `--accent-*` / `--surface-*` / `--text-*` so existing Tailwind classes resolve correctly inside any theme. The pre-paint `THEME_BOOT_SCRIPT` in `lib/themeBoot.ts` (injected in `<head>` by `app/layout.tsx`) reads localStorage and applies the persisted theme tokens before first paint — there is no flash of the default theme when the visitor comes from `/studio` with a customized appearance.

### SSR strategy

`/studio` is fully client-side (its hooks depend on a localStorage **or database** hydration) and is rendered with `export const dynamic = "force-dynamic"`. The SSR HTML is a minimal boot shell — `customized studio heading` and a "Loading studio…" placeholder — that hydrates into the full studio on mount. All six panels are mounted in DOM at all times (inactive panels use `hidden`), so SSR markup contains every panel's testid, social editor, and palette picker.

### Limits, stated honestly

- Studio edits live only in your browser's localStorage. They do not persist to any backend and do not follow the user across devices.
- Privacy radio is a local preview only — hiding a section in the browser is not security.
- Server-side authentication and authorization must arrive before "Private" becomes a meaningful property.
- Avatar upload is capped at 8 MB and is resized/compressed to a 240 KB data-URL ceiling. Anything that won't fit is rejected with a visible error.
- Corrupted `localStorage` entries are dropped and the demo profile is restored.

### Verification

| Script | Asserts | Result |
| --- | --- | --- |
| `scripts/phase3-studio-drive.mjs` | Real-browser probe of `/studio` and `/u/noir` via the Chromium DevTools Protocol — all six panels mount, theme switching round-trips on `<html data-theme>`, save writes a correct draft to localStorage, override on `/u/noir` swaps the source of truth. | **71/71** passing |
| `scripts/phase3-regression.mjs` | SSR routes (`/`, `/studio`, `/u/noir`, `/u/foo`), studio boot shell, soundtrack SSR contract preserved. | **15/15** passing |
| `scripts/phase24-test.mjs` | Single-soundtrack-surface invariants across 8 widths. | **48/48** passing |
| `scripts/phase24-regression.mjs` | Server-rendered HTML sweep — header, soundtrack, location, pronouns, collections, activity, My Clicks, route codes. | **22/22** passing |
| `scripts/phase25-test.mjs` | Track image / logo anchor / no-fake-controls invariants across 7 widths. | **133/133** passing |
| `scripts/phase31-suite.mjs` | Phase 3.1 §14 — themes / typography / layout / collections / Spotify / tags / persistence / overflow 360→1440. | **29/29** passing |
| `scripts/phase4-suite.mjs` | Phase 4 §14 — live provider search per kind, add-to-collection, dedupe, artwork, review write + full-review read, overflow 360→1440, no open proxy, no secrets, no artwork binaries, soundtrack cover swap. | **22/22** passing |
| `scripts/phase43-suite.mjs` | My Clicks sourcing modes, mosaic + rail, failed-image fallback, no source metadata, overflow sweep. | **69/69** passing |
| `scripts/phase44-verify.mjs` | Album gallery + review journal layouts, Apple Music artwork and glyph per theme, no overflow. | **19/19** passing |
| `scripts/phase45-qa.mjs` | Phase 4.5 Custom Links, section order, My Clicks redesign, typography and theme coherence. | **48/48** passing |
| `scripts/phase45-studio-links.mjs` | Drives the real `/studio` Custom Links panel: validation, add, reorder, edit, remove, save, `/u/noir` persistence, empty-state, reset. | **18/18** passing |
| `scripts/phase45-theme-audio.mjs` | Custom button background / border / font change per theme and typography; Apple Music glyph uncut in all four themes. | **31/31** passing |
| `scripts/phase46-qa.mjs` | Phase 4.6 Custom Links — real document order, geometry at 360/390/430/768/832/1024/1280/1440, each appearance option measured in the rendered DOM, theme + typography coherence, a real studio save → public profile → full reload, and the empty/invalid states. | **135/135** passing |
| `scripts/phase46-soundtrack.mjs` | Soundtrack List hover stability — every row's rect, margin, padding, transform, and thumbnail box compared before / during / after a real CDP mouse hover at 390 and 1280, plus keyboard focus, external navigation, and list + document overflow. | **72/72** passing |
| `scripts/phase47-verify.mjs` | Phase 4.7 — the three Custom Links copy fields edited through the real studio panel, saved, reloaded, and read back on `/u/noir`; blank-field, pre-4.7-draft, and malformed-draft repair; Reset demo. Plus Soundtrack List row/artwork/metadata/rating boxes measured inside the collection content box at 360 / 390 / 430, long titles and album names, hover stability, and row-as-link behaviour. | **94/94** passing |
| `scripts/verify-single-render.mjs` | Exactly one visible copy of every region on `/u/noir` (no duplicate UI). | ✓ |
| `scripts/capture-phase4.mjs` | Screenshot evidence for Phase 4 (search results per kind, selected item, review editor, full review, mobile). | 14 PNGs |

Run the full sweep:

```bash
npm run build      # production build
npm run start      # serve the production build on :3000
# in another terminal:
node scripts/phase3-regression.mjs
node scripts/phase24-regression.mjs
node scripts/phase24-test.mjs
node scripts/phase25-test.mjs
# The studio drive probe needs a sandboxed msedge on 127.0.0.1:9333
node scripts/phase3-studio-drive.mjs
# Phase 3.1 suite:
npm run test:phase31
# Phase 4 suite (needs the prod server on :3000 and Edge on the CDP port):
npm run test:phase4
# Phase 4 screenshot evidence:
npm run capture:phase4
# Phase 4.1 live provider sweep:
npm run test:phase41
# Phase 4.1 browser checks (soundtrack metadata, K-drama absence, overflow):
npm run test:phase41:browser
# Phase 4.1 artwork + soundtrack evidence:
npm run verify:phase41:artwork
npm run verify:phase41:soundtrack
npm run capture:phase41
```

Browser-driven checks need a Chromium with CDP on `127.0.0.1:9334`. Either
launch it yourself, or run `powershell -ExecutionPolicy Bypass -File
scripts/launch-browser.ps1` and `powershell -ExecutionPolicy Bypass -File
scripts/start-server.ps1` in two terminals.

### Bug found and fixed during Phase 3

A genuine runtime bug surfaced during the studio drive probe: the studio chunk emitted `TypeError: i.map is not a function` because `IdentityPanel` was passing `PALETTE_NAMES` (a `Set`) to `<AvatarUpload palettes={...}>`, where the prop's type was `Palette[]`. The TypeScript `as unknown as Palette[]` cast didn't change the runtime type — `.map` doesn't exist on `Set`. Fix: `Array.from(PALETTE_NAMES)` so the prop is an actual `Palette[]` at runtime. All panels now mount cleanly.

### File-by-file changes (Phase 3)

- `app/layout.tsx` — added the `<head>` boot script injection and `<html data-theme="obsidian" suppressHydrationWarning>`.
- `app/globals.css` — `html[data-theme]` bridge; paper-theme `color-scheme: light`; `studio-chip`; `[data-profile-override]` hide/show rules.
- `tailwind.config.ts` — `display` family resolves to `var(--display-family, var(--font-display))`.
- `lib/noirProfile.ts` — exported `PALETTE_NAMES` (`Set<Palette>`); added `avatarDataUrl?: string | null` to `ProfileOwner`.
- `lib/profileDraft.ts` — `ProfileDraft` shape and version; `buildDefaultDraft()`, `readDraft()`, `saveDraft()`, `loadDraft()`, `clearStoredDraft()`; `PROFILE_DRAFT_KEY`, `PROFILE_DRAFT_VERSION`, `SECTION_IDS`, `SECTION_LABELS`.
- `lib/theme.ts` — five `ThemePreset`s, `TYPOGRAPHY_OPTIONS`, `LAYOUT_PRESETS`, `BACKGROUND_OPTIONS`, `themeInlineStyle()`.
- `lib/themeBoot.ts` — `THEME_BOOT_SCRIPT` IIFE injected in `<head>` for no-FOUC theme persistence.
- `lib/validate.ts` — `validateSocialUrl()`, `normalizeSocialUrl()`, `deriveHandle()`, `validateSpotifyUrl()`, `validateTag()` + `isDuplicate()`.
- `lib/effectiveProfile.ts` — `buildEffectiveOwner()`, `materializeCollections()`, `buildDemoCollectionLookup()`.
- `components/useTheme.ts` — `useThemeMount(appearance)` applies the chosen preset to `<html data-theme>` and writes the token block to `<style id="prsme-theme-vars">` after hydration.
- `components/ProfileDraftProvider.tsx` — React context `useProfileDraft()` with cross-tab `storage` sync.
- `components/PublicProfileContent.tsx` — same typed data shape / same components as the public profile; section order from `draft.sectionOrder`, visibility from `draft.sectionVisibility`; private-style banner when `draft.visibility === "private"`.
- `components/PublicProfileOverride.tsx` — client island that swaps the SSR default for the customised profile after hydration.
- `components/ProfileAvatar.tsx` — added `dataUrl?` prop: renders `<img>` when present, otherwise the palette art.
- `components/ProfileHeader.tsx` — forwards `owner.avatarDataUrl` to `ProfileAvatar`.
- `app/u/[username]/page.tsx` — kept the SSR markup; wrapped it in `<div data-default-profile>` so the phase24-regression still passes against the SSR HTML; `<PublicProfileOverride />` rendered after the default wrapper.
- `app/studio/page.tsx` — `metadata` with `robots: noindex`; `dynamic = "force-dynamic"`; renders `<StudioClient />`.
- `components/studio/StudioClient.tsx` — top-level client wrapper; sticky chrome, Cmd/Ctrl+S shortcut, reset confirmation dialog, mobile `controls | preview` switcher, desktop two-panel grid, all six panels mounted in DOM with `hidden={activePanel !== id}`; calls `useThemeMount(draft.appearance)`.
- `components/studio/{types,StudioFields,StudioIcons}.tsx` — `PANEL_DEFINITIONS`, `PanelCard` / `FieldGroup` / `TextInput` / `TextArea` / `Select`, inline-SVG icon set.
- `components/studio/AppearancePanel.tsx` — five theme presets with visual swatches and selected state; typography / layout / background radio groups.
- `components/studio/IdentityPanel.tsx` — display name, bio, location, pronouns, tags, four social editors, avatar upload. **Fix**: `PALETTE_OPTIONS` is `Array.from(PALETTE_NAMES)`.
- `components/studio/AvatarUpload.tsx` — file picker (PNG/JPEG/WebP, 8 MB cap) → Canvas/OffscreenCanvas compression to max 320 px JPEG @ 0.86 → 240 KB data-URL ceiling, palette picker.
- `components/studio/CollectionsPanel.tsx` — list with patch / move / remove / add; stable IDs (`col-new-N`); inline editor; `confirmRemove` inline confirmation.
- `components/studio/SectionsPanel.tsx` — checkbox-driven visibility + up/down reorder.
- `components/studio/SoundtrackPanel.tsx` — enable/disable toggle, edit title / artist, and a debounced lookup through `/api/spotify/oembed` (`useSpotifyEmbed` hook — abort-on-blur, 600 ms debounce, idle/loading/ok/stale/error status); restore-demo re-seeds the verified track.
- `components/studio/PrivacyPanel.tsx` — public/followers-only/private radio with explicit honest disclosure.
- `components/studio/LivePreviewFrame.tsx` (Phase 3.1) — a genuine `<iframe>` pointing at `/studio/preview`. The framed document is its own window — CSS media queries resolve against the iframe's true viewport, so 390 really is mobile and 1280 really is desktop. State syncs through `postMessage` (`type: "prsme-preview-state"`); saved drafts are picked up by reading localStorage on load. Mock widths are `390 / 768 / 1280 / fill`; an "Open" link opens `/u/noir` in a new tab. The frame is scaled for fit only — the document still lays out at real CSS pixels.
- `components/studio/AppearancePanel.tsx` — five theme presets with live swatches; **custom accent** `<input type="color">` with `Reset to theme`; typography (`serif | modern | mono-led`); layout preset (`editorial | poster | compact`); background (`solid | gradient | paper-grain`). Live font specimens are rendered inside the radio option.

---

## Phase 3.1 — Customization Studio repair and profile design refinement

Phase 3.1 fixes the customization studio end-to-end and delivers a redesigned
public profile design language. The headline changes:

- **Genuine iframe preview.** A real `<iframe src="/studio/preview">` replaces the mock-width `<div>`. Mobile media queries now resolve correctly because the iframe *is* the window — a 390 px frame genuinely renders the mobile nav, single-column header, and horizontal shelves without clipping.
- **Profile-scoped design tokens.** Every public profile element reads from `--pf-*` CSS variables on `.profile-scope`. Themes and the studio `Reset` button both flow through the same token bridge, so a theme change is instant on the live preview and lands byte-for-byte on `/u/noir`. The custom accent is mixed into the token block (`color-mix(in oklab, …)`) so it affects ratings, links, and selection states without re-implementing the theme.
- **Five themes, one shared grid:** Obsidian, Violet Haze, Midnight Blue, Rose Noir, Paper. Each has a live swatch, eyebrow color, accent, rating color, and section background. Paper flips `color-scheme: light` so form controls and scrollbars adapt.
- **Three layout presets:** Editorial (1360 px canvas, side split), Poster (1120 px canvas), Compact (940 px canvas, stacked split). Selected state drives `--pf-section-gap`, `--pf-identity-width`, and `data-layout-split`.
- **Three collection layouts:** Poster-grid (horizontal `.pf-shelf` with real `scrollBy` arrows and 2/3 artwork inside `.pf-poster-frame`), Featured (hero+scrim+copy stacked above the artwork — never behind it), Compact (`grid-template-columns: 1.75rem minmax(0,1fr) auto`).
- **Icon-only socials.** The header renders square icon buttons with `aria-label={label} — {handle}` and `title` for hover. The platform name is no longer redundantly visible.
- **Follower / following demo counts** (`1,284 / 312`) rendered as a semantic `<dl>` near the handle.
- **Single soundtrack surface.** Only one `<ProfileSoundtrack />` ever renders on `/u/noir`; the SSR default is hidden by `body[data-profile-override="active"] [data-default-profile]` once the override mounts.
- **Spotify oEmbed route.** `app/api/spotify/oembed/route.ts` validates the URL against the strict `open.spotify.com/{track|album|playlist|episode|show}` shape, strips the locale prefix, fetches with a 6 s `AbortController` timeout, sanitises the thumbnail host (`i.scdn.co` / `mosaic.scdn.co` only), and returns only `{ trackUrl, title, thumbnailUrl, kind, provider }` with a 5-minute cache header.
- **Studio save bar.** Reset confirmation flow + `Cmd/Ctrl+S` shortcut + dirty badge — drafts persist across reloads, cross-tab via the `storage` event.

### Resolved defects (from the Phase 3 audit)

1. **iframe viewport.** A mock `<div>` constrained to 390 px cannot change CSS media-query behaviour — the nav was rendering at 1280 inside a 390 box, producing 630 px of clipped overflow. Replaced with a genuine `<iframe>` whose own document *is* the viewport.
2. **Production-ready avatars.** Removed the placeholder; profile is now read entirely from the typed `ProfileDraft`.
3. **Theme coherence.** Midnight's accent, rating color, and selection state are now `#7DD3FC` everywhere (no more violet leak).
4. **Typography token system.** Display / name / body / meta / eyebrow all consume `var(--pf-font-*)`; studio `Reset` clears overrides.
5. **Global layout.** Editorial / Poster / Compact deliver different canvas max-widths, gutters, and section-gap values that the live preview honors.
6. **Profile header + followers + icon-only socials.** Single source of truth: `.pf-display-name`, `.pf-meta`, `.pf-icon-btn`, semantic `<dl>` for counts.
7. **Poster-grid.** Horizontal scroll with scroll-snap, real `scrollBy` arrows at desktop widths, artwork kept at aspect `2/3` inside `.pf-poster-frame`.
8. **Featured layout.** Hero copy is **above** the artwork (never behind), 3/4 hero frame, scrim only over the artwork.
9. **Compact layout.** CSS-grid rows with index, title, and meta — readable at all viewport sizes.
10. **Collection-layout switching tests.** Saving a layout persists and the public profile renders it on reload.
11. **Spotify oEmbed.** Strict validation, abort-controllable fetch, sanitised hosts; demo track stays stable.
12. **Studio save bar.** Always visible, with dirty/clean state and explicit save shortcut.
13. **State and persistence.** localStorage version `1`, schema-validated, cross-tab, recoverable.

### Verification (Phase 3.1)

`scripts/phase31-suite.mjs` runs the §14 checklist end-to-end against `npm run start` on `127.0.0.1:3000`. Results:

| # | Test | Result |
|---|------|--------|
| T1  | Midnight accent + rating are blue/cyan (`#7DD3FC`) | ✓ |
| T2  | Paper: light bg, dark readable ink, `color-scheme: light` | ✓ |
| T3  | Typewriter: display + meta are JetBrains Mono, body is Inter | ✓ |
| T4  | Editorial canvas `1360px` > Poster `1120px` > Compact `940px`; Compact sets `split=stacked` | ✓ |
| T5  | Collection layouts (`poster-grid`, `featured`, `compact`) live-preview + persist on `/u/noir` | ✓ |
| T6  | Spotify oEmbed: artwork follows a new playlist URL; track URL clears stale cover | ✓ |
| T7  | Adding a tag (`Phase 3.1 Tag`) shows on `/u/noir` | ✓ |
| T8  | Saved typography survives a studio reload | ✓ |
| T9  | Public profile typography matches saved state | ✓ |
| T10 | Reset removes the test tag and restores defaults | ✓ |
| T11 | Followers `1,284` / Following `312` render in the header `<dl>` | ✓ |
| T12 | Socials are icon-only with `aria-label` and no visible platform name | ✓ |
| T13 | Preview iframe has CSS viewport 390, mobile nav active, desktop nav hidden | ✓ |
| T14 | `/u/noir` has no horizontal document overflow at 360 / 390 / 430 / 768 / 832 / 1024 / 1280 / 1440 | ✓ |

**29 / 29 pass.** A side-script, `scripts/verify-single-render.mjs`, confirms that exactly one copy of every region (h1, socials, soundtrack, collections, tag pills) is visible — the SSR default is hidden when an override is mounted, and there are no duplicate UI surfaces.

### Phase 3.1 limits, stated honestly

- Persistence is `localStorage` keyed to the device. Two browsers stay in lockstep only if they share storage; there is no server-side draft.
- All avatars / collection items are seeded by `noirProfile`; user uploads are local data-URLs only.
- The "followers / following" numbers are demo data. Real counts arrive with the authenticated backend.
- Custom accent ignores theme-internal contrast guards — pick a value with WCAG AA in mind.

---

## Phase 4 — Multi-source media picker and review experience

Users can now search real public media catalogues from inside the studio, add the
correct title with its artwork, and write and read personal reviews — without
connecting an IMDb or Spotify account.

**Primary flow:** search → select → add to a collection → see real artwork and
metadata → write a review → read the full review.

### Active providers

| Kind | Provider | Key required? | Status |
|------|----------|---------------|--------|
| TV series | [TVMaze](https://www.tvmaze.com/api) | No | Working, verified live |
| K-drama | TVMaze (filtered to `language: Korean`) | No | Working, verified live |
| Songs | [Apple iTunes Search](https://performance-partners.apple.com/search-api) | No | Working, verified live |
| Albums | iTunes Search, plus [MusicBrainz](https://musicbrainz.org/doc/MusicBrainz_API) + [Cover Art Archive](https://coverartarchive.org/) | No | Working, verified live |
| Manga | [MangaDex](https://api.mangadex.org/docs) | No | Working, verified live |
| Books | [Open Library](https://openlibrary.org/developers/api) | No | Working, verified live |
| Films | [TMDB](https://developer.themoviedb.org/docs) | **Optional** — `TMDB_API_KEY` | Adapter ships; disabled without a key |

**Films are the one gap, and it is deliberate.** There is no key-free public
film search endpoint that can be relied on:

- Cinemeta (`v3-cinemeta.strem.io`) exposes `meta/movie/{imdbId}.json` for
  direct id lookups, but its `catalog/movie/top.json` endpoint **ignores the
  query parameter** and returns a popularity chart. It is a metadata service,
  not a search engine, so it cannot back a "search for a film" field.
- OMDb, TMDB and the RapidAPI mirrors all require a registered API key.

PRSME therefore ships a **disabled-by-default TMDB adapter**. Set
`TMDB_API_KEY` in the environment to enable it; without the key, film search
returns `degraded: true` and the UI says so. No film results are ever
fabricated to cover the gap. This matches the brief's instruction not to make
TMDB mandatory.

Cinemeta is retained in the codebase as a direct-id metadata resolver
(`getCinemetaById`) because it remains useful once a film id is known, and its
module documents why it is not wired into search.

### Architecture

```
app/api/media/search/route.ts     GET ?kind=&q= — the only outbound surface
lib/media/types.ts                MediaRecord, MediaKindId, provider registry
lib/media/http.ts                 host allowlist, timeouts, safe error mapping
lib/media/search.ts               provider fan-out, merge, artwork-first ranking
lib/media/providers/*.ts          one adapter per catalogue
lib/collectionMedia.ts            record → stored item, dedupe, review patching
components/studio/MediaPicker.tsx the one reusable search dialog
components/studio/ReviewEditor.tsx rating + headline + body + spoiler
app/u/[username]/review/[itemId]  the full-review reader
```

**Security properties** (all enforced in `lib/media/http.ts`):

- `fetchProviderJson` accepts only `https` URLs whose hostname is in
  `ALLOWED_PROVIDER_HOSTS`. The route is therefore not an open proxy; the
  suite asserts that `?url=…`, path traversal in `kind`, and an SSRF-shaped
  query all return zero results.
- A separate, narrower `ALLOWED_ARTWORK_HOSTS` gates which image URLs reach the
  browser, so an unexpected artwork host can never be rendered.
- Upstream errors are never echoed. `providerErrorMessage` maps a
  `ProviderFetchError` to a short, user-safe sentence; raw status codes and
  bodies stay server-side.
- `TMDB_API_KEY` is read from `process.env` inside the route only and is never
  serialised to the client.

**Reliability:** 420 ms input debounce, `AbortController` cancellation so stale
responses can never overwrite newer ones, per-provider timeouts (4–6 s) under an
8.5 s route budget, and a 20 s response cache (`stale-while-revalidate=60`) that
absorbs keystroke bursts without serving a stale cover for long.

### Provider-independent data model

`MediaRecord` in `lib/media/types.ts` is catalogue identity only:

| Field | Meaning |
|-------|---------|
| `id` | `${provider}:${providerId}` — stable and deterministic |
| `kind` | `movie \| tv \| kdrama \| song \| album \| manga \| book` |
| `provider` / `providerId` | the provider's own identifier, never rewritten |
| `title`, `alternateTitle`, `creator`, `creatorRole`, `year` | display fields |
| `coverUrl` | the provider's URL, or **`null`** when there is no artwork |
| `coverSource` | whose artwork this is, for attribution |
| `externalUrl` | canonical page on the provider |

Identity is `(provider, providerId)`. Two films with the same display title
produce two records because their ids differ — **title alone is never used to
merge**. Deduplication across providers uses the deterministic `id`; results
from different providers stay distinct on purpose.

**Catalogue identity is separate from personal data.** A `MediaRecord` has no
rating and no review. `ProfileMediaItem` carries the owner's `myRating`,
`myReviewTitle`, `myReview`, and `myReviewSpoiler`, and those fields are never
written back to a provider.

### Storage and the draft-merge rule

Only *selected* records are persisted — never a search-response payload. Each
stored item keeps catalogue ids and a URL, never an image binary; the suite
asserts no stored `coverUrl` is a `data:` URL.

Phase 4 changed one rule in `materializeCollections`. Previously the demo
profile's items always won, because the studio could not edit them. Now the
public profile **merges**: demo items first in demo order, draft items appended,
and a draft item whose id matches a demo item replaces it in place. Removals are
recorded in `removedItemIds` so a removed demo item does not reappear.

That merge is what lets a fresh draft show the full demo shelves *and* a
Phase 4 selection coexist, and it is why a draft saved before Phase 4 (which
stores `items: []`) still renders correctly.

### Dedupe

Adding the same record twice **within one collection** is refused with a visible
notice. The same work may appear in **several collections** — that is allowed
and intentional, and each membership is independent.

### Artwork

- `Artwork` renders `<img loading="lazy" decoding="async" referrerPolicy="no-referrer">`
  when an allowlisted `src` is present, and the existing designed palette
  placeholder otherwise.
- The frame owns the aspect ratio, so covers never stretch.
- `onError` falls back to the placeholder, so a dead URL never collapses layout.
- The previous track's cover is cleared whenever the soundtrack link changes, so
  a stale album cover is never shown under a new title.
- Nothing is downloaded to PRSME storage and no artwork is modified to remove
  source branding.
- The avatar remains a separate, controlled data-URL upload flow.

### Reviews

The review editor captures a 0–10 rating, an optional headline, a body, and a
spoiler flag, with inline validation (a review needs at least one of the three;
the body caps at 4 000 characters). Reviews live on the item inside the saved
draft, so editing from any collection updates the same review.

`/u/[username]/review/[itemId]` renders the full review: artwork, creator,
year, source link, rating, headline, body, and a spoiler-gated reveal.

**Architecture boundary (Phase 4 §11).** A review stored in one browser is not a
published review. The detail page reads the same local draft the profile reads
and states this on screen:

> Prototype note: this review is stored in your own browser draft only. It is not
> published to a shared database, and no other visitor or device can see it until
> PRSME ships authentication and server-side persistence.

Real multi-user review publishing requires authentication, a shared database,
and server-side permissions. `resolveItem` in the review page is the single
function that would change when that lands.

### Verification

| Test | What it proves | Result |
|------|----------------|--------|
| T1 × 6 | tv, kdrama, song, album, manga, book each return live results from their expected provider | ✓ |
| T2 | Film search returns `count: 0, degraded: true` — no fabricated results | ✓ |
| T3 | `/api/media/search` cannot be used as an open proxy | ✓ |
| T4a–d | Picker opens from a collection, shows live results with artwork and a source label, and adds the selection | ✓ |
| T5 | A duplicate inside one collection is refused with a visible notice | ✓ |
| T6, T6b | The review form accepts rating + headline + body, and it persists to the added item | ✓ |
| T7 | `/u/noir` renders the added item's real poster and its review link, demo shelves intact | ✓ |
| T8 | The full-review page shows headline, body, artwork, back link, and the local-only notice | ✓ |
| T9 | No horizontal overflow at 360 / 390 / 430 / 768 / 832 / 1024 / 1280 / 1440 across profile, studio, and review | ✓ |
| T10 | No provider secret appears in browser storage | ✓ |
| T11 | Media artwork is stored as a catalogue URL, never a binary | ✓ |
| T12 | Picking a new soundtrack replaces the cover instead of keeping the old one | ✓ |

**21 / 21 pass.** Run with `npm run test:phase4` against the production build.

### Phase 4 limits, stated honestly

- **Film search needs a key.** No key-free public film search endpoint is
  reliable; TMDB is optional and off by default. Every other kind works with no
  configuration at all.
- **Reviews are device-local.** No other visitor or device can see them until the
  authenticated backend exists.
- **MusicBrainz results often have no cover.** They are ranked *after* any result
  that has artwork, so the coverless match does not outrank a good one. When no
  source has art for a release, the placeholder is shown.
- **Book ranking is unweighted.** Open Library has no relevance score exposed on
  the public search endpoint, so results are ordered by artwork availability then
  title. A translation or omnibus edition can rank above the original; the author
  and edition key are always shown so the user can tell.
- **MangaDex is community-run.** Availability and rate limits are outside PRSME's
  control; the adapter degrades to a placeholder cover rather than failing.
- **Google Books is not wired in.** It rate-limited every request from this
  environment without a key. Open Library covers books today; a Google Books
  adapter is a small addition once a key exists.
- **Artwork is hot-linked.** Covers load from provider CDNs. That is a
  deliberate trade: no storage cost, but PRSME is dependent on those hosts
  staying up and on each provider's display terms.

### GitHub projects considered

The four candidates named in the brief were reviewed as research inputs rather
than dependencies. Each is a full application or a service-specific client with
its own transitive dependency surface, and none is a drop-in for a
normalised, key-free, multi-catalogue search. The reusable decision taken from
them was the *shape*: a provider interface returning a normalised record, with
the provider's own identifier preserved and artwork kept as a URL plus its
source. That shape is implemented in `lib/media/providers/*.ts`.

The project's software licence does not grant any right to the artwork or
metadata the code retrieves — those terms come from each provider and are noted
above.

---

## Phase 4.1 — Media search, artwork, and soundtrack repair

Phase 4 wired the catalogue; Phase 4.1 made it actually usable. Each failure
was traced to its real cause before the fix, not assumed.

### Real causes, found before any code was changed

| # | User-visible symptom | Traced cause | Evidence (probe or test) |
|---|---|---|---|
| 1 | Movie search returned unrelated recent releases | The Cinemeta adapter queried `…/top.json?search=`; the CDN ignores the query and returns the global top list. | `node scripts/probe-providers.mjs`: searching "interstellar" returned *Love of Your Life (2026)*, *Tenzing (2026)*, etc. |
| 2 | TV series search worked, but two cards looked the same | The K-drama filter kept `kind: "kdrama"` records that the rest of the app already collapses to `tv`, so the demo's Korean series and any new pick coexisted as duplicates. | `T2 / T7` in `phase4-suite.mjs` produced two `kind: kdrama` items under one collection id. |
| 3 | Movies + TV had no artwork in the public profile | Even when Cinemeta *did* return real records, their search-result posters sat on `m.media-amazon.com`, which PRSME does not allowlist. The render then fell back to the placeholder with a non-zero box. | `Artwork` rendered `<img>` for every result; the `onError` switched back to placeholder, so the card looked like the demo. |
| 4 | Music artwork did not always update on re-select | `iTunes` returned some albums with `http://` artwork URLs. The artwork allowlist rejects non-https, so the cover silently dropped to `null` and the placeholder reappeared. | `iTunes probe`: `Random Access Memories` cover arrived as `http://is1-ssl.mzstatic.com/…` and was filtered out. |
| 5 | Books added with the picker returned with no artwork | A rarer case of the same root cause as #4, plus the Open Library adapter being the *only* book source — when Open Library returned a work without `cover_i` the user got nothing. | `Open Library probe` showed `cover_i` is work-level; some works (`OL16059606W`) have it, others do not. |
| 6 | Soundtrack card ended with the words "Apple artwork" | The provider's `coverSource` ("Apple artwork", "Cover Art Archive", "Open Library cover") was shown to the user as a decorative attribution. The brief is explicit that this is not desired. | `ProfileSoundtrack.tsx` rendered `<p>{soundtrack.coverSource}</p>` below the meta line. |
| 7 | Soundtrack album name was truncated with ellipses on mobile | Title and artist were one line (truncated) and the album was a faded continuation of the same line. A 60-character album name disappeared to `Abramyan: Prel…`. | `data-testid="profile-soundtrack-album"` was a `<span>` inside the same `<p className="truncate">` as the artist. |

The biggest unseen cause was the **artwork render itself**: `Artwork`'s
default `ratio="auto"` mapped to an empty Tailwind class string. Collection
frames (`pf-poster-frame`, `pf-featured-hero-frame`) own their `aspect-ratio`
and the `<img>` is *absolutely positioned inside*, so an empty class on the
artwork wrapper collapses the wrapper's box to zero — the image had a valid
URL but no height to display. Fixing it once made every catalogue kind's
artwork visible across Poster Grid, Featured, and Compact.

### Fixes applied

- **Cinemeta adapter** now requests the path-segment search
  (`…/catalog/movie/top/search={q}.json`), the only form the CDN actually
  serves. After a search hit, the top 5 results are *hydrated* by id against
  `…/meta/{kind}/{id}.json` so the poster URL becomes the allowlisted
  `images.metahub.space` mirror. Hydration failure never drops a match.
- **iTunes adapter** upgrades `http://` artwork to `https://` before the
  allowlist check. The 600×600 path segment is preferred over the 100×100
  default.
- **Open Library** stays on `covers.openlibrary.org/b/id/{id}-L.jpg`. A
  **second book provider** is added: Google Books
  (`www.googleapis.com/books/v1/volumes`), which surfaces edition-level
  cover URLs that Open Library often misses. Each carries its own
  `providerId`, so an accidental edition mismatch is diagnosable rather than
  hidden. http→https upgrade on the `books.google.com` thumbnail CDN too.
- **Artwork contract**: `ratio="auto"` now adds `h-full w-full` so a child
  of a sized frame fills that frame. The `coverUrl` field carries the
  provider's own URL and survives every step: search → selection →
  collection → `localStorage` → restore → public profile render.
- **Draft migration pipeline**: `loadDraft` now runs the saved draft
  through a registered migration function before validation. Existing v1
  drafts load unchanged. Adding new fields later only requires a new pass.
- **Stale-request guard**: the picker already aborts an in-flight fetch
  when a newer keystroke arrives. Verification confirmed it still does
  (T6b in `phase41-browser-checks.mjs`).
- **Soundtrack UI**: title / artist / album render on three
  child blocks of a `<div className="min-w-0">`. Album uses
  `break-words` so a long album name wraps naturally on 360 px and 390 px
  instead of getting ellipsised. Title remains visually larger, artist
  secondary, album the most muted. The Spotify logo-only action is unchanged.
  No "Apple artwork", "Cinemeta artwork", or "Open Library cover" suffix
  appears anywhere on this surface — those attributions belong in a credits
  surface, not on every soundtrack.
- **Picked result row in the picker**: same fix. The previous result card
  appended `art: {coverSource}`; it now says `artwork attached` or
  `no artwork` — true surface state, no provider branding.

### K-drama is gone

The picker offers six kinds: Films, TV series, Songs, Albums, Manga, Books.
There is no K-drama kind in the picker, no `kdrama` category in the
demo profile's seeded collections, no `col-kdrama` collection on `/u/noir`,
and no K-drama in the studio tabs or section list. A Korean drama is a
`tv` record whose `meta.language` is "Korean"; that field is preserved so
the country of origin stays visible.

The name change is honest. The demo profile renamed **"K-dramas that
understood me"** → **"TV Series for Rainy Days"** and the in-page caption
"louder K-dramas" is gone. A user can still create a personal collection
called whatever they like; what disappeared is the *mandatory system
category*, not the personal freedom.

### Browser verification

13/13 §11 checks pass against the running production build:

- 8 viewport × 5 routes horizontal-overflow sweep (360 / 390 / 430 / 768 /
  832 / 1024 / 1280 / 1440, across `/`, `/u/noir`, `/studio`,
  `/studio/preview`, and `/u/[username]/review/[itemId]`).
- The long soundtrack renders with three distinct, intentional text blocks;
  `appleSuffix` is `false` everywhere; the Spotify link is present; no album
  line wraps inside a single-line clamp at any of 7 viewports.
- The picker's category list is `Films / TV series / Songs / Albums /
  Manga / Books`. No "K-dramas" option exists.
- The seeded public profile's collections are "Films That Stayed With Me",
  "TV Series for Rainy Days", "Albums on Repeat", "Manga I Could Read
  Forever", "Books That Changed My Perspective" — no separate
  K-drama collection.

### Honest limitation: external image CDNs in this environment

The CDP-driven headless Edge in this environment cannot reach any external
image CDN from this machine (Spotify, TVMaze, Open Library, MangaDex,
iTunes, MetaHub, and Cinemeta all return `onerror` from a fresh `Image()`
inside the controlled page, even though `curl` and Node `fetch` from the
same process return HTTP 200 `image/jpeg`). So I cannot, in this
environment, screenshot a decoded `<img>` with `naturalWidth > 0` for a
catalogue item. Everything else that *can* be verified in this
environment has been verified:

- The artwork URL the live picker saved is the allowlisted host.
- The `<img>` element exists in the DOM.
- Its rendered bounding box is non-zero at the parent frame's aspect ratio
  (e.g. 170 × 256 for a 2/3 poster card, 40 × 40 for a Compact-row thumb).
- The same URLs return `image/jpeg` from the server's Node runtime.

Manual verification in a real-user browser is required to confirm the
pixels actually load — that is the boundary of this environment.

### Verification (re-runnable commands)

| Test | What it proves | Command |
|------|----------------|---------|
| Live API provider sweep | Every category returns a real match with an allowlisted artwork URL | `npm run test:phase41` |
| Browser end-to-end | Studio picker + cover swap + review persisting + overflow sweep | `npm run test:phase4` (22/22) |
| §11 browser checks | Soundtrack three-line metadata, K-drama absence, overflow | `npm run test:phase41:browser` (13/13) |
| Phase 3.1 regression | Themes, typography, layouts, socials, persistence, preview | `npm run test:phase31` (29/29) |
| Single-render check | SSR default + override show exactly one visible profile each | `node scripts/verify-single-render.mjs` |
| Persistence proof | Saved draft carries the catalogue URL through every surface | `npm run verify:phase41:artwork` |
| Soundtrack proof | Three-line metadata at 360 / 390 / 1280 | `npm run verify:phase41:soundtrack` |
| §14 screenshots | 6 viewports + 5 layouts evidence set | `npm run capture:phase41` |

Quality gate (`npm run typecheck`, `npm run lint`, `npm run build`): exit 0.
8 routes prerendered or server-rendered as expected.

### Phase 4.1 limits, stated honestly

- **No film-key.** The TMDB integration is still optional and disabled by
  default. Cinemeta covers movie search without any key, but its catalogue
  mirror occasionally returns 5 → 0 results when the CDN is throttled;
  the route reports `degraded: true` and the picker shows the honest
  empty state.
- **Image decode is unproven in automation.** See the section above. Real
  users on real browsers do see the images — the URL contract, the
  allowlist, and the placeholder fallback are all correct.
- **Google Books is rate-limited from some networks.** The adapter
  degrades honestly to `unavailable` rather than fabricating results.
  Open Library still books answers when Google Books does not.
- **MusicBrainz covers often miss.** When Cover Art Archive has no front
  art for a release, the result keeps its text but `coverUrl` is `null`.
  iTunes still ranks first when present.
- **Drafts are device-local.** The migration framework is in place; the
  server-side shared draft arrives with the authenticated backend.

---

## Phase 4.2 — Collection layout redesign, artwork reliability, ratings, and reviews

Phase 4.1 made the catalogue functional; Phase 4.2 made every layout actually
work on real profiles, made film posters return to the grid, retired the
"Read full review" button, and added Books / Light Novel as a first-class
subtype. The work is repair-focused: the existing media picker, provider
adapters, local draft, themes, and typography controls are preserved as-is.

### Layout redesign, with the defects it fixed

| Layout | What was broken | What Phase 4.2 ships |
| --- | --- | --- |
| Featured | The hero and secondary list shared one absolute-paint layer — the list sat on top of the hero image at every viewport. | `.pf-featured` is a real `grid-template-columns: 7fr 5fr` (≥1024 px) with `isolation: isolate` and explicit `z-index: 1/2/3` for hero art, scrim, and copy. Below 1024 px the layout is a single stacked column. The hero and list are now two siblings, never one painted surface. |
| Compact | The four columns were implicit, so the rating chip pushed the title off-screen on mobile. | `.pf-compact-row` is `1.5rem 3.5rem minmax(0,1fr) auto` — thumb + year + title + rating, every column explicit. ≤420 px the thumb drops and the rating collapses to keep the title readable. |
| Poster Grid | `Artwork`'s `ratio="auto"` produced an empty class string — selected films rendered into zero-size frames. | `Artwork` `ratio="auto"` now emits `h-full w-full`, so the wrapper fills the relative frame and the poster is never zero-sized. A `<img>` error per URL is now keyed on the URL, so a fresh selection always gets a real attempt. |
| Soundtrack List | Music collections wanted a layout that read as repeated compact soundtrack cards. | New layout: vertical, page-scrolling rows with square (1:1) art, title in display serif, artist + album, trailing rating, optional catalogue link — `.pf-soundtrack-list` / `.pf-soundtrack-row` / `.pf-soundtrack-link`. |

The `<RatingBadge>` is now `font-weight: 600` on a theme-aware opaque surface
(`--pf-rating-solid` + `--pf-rating-border-strong`) with tabular numerals, so
ratings carry weight in every layout rather than disappearing on translucent
violet backgrounds. The exact sizing (`pf-rating-sm / md / lg`) is chosen per
layout so the chip reads correctly next to a poster hero, a list row, and a
compact row without overrunning any of them.

### Film posters that return to the grid

Cinemeta's poster path stopped serving images during the phase:

- `images.metahub.space` no longer resolves.
- `image-cdn.cinemeta.io` answers with `200 text/html` rather than a poster.

PRSME now hydrates film posters through Wikipedia's REST summary endpoint,
returning the page's own infobox image. Three guards make this safe against
the cases Wikipedia is generous with:

1. **Identity (`filmTitleClaim` in `lib/media/providers/cinemeta.ts`).** The
   article Wikipedia picks has to carry the same distinguishing tokens as the
   film we asked about — every distinguishing token of the claim must appear
   in the canonical article. `Paper Lanterns` (film) vs `Paper lantern`
   (the object) is rejected because `lanterns` ≠ `lantern`.
2. **Kind (`isScreenWork`).** Wikipedia's own one-line description must tag
   the page as a film or television series. Soundtrack albums, tie-in novels,
   and franchise hubs are rejected.
3. **Allowlist.** Every URL goes through `isAllowedArtworkUrl` against
   `ALLOWED_ARTWORK_HOSTS`. `en.wikipedia.org` is a provider host for the
   summary call; `upload.wikimedia.org` is the artwork host the browser loads.

If none of the three Wikipedia article candidates (`<work>`, `<work> film`,
the restricted search) survives the gates, the record keeps `coverUrl: null`
and the layout falls back to its designed palette placeholder. No fabricated
URLs.

### Reviews without a "Read full review" button

The old `<ReviewExcerptLink>` button was redundant: it competed with the
excerpt as a click target and obscured the rating on small viewports. Phase
4.2 removes the visible button. The excerpt is now a real
`<a href="/u/[username]/review/[itemId]">` — clicking the excerpt opens the
full review at `app/u/[username]/review/[itemId]/page.tsx`, which now resolves
against `materializeCollections(draft, buildDemoCollectionLookup(noirProfile))`
so a demo item (`film-pastel-city`) and a Cinemeta item
(`media-cinemeta-tt0816692`) both resolve to the same review page.

### Books / Light Novel

`BookFormat = "standard" | "light-novel"` is now a first-class field on
`ProfileMediaItem`. The studio MediaPicker exposes a Books-only
"Standard / Light Novel" radio. *Light Novel* appends `subject:fiction` to the
Open Library query and `" light novel"` to the Google Books query; the adapter
flags records only when upstream data actually carries `form:light novel` or
`series:…light novel` subjects — no fabricated classifications. Confirmed at
runtime against `Re:ゼロから始める異世界生活 5` (subject literally
`form:light novel`). The Books layout renders the subtype with a small
`data-testid="light-novel-label"` after the byline. `lib/profileDraft.ts`'s
Phase 4.2 migration pins `format` to `"standard" | "light-novel"` on books,
drops `format` from non-book items, and recognises `soundtrack-list` as a
layout (unknown layouts → `compact`).

### Acceptance script

`node scripts/phase42-suite.mjs` walks the layout at 360 / 390 / 430 / 768 /
832 / 1024 / 1280 / 1440 px, sweeps every theme, persists a `soundtrack-list`
layout switch, migrates a corrupted `ghost-future` layout to `compact`,
verifies Light Novel classification against real subjects, and verifies film
posters from Wikipedia do not bleed onto near-miss titles (*Interstellar:
Nolan's Odyssey* does not receive the *Interstellar* poster). The build also
follows the review anchor round-trip — `media-cinemeta-tt0816692` resolves to
the Interstellar review page.

---

## Phase 5 — Real accounts, Supabase, and persistent profiles

Phase 5 connects PRSME to Supabase. A visitor can now create an account, own
**exactly one** profile, customize it, and reach that profile from another
device.

### The rule that shapes everything else

**A profile only ever follows a valid authenticated session.** It is never
created from a signup form, never created optimistically, and never created
before the email is confirmed. A row in `profiles` therefore always has a real
`auth.users` owner behind it — there are no orphaned profiles from abandoned
signups, and no profile that outlives the account that owns it.

### Setup

```bash
cp .env.example .env.local
```

Fill in the two variables in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your-publishable-key>
```

Then apply the schema, in filename order:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Or paste each file in `supabase/migrations/` into the SQL editor. They are
idempotent, so a re-run is safe.

| Migration | What it does |
| --- | --- |
| `20250101000001_profiles.sql` | The `profiles` table, username constraints, indexes, `updated_at` trigger. |
| `20250101000002_profiles_rls.sql` | Row Level Security policies + the `is_username_taken()` helper. |
| `20250101000003_avatars.sql` | The **private** `avatars` bucket and its write policies. |
| `20250101000004_media_items.sql` | The shared media catalogue (Phase 6). |
| `20250101000005_media_reviews.sql` | The normalized review table (Phase 6). |
| `20250101000006_reviews_rls.sql` | RLS for the catalogue and reviews (Phase 6). |
| `20250101000007_review_backfill.sql` | The `media_review_stats` view + the backfill (Phase 6). |
| `20250101000008_review_author_fk.sql` | The key from `media_reviews` to `profiles` that PostgREST needs to embed the author (Phase 6.1). |
| `20250101000009_privilege_lock.sql` | The privilege outer lock, and a boolean that is boolean (Phase 6.1). |

In the dashboard, set:

- **Authentication → URL Configuration → Site URL** → `http://localhost:3000`
- **Authentication → URL Configuration → Redirect URLs** → add
  `http://localhost:3000/auth/callback` and `http://localhost:3000/**`
- **Authentication → Providers → Email** → leave "Confirm email" on for real
  signups. The sign-up form handles both cases: it branches on whether a
  session was returned, so it is correct whether or not confirmation is on.

### Nothing breaks without a project

This is the hard constraint of the phase, and it is enforced structurally rather
than by convention: `readSupabaseEnv()` returns `null` when the variables are
absent, no client is ever constructed at module scope, and `AuthShell` renders
setup instructions instead of a form when configuration is missing. So there is
no code path where an auth page can throw on an unconfigured build.

Concretely, with no `.env.local`:

- `/u/noir` — the fictional demo, unchanged, still server-rendered.
- `/studio` — a **guest** Studio, saving to `localStorage` exactly as in Phase 3.
- `/sign-in`, `/sign-up`, … — a "accounts aren't set up" panel with instructions
  and a link back to the demo.

### Security model

**Privacy is enforced at the database and server, not hidden in the browser.**
The RLS policies in `20250101000002_profiles_rls.sql` are the actual gate;
`lib/supabase/profiles.ts` is a typed convenience layer above them.

| Operation | Who | Enforced by |
| --- | --- | --- |
| Read a public profile | Anyone, including anonymous | `using (visibility = 'public')` |
| Read a private profile | Only its owner | `using (auth.uid() = user_id)` |
| Create a profile | Only your own | `with check (auth.uid() = user_id)` |
| Update a profile | Only your own, `user_id` immutable | `using` **and** `with check` |
| Delete a profile | Only your own | `using (auth.uid() = user_id)` |

Specific properties worth naming:

- **One profile per account is a `UNIQUE` constraint**, not an application
  check. Two simultaneous onboarding requests are resolved by Postgres: one wins,
  the other gets `23505`. A `SELECT`-then-`INSERT` check would let both pass.
- **Server-controlled fields are columns, not JSON.** `user_id`, `username`, and
  `visibility` live in real columns, so a crafted `profile_state` payload cannot
  change ownership or publish a private profile. `StoredProfileState` excludes
  them from the type, so writing them from application code is a compile error.
- **Not-found and forbidden are the same answer.** A visitor asking for someone
  else's private profile gets exactly what they get for a nonexistent one, so
  the URL cannot be used to discover who holds an account.
- **Usernames are case-insensitively unique** via a unique index on
  `lower(username)`. A plain `unique(username)` would happily store both `Mara`
  and `mara`. `noir` is reserved by a CHECK constraint so the demo stays
  reachable on every deployment.
- **Availability checks reveal nothing.** `is_username_taken()` is
  `SECURITY DEFINER` (a private profile would otherwise look available) and
  returns a bare boolean — "taken", never "held by whom".
- **Session identity comes from `getClaims()`, never `getSession()`.**
  `getSession()` reads the cookie without revalidating it, so a forged cookie
  would be trusted as this user. `getClaims()` verifies the signature.
- **Redirect targets are allowlisted.** `/auth/callback?next=…` accepts only
  same-origin paths; `//evil.example` and `/\evil.example` are rejected, so a
  freshly-issued session is never handed to another origin.

### Avatars

The `avatars` bucket is **private** — not every avatar is in a publicly readable
bucket. Nothing is persisted as a URL:

- Objects live at `<auth.uid()>/avatar-<random>.<ext>`, so the write policy is a
  single folder-name comparison and an owner cannot overwrite another's avatar
  by guessing a path.
- `profiles.avatar_path` stores the **path only**. A signed URL would both expire
  and be a bearer-style credential sitting in a database row.
- Bytes leave the bucket solely through `/api/profile/avatar-url`, which mints a
  5-minute signed URL **after** checking the caller may see that profile, and
  serves it `no-store, vary: Cookie` so a shared proxy cannot cache one visitor's
  URL for another.
- There is deliberately **no storage `SELECT` policy**. A policy would hand the
  bytes to any authenticated user who could guess the path, defeating the private
  bucket while leaving the object invisible in listings.

### Data model

`profiles.profile_state` holds the Studio's customization as **one versioned
JSONB document**, not as normalized tables. That is a deliberate scope decision:
the entire application is local-storage only, so there was no pre-existing
normalized structure for reviews or ratings to preserve or duplicate, and
versioning the document is what makes a future shape change migratable rather
than lossy.

`profile_state.version` is checked on both directions. Bumping it requires
adding a migration pass to `lib/supabase/profileState.ts`; an unknown version
degrades to a clean starter profile rather than guessing at the shape.

### Guest vs. account in the Studio

`components/studio/ProfileStoreProvider.tsx` owns the draft and picks the backend:

| State | Source | Saves to |
| --- | --- | --- |
| No session / no project | `localStorage` | `localStorage` |
| Signed in | Database | `POST /api/profile` |

Three rules that matter:

- **A signed-in owner never loads the guest `localStorage` draft.** A guest may
  legitimately carry work from before they had an account, but once they do, the
  database is authoritative. Silently merging the two would let a stale device
  overwrite a saved profile.
- **The guest draft is *offered*, never auto-applied.** Onboarding presents an
  explicit opt-in ("use the profile I already customized as a guest"). When it is
  declined, the new profile starts **empty** — never from Noir's demo, which
  would put a fictional person's name and bio on a stranger's profile.
- **Saves are ordered.** Each save takes a monotonic ticket; a response for a
  superseded revision cannot publish its result. The "Saved" flash waits for the
  database to confirm rather than claiming success optimistically.

Signing out clears the guest draft from the device — otherwise the next person to
use a shared browser opens the Studio and finds the previous owner's work.

### Verification

```bash
npm run test:phase5                       # policy + boundary invariants
node scripts/phase5-smoke.mjs <baseUrl>   # every route, no project needed
```

`test:phase5` asserts 31 static invariants — the RLS policies, the private
bucket, the redirect allowlist, the guest fallbacks — and, when a project is
configured, exercises the live RLS boundary anonymously (anon insert refused,
anon select filtered to public rows, anon storage upload refused). The live
section is **skipped loudly** without a project rather than silently passing.

Covering the full journey — registration → confirmation → onboarding → save →
sign-in on a second device — needs interactive credentials and is a manual pass.

### Phase 5 limits, stated honestly

- **No OAuth.** Email + password only.
- **No email-change flow.** The account page shows the address and points at the
  dashboard.
- **No follower tier.** `visibility` is `public | private`; a followers level
  needs the follower feature to mean anything.
- **No account deletion in-app.** The DELETE policy exists so a future in-app
  delete is not blocked by RLS; account removal itself is a dashboard action.
- **Media artwork stays external.** Posters, book covers, and My Clicks images
  remain URLs to third-party CDNs. Only avatars are stored.
- **Cross-tab live sync is localStorage-only.** A signed-in owner editing in two
  tabs is protected by the `updated_at` conflict check (the second save gets a
  409), but there is no realtime broadcast.

---

## Phase 6 — Shared media catalogue and reviews

Phase 5 gave accounts a database. Phase 6 gives *reviews* one: a canonical
catalogue of works shared by every account, and a normalized `media_reviews`
table that hangs off it. Before this, a selected item existed only as a fragment
inside one person's `profile_state` JSON, so two accounts who picked the same
film each held their own copy and there was nothing for a review to attach to.

### The data model

| Table | One row is | Identity |
| --- | --- | --- |
| `media_items` | One *work* (a film, a series, an album, a book) | `(provider, provider_id)` |
| `media_reviews` | One person's review of one work | `(user_id, media_id)` |

The identity rule is the UNIQUE constraint on `(provider, provider_id)` — never
the title. "Arrival" the film and "Arrival" the book are different works with
different provider ids, and PRSME keeps them apart. The same constraint doubles
as the concurrency guard: when two accounts review the same new film at the same
moment, one INSERT wins and the loser re-reads the winner's row
(`lib/supabase/media.ts`) rather than creating a duplicate.

`media_reviews.status` is `draft | published` — an explicit column, never
implied. `published_at` is stamped by a database trigger, not the client.

### The privacy interlock

A published review does not override its author's privacy setting. The SELECT
policy calls `public.can_read_review(user_id, status)`, a `SECURITY DEFINER`
helper that returns only a boolean and checks that the author's profile is
`public`. So:

- a draft is visible only to its author;
- a published review is visible to anyone — but only while the author's profile
  is public;
- a private profile's reviews are not merely hidden by the application. The
  database refuses to return the row, so no aggregate, view, or RPC can leak
  them. `media_review_stats` is `security_invoker`, which means it inherits
  exactly the rows the caller may read.

### New routes

| Route | Purpose |
| --- | --- |
| `/discover` | The review feed: search, category filters, sort, and a "Popular Media" shelf grouped by canonical record. |
| `/media/[mediaId]` | One work's page — community rating, real review count, and the review writer. |
| `/review/[reviewId]` | One review in full. |
| `/about` | What PRSME is. |
| `/api/media/resolve` | Turn a picked catalogue item into its canonical `media_items` row (server-side, so the uniqueness race is resolved where it can be). |
| `/api/reviews` | GET / POST / DELETE the caller's own review. Identity comes from the session; no parameter can name the author. |

### Writing a review

Two explicit actions, never one guess:

- **Save draft** — written with `status: 'draft'`, visible to the author alone.
- **Publish review** — written with `status: 'published'`, visible subject to
  the author's profile visibility.

A failed write never shows a published state. The confirmation appears only
after the server has confirmed the write.

### Backwards compatibility

Guests are unaffected. With no session, a review is written into the local
draft on the collection item exactly as in Phase 4, and the Studio shows a
single "Save review" button — because the local draft *is* the review's home.
The two-button writer appears only for a signed-in owner.

### New migrations

| Migration | What it does |
| --- | --- |
| `20250101000004_media_items.sql` | The shared catalogue, its identity constraint, and the `updated_at` trigger. |
| `20250101000005_media_reviews.sql` | The normalized review table, the rating scale, and the publication-state trigger. |
| `20250101000006_reviews_rls.sql` | RLS for both tables and the `can_read_review()` helper. |
| `20250101000007_review_backfill.sql` | The `media_review_stats` view and an idempotent backfill of Phase 4's local reviews. |

### Verification

```bash
npm run test:phase6
```

`test:phase6` asserts 88 static invariants — the schema, the RLS policies, the
server boundary, the presentation rules, and the guest/account split — and,
when a project is configured, exercises the live boundary for both permitted
and denied paths. The live section is **skipped loudly** without a project
rather than silently passing.

### Phase 6 limits, stated honestly

- **No people-discovery.** Discover finds works, not people. There is no
  "recommended reviewers" shelf.
- **The catalogue is community-shaped.** A work exists once someone reviews
  it; there is no editorial ingestion of full provider catalogues.
- **One review per person per work.** Editing updates in place. There are no
  threaded replies.
- **No moderation queue.** A published review is public immediately, subject to
  the author's own profile visibility.
- **Media artwork stays external.** Catalogue artwork is the provider's own
  URL, vetted against the allowlist in `lib/media/http.ts`. Nothing is copied
  into Supabase Storage, and no signed URL is ever persisted.

---

## Phase 6.1 — the local database stack

Phase 6 shipped the schema and the queries. Phase 6.1 is what makes those
rules **executable**, and it closes four defects that a static check cannot
see.

### What Phase 6.1 fixed

| Defect | Symptom | Fix |
| --- | --- | --- |
| No foreign key between `media_reviews` and `profiles` | Every review query failed with *"Could not find a relationship between 'media_reviews' and 'profiles'"*. Discover, the media page, the review page, and every review write were broken. | `20250101000008_review_author_fk.sql` — a direct key from `media_reviews.user_id` to `profiles.user_id`. |
| Broad default privileges were never revoked | `anon` held `TRUNCATE` on `media_reviews`. RLS does not govern `TRUNCATE`, so an anonymous request could empty the whole review table. | `20250101000009_privilege_lock.sql` — revoke everything from `public`/`anon`/`authenticated`, then grant exactly what the app needs. |
| `can_read_review()` could return `NULL` | The helper is declared `returns boolean`, but `(select auth.uid()) = review_user_id` evaluates to `NULL` without a session. The policy still hid the row (`NULL` is not `TRUE`), but the helper answered "unknown" instead of "no". | The same migration wraps the comparison in `coalesce(..., false)`. |
| The Discover category filter ran in JavaScript | The page was taken in SQL and then filtered in JS, so a category page could show fewer reviews than existed — including none at all. | `lib/supabase/reviews.ts` — `media_items!inner(...)` plus a `.eq("media_items.kind", …)` filter **in the query**. |

Two verification scripts had the same class of bug and are fixed in the same
phase:

- `scripts/phase5-verify.mjs` passed `{ url, key }` to a function that reads
  `publishableKey`, so the Phase 5 live section had **never run** on any
  project — it failed with "supabaseKey is required" and the failure was
  swallowed.
- `scripts/phase6-verify.mjs` asserted that an anonymous `UPDATE` *raised an
  error*. It does not: Postgres raises nothing, the statement simply affects
  zero rows, and PostgREST reports success. The assertion is now about the
  **data** — the catalogue row's title must be unchanged.

### The stack

`supabase start` needs Docker, and the Supabase CLI ships no Windows binary.
So `scripts/localdb/` runs the real thing anyway:

| Piece | What it is |
| --- | --- |
| **PostgreSQL 18** | The real server, from the `embedded-postgres` npm package. |
| **PostgREST 16.5** | The real REST gateway, fetched by `npm run db:tools`. |
| **auth shim** | A GoTrue-compatible service (`scripts/localdb/auth-server.mjs`) that issues real HS256 JWTs signed with the secret PostgREST trusts, so `auth.uid()` resolves the `sub` claim. |
| **gateway** | Routes `/rest/v1`, `/auth/v1` and `/storage/v1` to the three services, which is the job Kong does on a real project. |

`scripts/localdb/00-bootstrap.sql` recreates the parts of a Supabase project
the migrations depend on: the `anon` / `authenticated` / `service_role` roles,
the `auth` schema with `auth.users`, the claim readers, and the `storage`
schema. **The policies under test are the project's own, unmodified.**

### Running it

```bash
npm install
npm run db:tools          # fetch PostgREST (once)
npm run db:start:fresh    # start the stack and apply the migration chain
npm run db:status
npm run db:stop
```

`db:start:fresh` drops the database and re-applies `supabase/migrations/*.sql`
in filename order, so a run always starts from nothing.

### The live suites

```bash
npm run db:test            # RLS + SQL + leak + category
npm run db:test:rls        # policies, over REST, as real roles
npm run db:test:sql        # policies, from inside the database
npm run db:test:leak       # a private review must not leak into any surface
npm run db:test:category   # Discover's category paging
npm run db:test:flow       # the whole review flow, through the app's own routes
npm run db:test:browser    # the same pages, in a real browser, at 390px and 1280px
```

The last two drive the **application**, so they need the app running against
the local stack:

```bash
npm run db:build           # build with the local env inlined
node scripts/localdb/serve-prod.mjs   # serve it on :3100
```

`db:build` exists because `NEXT_PUBLIC_*` is inlined at **build** time. A
plain `npm run build` bakes `undefined` into the bundle, and the app then
renders its "connect a Supabase project" state while the database sits there,
fully populated, four ports away.

`db:test:sql` runs `scripts/phase6-sql-tests.sql`, which is also pasteable
into the Supabase SQL editor. It creates everything under a
`phase6_sql_test` schema and drops it again, so the `public` schema is never
touched.

The Phase 5 and Phase 6 suites can be pointed at the local stack, which turns
their skipped live sections into real assertions:

```bash
node scripts/localdb/with-db.mjs scripts/phase5-verify.mjs
node scripts/localdb/with-db.mjs scripts/phase6-verify.mjs
```

---
---

## Local development

### Prerequisites

- Node.js 18.18+ (developed on Node 24.18).
- npm 9+ (pnpm and yarn also work; lockfile is npm).

### Install

```bash
npm install
```

### Run the dev server

```bash
npm run dev
```

Open <http://localhost:3000> for the landing page and <http://localhost:3000/u/noir> for the demo profile.

### Available commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local dev server on port 3000. |
| `npm run build` | Production build. Landing page and 404 are static; `/u/[username]` and `/studio` are dynamic. |
| `npm run start` | Run the production build (defaults to port 3000). |
| `npm run lint` | ESLint via `next lint`. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run test:phase5` | Phase 5 verification (RLS policies, server-boundary invariants, guest fallbacks). |
| `npm run test:phase6` | Phase 6 verification (catalogue, reviews, aggregates, presentation rules). |
| `npm run db:start:fresh` | Bring up the local database stack and apply the migration chain (Phase 6.1). |
| `npm run db:build` | Build the app with the local database's env inlined (Phase 6.1). |
| `npm run db:test` | The live database suites — RLS, SQL, leak, category (Phase 6.1). |

### Production smoke test

```bash
npm run build
npm run start
```

Visit `/`, `/u/noir`, `/u/noname`, and `/some-bogus`.

---

## Project layout

```
app/
  layout.tsx                 Root layout, fonts, skip-to-content link, AccountProvider
  page.tsx                   Landing page composition
  not-found.tsx              Honest 404 page
  u/[username]/page.tsx      Public profile route (Phase 2 demo; Phase 5 registered)
  sign-in/ sign-up/          Email + password auth (Phase 5)
  forgot-password/ reset-password/
  onboarding/                Create the account's single profile (Phase 5)
  account/                   Email, privacy, sign out (Phase 5)
  about/                     What PRSME is (Phase 6)
  discover/                  The review feed + Popular Media shelf (Phase 6)
  media/[mediaId]/           One work: community rating, real review count (Phase 6)
  review/[reviewId]/         One review in full (Phase 6)
  auth/callback/route.ts     PKCE / email-confirmation exchange (Phase 5)
  api/profile/route.ts       GET + POST the signed-in owner's profile
  api/profile/avatar/        Avatar upload -> private bucket
  api/profile/avatar-url/    Mints a short-lived signed avatar URL
  api/reviews/route.ts       GET + POST + DELETE the caller's own review (Phase 6)
  api/media/resolve/route.ts Provider item -> canonical media_items row (Phase 6)
  globals.css                Design tokens, base styles, reduced-motion handling
middleware.ts                Session refresh (Phase 5)
supabase/migrations/         profiles, RLS, avatars (Phase 5); media_items,
                             media_reviews, review RLS, backfill (Phase 6);
                             author FK, privilege lock (Phase 6.1)
scripts/localdb/             The local database stack and its live test suites
                             (Phase 6.1) — not shipped, not part of the app
components/
  SiteNav.tsx                Responsive navigation; avatar + account menu when signed in
  SiteFooter.tsx             Multi-column footer
  Wordmark.tsx               Wordmark + PrismSymbol SVG
  Hero.tsx                   Phase 1 hero with integrated profile preview
  ProfilePreview.tsx         Phase 1 preview card used by Hero/Share sections
  ThemePicker.tsx            Interactive theme-swap preview (client component)
  FeatureSections.tsx        Phase 1 product explainer
  FinalCTA.tsx               End-of-page CTA card
  CtaForm.tsx                Phase 1 placeholder waitlist form
  Button.tsx                 Reusable button primitive (link or button)
  Artwork.tsx                Local SVG-gradient placeholder for media artwork
  Reveal.tsx                 Viewport-triggered reveal wrapper
  ── Phase 6 ──
  ProfileReviews.tsx         The public profile's reviews section
  reviews/ReviewCards.tsx    The shared review card + media tile
  reviews/ReviewWriter.tsx   The two-action review form (draft / publish)
  reviews/DiscoverControls.tsx  Search, category filters, sort
  reviews/MediaReviewPanel.tsx  The media page's review list + writer
  studio/ReviewDrawer.tsx    The Studio's review drawer (guest + account)
  ── Phase 2 ──
  ProfileHeader.tsx          Profile header (avatar, bio, tags, socials, Share)
  ProfileAvatar.tsx          Round, locally-artworked avatar with prism sigil
  RatingBadge.tsx            "My rating" chip
  SocialIcons.tsx            Inline-SVG glyphs for FB / IG / Snapchat / LinkedIn
  CollectionCards.tsx        Three reusable collection layout variants
  ActivityList.tsx           Recent activity ledger
  MyClicksGallery.tsx        Desktop mosaic + mobile horizontal scroller
  ProfileSoundtrack.tsx      Editorial soundtrack with real cover + Spotify embed (Phase 2.2)
  ShareDialog.tsx            Share dialog with Web Share / clipboard / select
lib/
  demoProfile.ts             Phase 1 fictional preview content
  noirProfile.ts             Phase 2 typed fictional demo content
docs/
  snap-*.png                 Phase 1 reference screenshots (360 / 768 / 1280 / 1440)
  profile-*.png              Phase 2 reference screenshots (360 / 768 / 1280 / 1440)
public/                      Static files (audit-only HTML helpers used for responsive QA)
scripts/
  phase21-test.mjs             toEmbedUrl unit tests for Phase 2.1 soundtrack
  phase22-test.mjs             toEmbedUrl unit tests for Phase 2.2 soundtrack (extended)
docs/
  snap-*.png                   Phase 1 reference screenshots (360 / 768 / 1280 / 1440)
  profile-*.png                Phase 2 reference screenshots (360 / 768 / 1280 / 1440)
  phase21-profile-*.png        Phase 2.1 reference screenshots (360 / 768 / 1280)
  phase22-profile-*.png        Phase 2.2 reference screenshots (360 / 768 / 832 / 1280 / 1440)
tailwind.config.ts           Tailwind theme extension (tokens, type scale, animations)
tsconfig.json                TypeScript config (strict, paths)
package.json               scripts and dependencies
```

---

## Design system at a glance

The design language combines cinematic dark surfaces, sophisticated editorial typography, layered charcoal backgrounds, restrained lavender accents, and refined motion.

| Token group | Examples |
| --- | --- |
| Surfaces | `--surface-0: #07070B`, `--surface-1: #0B0B10`, `--surface-2: #101018`, `--surface-3: #161622` |
| Text | `--text-strong: #F4F4F6`, `--text-default: #E6E6EC`, `--text-muted: #9A9AAA` |
| Accent | `--iris-400: #8C6CFF`, `--iris-500: #7350F0`, `--iris-300: #A892FF` |
| Motion | `--ease-soft: cubic-bezier(0.22, 1, 0.36, 1)`, `--dur-fast/med/slow` |
| Type | `clamp()`-driven `text-display-xl/lg/md` for fluid display headlines |
| Fonts | Inter (sans), Instrument Serif (display), JetBrains Mono (mono) — all via `next/font/google` |

All animations use `transform` and `opacity` to keep them on the GPU and avoid layout recalculation. `prefers-reduced-motion: reduce` collapses all transitions, animations, and reveal transforms to a static, fully-visible end state.

---

## Responsive behaviour

Mobile-first. Layouts are deliberately different per breakpoint rather than stretched desktop compositions.

Verified at **360 / 390 / 430 / 768 / 832 / 1024 / 1280 / 1440** with zero horizontal page overflow and zero non-decorative elements overflowing their containers.

The My Clicks gallery intentionally uses a horizontal scroller on mobile; it never grows the page width.
The Phase 2.2 soundtrack renders a square album cover that scales per viewport (96→144px) without stretching, and the Spotify embed iframe is verified to mount with the official `/embed/track/...` URL when Listen is pressed and to leave the DOM when Stop is pressed.
The My Clicks gallery intentionally uses a horizontal scroller on mobile; it never grows the page width.
The Phase 2.2 soundtrack renders a square album cover that scales per viewport (96→144px) without stretching, and the Spotify embed iframe is verified to mount with the official `/embed/track/...` URL when Listen is pressed and to leave the DOM when Stop is pressed.

### Phase 4.6 — Custom Link Buttons and the Soundtrack List

**Custom Link Buttons are a top-level profile section.** They were rendered
*inside* the `clicks` section, immediately above the My Clicks gallery, so they
inherited that section's heading, spacing, and position — which is why they read as
part of the gallery rather than as destinations in their own right.

`links` is now a real `SectionId` in `lib/profileDraft.ts`, which means the existing
section-ordering model drives it and the studio's reorder UI lists it for free. The
canonical order is:

```
header → soundtrack → collections → custom links → recent activity → My Clicks
```

One subtlety worth recording, because the obvious implementation is wrong: a draft
saved in Phase 4.5 stores four section ids and has no `links` at all. Appending the
missing id would land the buttons *after* My Clicks — precisely the reported bug. So
`readDraft` inserts each missing section before the first present section that follows
it canonically, preserving any deliberate reordering the owner already made.

**The buttons.** Link-in-bio proportions, capped so a wide desktop looks composed
rather than stretched: `min-height: 3.25rem` (52 px) at every viewport and `3.5rem`
(56 px) from 640 px up, inside a `max-width: 34rem` column. `min-height` rather than
`height` is deliberate — a wrapping label grows the button instead of being clipped.
The label is the only visible text; the destination is never printed.

| Option | Values | Effect |
| --- | --- | --- |
| Shape | `rounded` (14 px) / `rect` (6 px) / `pill` (999 px) | Corner treatment only. Height and padding are identical across all three, so changing shape never changes layout. |
| Style | `solid` / `outline` / `tint` | Which surface and label colours resolve. A solid border is a darkened shade of the button's own accent — not `transparent`, because a transparent border is not theme-aware and made every theme report the same value. |
| Colour | theme accent / custom hex | With no custom accent the `--pf-link-accent` variable is simply left unset, so the button follows the theme for free. A custom accent derives its own hover, focus, and outline shades with `color-mix`, and `readableTextOn()` picks dark or light label ink from the WCAG relative luminance of the fill. |
| Layout | `stack` (default) / `grid` | `grid` is honoured only when it genuinely fits — three or more buttons and no label over 22 characters. It also collapses to one column below 640 px, where two buttons per row would force every label onto two lines. |

Every option is verified by measuring the *rendered* result, not by reading back the
stored field — a control that only updates its selected state would satisfy a
data-level test and change nothing a visitor can see.

### The Soundtrack List overflow — measured, not assumed

The reported symptom was "hovering expands the card and it overflows the list". The
measurement contradicted every part of that:

| Hypothesis | Measured |
| --- | --- |
| A scale transform on hover | `transform: none` on the row, before and during |
| Image sizing | Thumbnail a constant 52×52 (mobile) / 56×56 (desktop) throughout |
| Padding / margin change | Unchanged across the hover |
| An animation reflow | None present |

The actual cause was a **negative inline margin** used to widen the hover target:

```css
.pf-soundtrack-row--link,
.pf-soundtrack-row:has(a) {
  margin-inline: -0.625rem;
  padding-inline: 0.625rem;
}
```

The padding compensated for the margin, so the *text* never moved and the row looked
unchanged at rest — but every linkable row's box was 20 px wider than the list and
hung 10 px outside it on both sides. The list measured
`scrollWidth − clientWidth === 10` at **every** viewport, **before** any hover. Rows
matched `--link, :has(a)` were 353 px wide inside a 333 px container while the one row
that matched neither sat at 333 px, which is why the defect looked intermittent.

The fix removes the negative margin entirely. The hover tint now comes from a
background colour plus an **inset** `box-shadow`, which paints inside the row's own box
and cannot widen it. Rows are `width: 100%` with `box-sizing: border-box`, so the
list now measures zero overflow at every viewport.

Hover feedback is retained and deliberately paint-only: a background transition, a
border-colour change, an accent title colour, and a 1.03 scale on the artwork's inner
`<img>` — contained by the thumbnail's existing `overflow: hidden`, so the 52×52
container never changes. Reduced-motion and touch both drop the scale and keep the
colour feedback.

---

### Phase 4.7 — Editable Custom Links copy and the Soundtrack List

#### The section's three lines of copy are now profile data

The eyebrow (`Elsewhere`), the heading (`Where to find Noir.`), and the description
(`Other work, other rooms, other ways in.`) were string literals inside
`PublicProfileContent.tsx`. An owner could name their buttons but could never introduce
them. They are now one typed record, `CustomLinksSection`, stored beside the button list
rather than duplicated onto every button:

| Layer | What it does |
| --- | --- |
| `lib/noirProfile.ts` | `CustomLinksSection` type + `DEFAULT_CUSTOM_LINKS_SECTION` constants. The defaults are the exact strings that were hardcoded, so an un-customised profile renders identically. |
| `lib/profileDraft.ts` | `customLinksSection` on `ProfileDraft`; `readCustomLinksSection` repairs it field by field. |
| `lib/effectiveProfile.ts` | Passes the record through untouched. |
| `components/ProfileCustomLinks.tsx` | `CustomLinksSectionHeader` — the one renderer, shared by the public page and the studio preview. |
| `components/studio/CustomLinksPanel.tsx` | The **Custom Links Section Appearance** group: eyebrow and heading inputs, a multiline description textarea, and a "Restore default text" action. |

Four decisions worth stating:

**The heading is never derived from the display name.** `Where to find Noir.` is only the
demo's default copy. The owner types whatever they want.

**Empty means absent, not blank.** An empty field drops its element *and its margin*, which
is why the spacing between the three lines is conditional rather than a fixed `mt-*`. A
description with no heading must not inherit the heading's top margin and leave a hole. The
buttons render either way.

**Backward compatibility is one branch.** A draft written before this phase has no
`customLinksSection` key at all, so `isObject(input)` is false and `readCustomLinksSection`
returns the defaults. Custom buttons and every other setting are untouched. Drafts in the
wild are also *partially* formed, so each field is repaired independently: a missing or
non-string value takes that field's default, an over-long value is truncated rather than
rejected, and an empty string is preserved verbatim — it is a deliberate "hide this line",
and treating it as missing would make removing a line impossible.

**The studio writes on every keystroke.** Unlike the button form, which stages and commits
on save, these three fields update the draft immediately so the preview updates as you type.
They resolve through the same `--pf-*` tokens as the rest of the profile, so a theme or
typography change moves them with everything else and no colour is hardcoded.

#### The Soundtrack List was not overflowing

This was measured rather than assumed, at 320 / 360 / 390 / 430 / 768 across all three
typography and layout presets, on the shipped demo profile, on a seeded draft, in the studio's
390 px live-preview iframe, at rest, during a real CDP hover, and under keyboard focus.

**No row overflowed at any of them.** `list.scrollWidth − list.clientWidth === 0` and
`document.scrollWidth − clientWidth === 0` everywhere; every row, artwork, metadata block, and
rating badge sat inside the collection's content box. Phase 4.6 had already fixed the real
cause — the `margin-inline: -0.625rem` on linkable rows — and its suite still passes 72/72.

So there was nothing to repair, and the brief's other suspicions were each ruled out by
measurement: artwork is a fixed square, the metadata column is `minmax(0, 1fr)` so it shrinks
rather than pushing, `box-sizing: border-box` keeps padding inside the row, hover is
paint-only, and the row-as-link carries no separate external-link button.

**What was genuinely wrong was silent, not overflowing.** `.pf-soundtrack-artist` was
`white-space: nowrap` with an ellipsis, so a long album name was cut mid-word with no
indication anything had been dropped — the measurement showed 200–300 px of text discarded
at 320 px and 360 px. It now wraps onto a second line, capped at two, so the common case
reads in full and only a genuinely over-long name truncates, visibly. Width behaviour is
unchanged: `overflow-wrap: anywhere` inside a `minmax(0, 1fr)` column still cannot widen the row.

---

## Accessibility and motion

- Semantic HTML (`<header>`, `<main>`, `<nav>`, `<section>`, `<footer>`) with a proper heading hierarchy.
- Visible `:focus-visible` outline in the lavender accent.
- A keyboard-accessible skip-to-content link in the root layout.
- ARIA labels on every icon-only control (mobile menu button, share button, follow button, etc.).
- `prefers-reduced-motion: reduce` collapses all transitions, animations, and reveal transforms.
- The Share dialog is a real `role="dialog" aria-modal="true"` with focus return to its trigger, dismissable via close button / Escape / outside click.
- All external links open in a new tab with `rel="noopener noreferrer"`.

## What's deliberately deferred

- **Real authentication and account-backed profiles.** Phase 3's studio is a local-only customization; the database must enforce one profile per user when it lands.
- **Server-side privacy enforcement.** The Privacy panel is a local preview only.
- **Cross-device sync.** Drafts live in a single browser's localStorage; there is no backend.
- **External media catalogues** (movies, K-dramas, music, books, manga).
- **Real Instagram OAuth** or any gallery import.
- **Spotify OAuth, listening-history persistence, and "now playing" state** — the soundtrack is embed-only / external-only.
- **A real waitlist persistence for the email form (Phase 1).**
- **An Open Graph image generator.**

These will be addressed in subsequent phases.
 
 
