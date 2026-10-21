/** Static panel definitions used by the Studio shell and other internals. */

export type PanelId =
  | "appearance"
  | "identity"
  | "collections"
  | "sections"
  | "soundtrack"
  | "privacy";

export interface PanelDefinition {
  id: PanelId;
  label: string;
  description: string;
}

export const PANEL_DEFINITIONS: PanelDefinition[] = [
  {
    id: "appearance",
    label: "Appearance",
    description:
      "Theme, typography, layout, and background. Tweak the overall feel of the profile.",
  },
  {
    id: "identity",
    label: "Identity",
    description:
      "Display name, biography, location, pronouns, interest tags, social links, and avatar.",
  },
  {
    id: "collections",
    label: "Collections",
    description:
      "Rename, describe, choose layout, reorder, show or hide, and create new collection sections.",
  },
  {
    id: "sections",
    label: "Sections",
    description:
      "Show or hide the soundtrack, collections, recent activity, and My Clicks. Reorder them.",
  },
  {
    id: "soundtrack",
    label: "Soundtrack",
    description:
      "Toggle the soundtrack section and edit its Spotify link, title, and artist.",
  },
  {
    id: "privacy",
    label: "Privacy",
    description:
      "Public, followers, or private. Local-only setting — server enforcement comes later.",
  },
];
