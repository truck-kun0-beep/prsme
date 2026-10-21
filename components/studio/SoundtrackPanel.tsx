"use client";

import { useState } from "react";
import { useProfileDraft } from "@/components/ProfileDraftProvider";
import { useSpotifyEmbed } from "@/components/useSpotifyEmbed";
import { validateSpotifyUrl } from "@/lib/validate";
import type { ProfileSoundtrack } from "@/lib/noirProfile";
import { PanelCard, FieldGroup, TextInput } from "./StudioFields";
import { IconReset, IconCheck, IconSpinner, IconSearch } from "./StudioIcons";
import { MediaPicker } from "./MediaPicker";
import { Artwork } from "@/components/Artwork";
import type { MediaRecord } from "@/lib/media/types";

const DEMO_SOUNDTRACK: ProfileSoundtrack = {
  provider: "spotify",
  trackUrl: "https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh",
  trackTitle: "Prelude for Piano No. 11 in F-Sharp Minor",
  trackArtist: "Eduard Abramyan, Sona Shaboyan",
  albumTitle:
    "Abramyan: Preludes – Rachmaninoff: Sonata No. 2 in B-Flat Minor, Op. 36 – Babadjanyan: Capriccio, Improvisation, Folksong, Elegy, Poem",
  coverUrl: "https://i.scdn.co/image/ab67616d0000b2734f61e186facbb486f79e9fd9",
  coverSource: "Album artwork from Spotify's public CDN",
  palette: "violet",
  externalUrl:
    "https://open.spotify.com/album/6fu8fvc7O4p8Gb8KMTBTUW",
};

export function SoundtrackPanel() {
  const { draft, update } = useProfileDraft();
  const soundtrack = draft.soundtrack;
  const enabled = Boolean(soundtrack?.trackUrl);
  const [searchOpen, setSearchOpen] = useState(false);

  function setEnabled(on: boolean) {
    if (on) {
      update({ soundtrack: { ...DEMO_SOUNDTRACK } });
    } else {
      update({ soundtrack: null });
    }
  }

  function patch(p: Partial<ProfileSoundtrack>) {
    if (!soundtrack) return;
    update({ soundtrack: { ...soundtrack, ...p } });
  }

  return (
    <div className="space-y-4">
      {searchOpen && (
        <MediaPicker
          initialKind="album"
          allowedKinds={["song", "album"]}
          collectionName="your soundtrack"
          onSelect={(record: MediaRecord) => {
            // Replace the whole soundtrack metadata set. The brief is explicit:
            // never keep the previous album cover after picking a new result.
            update({
              soundtrack: {
                ...(soundtrack ?? { provider: "spotify", trackUrl: "" }),
                provider: "spotify",
                trackTitle: record.title,
                trackArtist: record.creator ?? "",
                albumTitle: record.alternateTitle ?? record.title,
                coverUrl: record.coverUrl ?? undefined,
                coverSource: record.coverSource ?? undefined,
                externalUrl: record.externalUrl,
                palette: "violet",
              },
            });
            setSearchOpen(false);
          }}
          onClose={() => setSearchOpen(false)}
        />
      )}
      <PanelCard
        testId="studio-soundtrack-toggle"
        title="Profile soundtrack"
        description="One Spotify link per profile. The card opens the configured link in a new tab."
      >
        <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--line-soft)] bg-[var(--surface-2)] px-3 py-3">
          <label
            htmlFor="f-st-enabled"
            className="text-[12px] font-medium text-[var(--text-default)]"
          >
            Show soundtrack section
          </label>
          <span className="flex items-center gap-2">
            <input
              id="f-st-enabled"
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent-400)]"
              data-testid="studio-soundtrack-toggle"
            />
            <span className="text-[11px] text-[var(--text-muted)]">
              {enabled ? "On" : "Off — no panel on the public profile"}
            </span>
          </span>
        </div>
      </PanelCard>

      {soundtrack && (
        <PanelCard
          testId="studio-soundtrack-edit"
          title="Edit soundtrack"
          description="Album and single artwork is sourced from Spotify or the catalogue you searched — we do not host images."
        >
          {/* Live artwork preview so the owner can see the cover actually
              change when they pick a different release. */}
          <div
            className="mb-3 flex items-center gap-3"
            data-testid="studio-soundtrack-cover"
          >
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-[var(--line-soft)]">
              <Artwork
                palette={soundtrack.palette ?? "violet"}
                src={soundtrack.coverUrl}
                ratio="auto"
                alt={`${soundtrack.trackTitle ?? "Soundtrack"} cover`}
                className="!rounded-none"
              />
            </div>
            <div className="min-w-0 text-[11px] text-[var(--text-muted)]">
              {soundtrack.coverUrl ? (
                <p data-testid="studio-soundtrack-cover-source">
                  Artwork: {soundtrack.coverSource ?? "catalogue"}
                </p>
              ) : (
                <p data-testid="studio-soundtrack-cover-none">
                  No artwork for this link — the profile shows the PRSME placeholder.
                </p>
              )}
            </div>
          </div>
          <FieldGroup id="f-st-title" label="Track title">
            <TextInput
              id="f-st-title"
              value={soundtrack.trackTitle ?? ""}
              onChange={(e) => patch({ trackTitle: e.target.value })}
              placeholder="e.g. Prelude for Piano No. 11"
            />
          </FieldGroup>
          <FieldGroup id="f-st-artist" label="Artist">
            <TextInput
              id="f-st-artist"
              value={soundtrack.trackArtist ?? ""}
              onChange={(e) => patch({ trackArtist: e.target.value })}
              placeholder="Artist or composer"
            />
          </FieldGroup>
          <FieldGroup
            id="f-st-url"
            label="Spotify URL"
            hint="Track, album, playlist, or show URL on open.spotify.com. Title and artwork are resolved automatically via Spotify's oEmbed — tracks and albums get a title but no cover art from Spotify, so those fall back to PRSME artwork."
          >
            <SoundtrackUrlField
              value={soundtrack.trackUrl ?? ""}
              onChange={(next) =>
                // Changing the link invalidates the current cover: never keep
                // showing the previous track's artwork under a new title.
                patch({
                  trackUrl: next,
                  coverUrl: undefined,
                  coverSource: undefined,
                })
              }
              onCoverResolved={(data) => {
                patch({
                  trackUrl: data.trackUrl,
                  // Use Spotify's title as metadata; the owner can still edit
                  // the display text afterwards.
                  ...(data.title ? { trackTitle: data.title } : {}),
                  ...(data.thumbnailUrl
                    ? {
                        coverUrl: data.thumbnailUrl,
                        coverSource: "Spotify",
                      }
                    : { coverUrl: undefined, coverSource: undefined }),
                });
              }}
            />
          </FieldGroup>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              data-testid="studio-soundtrack-search"
              onClick={() => setSearchOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-default)] hover:bg-[var(--surface-3)]"
            >
              <IconSearch size={12} /> Search a catalogue cover
            </button>
            <button
              type="button"
              onClick={() => update({ soundtrack: { ...DEMO_SOUNDTRACK } })}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line-soft)] bg-[var(--surface-2)] px-3 py-1.5 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-strong)]"
              data-testid="studio-soundtrack-restore-demo"
            >
              <IconReset size={12} /> Restore demo soundtrack
            </button>
          </div>
        </PanelCard>
      )}
    </div>
  );
}

