"use client";

import { useRef, useState } from "react";
import { ProfileAvatar } from "./ProfileAvatar";
import { SocialIcon, SocialPlatformLabel } from "./SocialIcons";
import { ShareDialog } from "./ShareDialog";
import { Button } from "./Button";
import { Reveal } from "./Reveal";
import type { ProfileOwner } from "@/lib/noirProfile";

/**
 * Profile header — avatar + identity + tags + socials + Share Profile action.
 * Renders the share dialog at runtime and exposes it from the "Share Profile"
 * button. The action is real: it opens an accessible dialog with copy + native
 * share + fallback paths.
 *
 * The owner prop is intentionally narrow — only the fields the header needs.
 */
export function ProfileHeader({ owner }: { owner: ProfileOwner }) {
  const [shareOpen, setShareOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const profileUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/u/${owner.username}`
      : `https://prsme.example/u/${owner.username}`;

  return (
    <section
      id="profile"
      aria-labelledby="profile-name"
      className="relative pt-10 md:pt-16"
    >
      <div className="container-page grid grid-cols-1 gap-8 md:grid-cols-12 md:items-start md:gap-10">
        {/* Avatar + share */}
        <div className="md:col-span-3 lg:col-span-3">
          <Reveal>
            <div className="flex items-center gap-5 md:flex-col md:items-start">
              <ProfileAvatar
                palette={owner.avatarPalette}
                size="lg"
                alt={`${owner.displayName}'s avatar`}
              />
              {/* On md+, show the share row next to or below the avatar */}
              <div className="hidden md:block">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line-soft)] bg-ink-800/60 px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-muted-200">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-iris-300 animate-iris-pulse" />
                  Public profile
                </span>
              </div>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="mt-4 flex flex-wrap items-center gap-2 md:flex-col md:items-stretch">
              <Button
                onClick={() => setShareOpen(true)}
                size="md"
                className="w-full md:w-auto"
                ref={triggerRef}
                id="share-profile-btn"
              >
                <span aria-hidden>↗</span>
                <span>Share profile</span>
              </Button>
              {/* Public indicator visible on mobile (avatar column) */}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line-soft)] bg-ink-800/60 px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-muted-200 md:hidden">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-iris-300 animate-iris-pulse" />
                Public profile
              </span>
            </div>
          </Reveal>
        </div>

        {/* Identity column */}
        <div className="min-w-0 md:col-span-9 lg:col-span-9">
          <Reveal delay={80}>
            <p className="font-mono text-[12px] uppercase tracking-[0.22em] text-iris-300">
              <span aria-hidden>●</span> Public profile
            </p>
          </Reveal>
          <Reveal delay={160}>
            <h1
              id="profile-name"
              className="mt-3 font-display text-display-md text-muted-50"
            >
              {owner.displayName}
            </h1>
          </Reveal>
          <Reveal delay={240}>
            <p className="mt-1 font-mono text-[13px] text-muted-300">
              prsme.app/{owner.username}
            </p>
          </Reveal>

          <Reveal delay={320}>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-200">
              {owner.bio}
            </p>
          </Reveal>

          <Reveal delay={400}>
            <ul className="mt-5 flex flex-wrap gap-2">
              {owner.tags.map((t) => (
                <li
                  key={t}
                  className="rounded-full border border-[var(--line-soft)] bg-ink-800/50 px-3 py-1 text-[12px] text-muted-200"
                >
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>

          {(owner.location || owner.pronouns) && (
            <Reveal delay={480}>
              <p className="mt-4 text-[12px] text-muted-400">
                {owner.location}
                {owner.location && owner.pronouns ? " · " : ""}
                {owner.pronouns}
              </p>
            </Reveal>
          )}

          <Reveal delay={560}>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <span className="text-[11px] uppercase tracking-[0.2em] text-muted-400">
                Find on
              </span>
              {owner.socials.map((s) => (
                <a
                  key={s.platform}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${owner.displayName} on ${SocialPlatformLabel({
                    platform: s.platform,
                  })} — opens in a new tab`}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--line-soft)] bg-ink-800/50 px-3 text-[13px] text-muted-200 transition-colors hover:border-iris-400/40 hover:text-muted-50"
                >
                  <SocialIcon platform={s.platform} className="h-4 w-4" />
                  <span className="max-w-[10rem] truncate">{s.handle}</span>
                </a>
              ))}
            </div>
          </Reveal>
        </div>
      </div>

      <div className="container-page mt-10">
        <div className="hairline" />
      </div>

      <ShareDialog
        displayName={owner.displayName}
        username={owner.username}
        url={profileUrl}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        triggerRef={triggerRef}
      />
    </section>
  );
}