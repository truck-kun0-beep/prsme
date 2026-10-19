import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";

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
      className={`${inter.variable} ${display.variable} ${mono.variable}`}
    >
      <body className="min-h-dvh bg-ink-950 text-muted-100 antialiased">
        <a
          href="#main"
          className="sr-only-focusable fixed left-3 top-3 z-[60] rounded-md bg-iris-400 px-3 py-2 text-sm font-medium text-ink-950 shadow-glow focus:not-sr-only"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}