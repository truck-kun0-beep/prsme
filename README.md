# PRSME — Phases 1, 2, 2.1 & 2.2

> All the things that make you, you.

A premium, Gen-Z-oriented media identity and customizable profile platform. PRSME turns your taste in entertainment, your interests, your memories, and your personal aesthetic into a shareable digital identity.

The repository currently ships:

- **Phase 1** — landing page + design system.
- **Phase 2** — public profile experience at `/u/[username]` with collections, activity, share, and "My Clicks" gallery.
- **Phase 2.1** — profile polish and soundtrack near the top of the profile.
- **Phase 2.2** — soundtrack refinement with a verified real Spotify track and real cover artwork, plus 832px and additional 360/390/430/1024/1280/1440 regression checks.

Authentication, the profile editor, and external media catalogue integrations arrive in later phases.

---

## Routes

| Route | What it shows |
| --- | --- |
| `/` | Marketing landing page (Phase 1). |
| `/u/noir` | Public demo profile for Noir Aldridge (Phase 2). |
| `/u/anything-else` | Meaningful not-found state. |
| Any unknown path | Phase 1 404 page. |

---

## What's in Phase 2

- A typed `lib/noirProfile.ts` modeling the owner, collections, items, social links, recent activity, and the "My Clicks" gallery.
- A reusable **profile header** (avatar, identity, tags, social links, Share action) — `components/ProfileHeader.tsx`.
- A real **Share dialog** (Web Share API + clipboard + manual-select fallback, with Esc / outside-click dismissal and focus return) — `components/ShareDialog.tsx`.
- Three collection layout variants driven by `layout` in the data:
  - **Poster grid** for films / TV / K-dramas — `components/CollectionCards.tsx` (PosterGridCollection).
  - **Featured** with a hero artwork + adjacent list, suited for books — `FeaturedCollection`.
  - **Compact** list suited for music and manga — `CompactCollection`.
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

- **One profile per authenticated account.** The eventual database must enforce this with a unique constraint (e.g. unique `owner_id` on a `profiles` table). Frontend buttons cannot guarantee uniqueness.
- **"Create profile" is onboarding for an account's single profile.**
- After authentication ships, the global navigation will place the authenticated user's avatar at the far right with an accessible menu.
- The **public profile avatar** and the **account-navigation avatar** serve different purposes — they are not duplicated unnecessarily inside the global navigation.
- The signed-in owner will later be able to edit their bio, tags, links, soundtrack, and presentation from a profile studio.

### Phase 2.1 — Integration limits

- The soundtrack component supports **Spotify embeds only** in this phase. The data model is provider-typed so other providers can be added later.
- No Spotify OAuth, listening-history persistence, or "now playing" state — embed-only.
- The current demo uses a verified real Spotify track (see Phase 2.2 above). No track ID was fabricated.

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
| `npm run build` | Production build. Landing page and 404 are static; `/u/[username]` is dynamic. |
| `npm run start` | Run the production build (defaults to port 3000). |
| `npm run lint` | ESLint via `next lint`. |
| `npm run typecheck` | `tsc --noEmit`. |

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
  layout.tsx                 Root layout, fonts, skip-to-content link
  page.tsx                   Landing page composition
  not-found.tsx              Honest 404 page
  u/[username]/page.tsx      Public demo profile route (Phase 2)
  globals.css                Design tokens, base styles, reduced-motion handling
components/
  SiteNav.tsx                Responsive navigation with mobile drawer
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

- Authentication, profile persistence, and editing flows (the database must enforce one profile per user when it lands).
- External media catalogues (movies, K-dramas, music, books, manga).
- Real Instagram OAuth or any gallery import.
- Spotify OAuth, listening-history persistence, and "now playing" state — the soundtrack is embed-only.
- A real waitlist persistence for the email form (Phase 1).
- An Open Graph image generator.

These will be addressed in subsequent phases.#   p r s m e  
 