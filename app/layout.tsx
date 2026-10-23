import type { Metadata, Viewport } from "next";
import {
  Inter,
  Instrument_Serif,
  JetBrains_Mono,
  Space_Grotesk,
  Cormorant_Garamond,
  DM_Sans,
  Manrope,
  IBM_Plex_Mono,
  Outfit,
} from "next/font/google";
import "./globals.css";
import { THEME_BOOT_SCRIPT } from "@/lib/themeBoot";
import { AccountProvider } from "@/components/auth/AccountProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const display = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-display",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

/* ---- Phase 4.3 typography additions ----
 *
 * Each of the five new typography presets needs at least one family that the
 * project did not already ship. They are declared here (rather than in the
 * presets) so `next/font` owns every download, self-hosting, and
 * preload hint — the profile never requests a stylesheet from a third party at
 * runtime. Every family below has a `system-ui` / `serif` / `monospace`
 * fallback declared in `lib/profileTheme.ts`, so a blocked font file degrades
 * to a sane local face instead of falling back to Times.
 *
 * Weights are kept to the minimum each role needs: the display face is only
 * ever used at a heading weight, so two is the cap. */
const grotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-grotesk",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-cormorant",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-manrope",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://prsme.local"),
  title: {
    default: "PRSME — All the things that make you, you",
    template: "%s · PRSME",
  },
  description:
    "PRSME turns your taste in entertainment, your interests, your memories, and your aesthetic into a shareable digital identity.",
  applicationName: "PRSME",
  openGraph: {
    title: "PRSME — All the things that make you, you",
    description:
      "Build a profile that's unmistakably yours — themes, collections, reviews, and a link worth sharing.",
    type: "website",
    siteName: "PRSME",
  },
  twitter: {
    card: "summary_large_image",
    title: "PRSME — All the things that make you, you",
    description:
      "Build a profile that's unmistakably yours — themes, collections, reviews, and a link worth sharing.",
  },
  icons: {
    icon: [
      {
        url:
          "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='%230B0B10'/><path d='M14 18 L24 46 L32 26 L40 46 L50 18' stroke='%238C6CFF' stroke-width='3.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>",
        type: "image/svg+xml",
      },
    ],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0B0B10",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={
        `${inter.variable} ${display.variable} ${mono.variable} ` +
        `${grotesk.variable} ${cormorant.variable} ${dmSans.variable} ` +
        `${manrope.variable} ${plexMono.variable} ${outfit.variable}`
      }
      data-theme="obsidian"
      suppressHydrationWarning
    >
      <head>
        {/* Pre-paint theme bootstrap to prevent FOUC when navigating to a
            route whose theme was customized on /studio. Reads the localStorage
            draft and sets <html data-theme> + the corresponding token block. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-ink-950 text-muted-100 antialiased">
        <a
          href="#main"
          className="sr-only-focusable fixed left-3 top-3 z-[60] rounded-md bg-iris-400 px-3 py-2 text-sm font-medium text-ink-950 shadow-glow focus:not-sr-only"
        >
          Skip to content
        </a>
        {/*
          * Phase 5 — one session subscription for the whole app.
          *
          * `AccountProvider` reads the Supabase session and publishes it to
          * `useAccount()`. It is mounted here, at the root, rather than in each
          * page so the nav and the Studio share a single subscription instead of
          * each opening their own.
          *
          * It degrades to `unconfigured` when no Supabase project is attached,
          * which is why this wrapper is safe on a build with no credentials:
          * nothing below it calls `createClient()` unless configuration exists.
          */}
        <AccountProvider>{children}</AccountProvider>
      </body>
    </html>
  );
}