import type { Metadata } from "next";
import { StudioClient } from "@/components/studio/StudioClient";

export const metadata: Metadata = {
  title: "Customization Studio",
  description:
    "Local-only demo of the PRSME profile customization studio. Adjust theme, identity, sections, soundtrack, and socials; saves to your browser only.",
  robots: { index: false, follow: false },
};

// Render the studio client-side only — the panel components use React
// hooks (state, effects, refs) that depend on the localStorage hydration
// step. Skipping SSR keeps the markup consistent with what the user gets
// after hydration and avoids a brief "blank shell then content" flash.
export const dynamic = "force-dynamic";

export default function StudioPage() {
  return <StudioClient />;
}