/**
 * URL editor with live oEmbed resolution.
 *
 * - Validates on every keystroke (no network call for invalid input).
 * - Debounces 600 ms after the user pauses typing.
 * - Cancels any in-flight network request when the URL or the panel unmounts
 *   so a stale answer can never overwrite a fresher selection.
 */
function SoundtrackUrlField({
  value,
  onChange,
  onCoverResolved,
}: {
  value: string;
  onChange: (next: string) => void;
  onCoverResolved: (data: {
    trackUrl: string;
    title: string | null;
    thumbnailUrl: string | null;
  }) => void;
}) {
  // The oEmbed hook listens on `url` and triggers `onResolved` on success.
  // We pipe the resolved metadata straight back to the parent so the draft
  // stays in sync.
  const { status } = useSpotifyEmbed(value, {
    onResolved: (data) => onCoverResolved(data),
  });

  const validation = validateSpotifyUrl(value);
  const looksValid = validation.ok;
  const statusLine = (() => {
    switch (status.kind) {
      case "idle":
        return null;
      case "loading":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
            <IconSpinner size={11} /> Looking up on Spotify…
          </span>
        );
      case "stale":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
            <IconSpinner size={11} /> Resolving…
          </span>
        );
      case "error":
        return (
          <span role="alert" className="text-[11px] text-[color:#D6757B]">
            {status.error}
          </span>
        );
      case "ok": {
        // Be honest about what Spotify actually returned. oEmbed supplies a
        // thumbnail for playlists and shows, but NOT for individual tracks or
        // albums — in that case we say so instead of implying the artwork was
        // updated, and we clear the stale cover rather than keep showing the
        // previous track's art.
        const gotArt = Boolean(status.data.thumbnailUrl);
        return (
          <span
            className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]"
            data-testid="studio-soundtrack-ok"
            data-has-artwork={gotArt ? "true" : "false"}
          >
            <IconCheck size={11} />
            {gotArt
              ? "Resolved from Spotify — cover and title updated."
              : "Resolved from Spotify — title updated. Spotify's oEmbed doesn't publish cover art for this link type, so the profile falls back to its own artwork."}
          </span>
        );
      }
    }
  })();

  return (
    <>
      <TextInput
        id="f-st-url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://open.spotify.com/track/…"
        invalid={value.length > 0 && !looksValid}
      />
      {value.length > 0 && !looksValid && validation.message && (
        <p role="alert" className="text-[11px] text-[color:#D6757B]">
          {validation.message}
        </p>
      )}
      {statusLine}
      {looksValid && status.kind === "idle" && (
        <p className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
          <IconCheck size={12} /> Looks like a valid Spotify link.
        </p>
      )}
    </>
  );
}