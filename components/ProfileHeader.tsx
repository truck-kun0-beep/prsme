"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ProfileAvatar } from "./ProfileAvatar";
import { SocialIcon, SocialPlatformLabel } from "./SocialIcons";
import { ShareDialog } from "./ShareDialog";
import { Button } from "./Button";
import { Reveal } from "./Reveal";
import { SocialPanel } from "@/components/social/SocialPanel";
import { SafetyControls } from "@/components/social/SafetyControls";
import type { FollowState } from "@/lib/supabase/social";
import type { ProfileOwner } from "@/lib/noirProfile";

/**
 * Profile header — avatar + identity + stats + tags + socials + Share action.
 *
 * Layout notes (Phase 3.1):
 *   - Mobile-first. The avatar and the identity block stack deliberately on
 *     narrow screens (`.pf-header` is a single-column grid below 768px) so
 *     the avatar can never collide with the biography.
 *   - On wide screens the avatar takes a fixed side column and the identity
 *     fills the rest — unless the global layout is `compact`, which uses the
 *     stacked arrangement at every width for a denser page.
 *   - Social platforms are icon-only buttons (no visible platform name).
 *     Accessible names come from `aria-label`; the handle appears in the
 *     tooltip so the information is not lost.
 *   - Follower / following counts come from `owner.socialStats`, which is
 *     demo data kept deliberately outside the customizable draft.
 *
 * Phase 8: for a REGISTERED profile, `social` carries the real counts and
 * the visitor's real relationship, and the header renders the interactive
 * social panel instead of the demo counts. The demo profile at `/u/noir` has
 * no `social` prop and keeps the fictional numbers.
 */
export function ProfileHeader({
  owner,
  social,
  showSafetyControls = false,
}: {
  owner: ProfileOwner;
  /**
   * Phase 8 — the real relationship state, when the profile is backed by the
   * database. Absent for the demo profile, which has no accounts.
   */
  social?: {
    followerCount: number;
    followingCount: number;
    state: FollowState;
    isSelf: boolean;
    blocked: boolean;
  };
  /** Whether to render the block and report controls. */
  showSafetyControls?: boolean;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const profileUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/u/${owner.username}`
      : `https://prsme.example/u/${owner.username}`;

  const socials = owner.socials.filter((s) => (s.url ?? "").trim().length > 0);
  const stats = owner.socialStats;

  return (
    <section
      id="profile"
      aria-labelledby="profile-name"
      className="profile-canvas pt-8 md:pt-12"
    >
      <div className="pf-header">
        {/* Avatar column */}
        <div className="flex flex-col items-start gap-4">
          <Reveal>
            <ProfileAvatar
              palette={owner.avatarPalette}
              dataUrl={owner.avatarDataUrl ?? null}
              size="lg"
              alt={`${owner.displayName}'s avatar`}
            />
          </Reveal>

          <Reveal delay={120}>
            <Button
              onClick={() => setShareOpen(true)}
              size="md"
              ref={triggerRef}
              id="share-profile-btn"
            >
              <span aria-hidden>↗</span>
              <span>Share profile</span>
            </Button>
          </Reveal>
        </div>

        {/* Identity column */}
        <div className="pf-header-identity">
          <Reveal delay={80}>
            <p className="pf-eyebrow">@{owner.username}</p>
          </Reveal>

          <Reveal delay={160}>
            <h1 id="profile-name" className="pf-display-name mt-2">
              {owner.displayName}
            </h1>
          </Reveal>

          <Reveal delay={240}>
            <p className="pf-meta mt-1.5">prsme.app/{owner.username}</p>
          </Reveal>

          {/*
           * Phase 8 — the counts and the follow control.
           *
           * A registered profile renders the interactive panel; the demo
           * profile keeps its fictional numbers. The two are never mixed: a
           * demo count next to a real Follow button would be a lie.
           */}
          {social ? (
            <Reveal delay={280}>
              <SocialPanel
                username={owner.username}
                followerCount={social.followerCount}
                followingCount={social.followingCount}
                state={social.state}
                isSelf={social.isSelf}
                blocked={social.blocked}
              />
            </Reveal>
          ) : stats ? (
            <Reveal delay={280}>
              <FollowerStats stats={stats} displayName={owner.displayName} />
            </Reveal>
          ) : null}

          {showSafetyControls && !social?.isSelf ? (
            <Reveal delay={320}>
              <SafetyControls username={owner.username} blocked={social?.blocked ?? false} />
            </Reveal>
          ) : null}

          {/*
           * PRE-PHASE 11 — the owner keeps a direct route into the editor
           * from their own profile.
           *
           * The prominent "View Profile" action replaced "Edit Profile" in the
           * navigation, so the editing entry point moved here — to the one
           * page where it is unambiguously about *this* profile. It renders
           * only for the owner: `social.isSelf` is decided by the database, so
           * this is not a visibility control a visitor can fake.
           */}
          {social?.isSelf ? (
            <Reveal delay={320}>
              <p className="mt-4">
                <Link
                  href="/studio"
                  className="pf-meta inline-flex items-center gap-1.5 underline underline-offset-4 transition-colors hover:text-[var(--pf-text)]"
                  data-testid="profile-customize-link"
                >
                  Customize profile
                  <span aria-hidden>→</span>
                </Link>
              </p>
            </Reveal>
          ) : null}

          <Reveal delay={320}>
            <p
              className="pf-body mt-4 text-[15px] leading-relaxed text-[var(--pf-text)]"
              style={{ maxWidth: "var(--pf-identity-width)" }}
            >
              {owner.bio}
            </p>
          </Reveal>

          {owner.tags.length > 0 && (
            <Reveal delay={400}>
              <ul
                className="mt-4 flex flex-wrap gap-2"
                aria-label="Interests"
                data-testid="profile-tags"
              >
                {owner.tags.map((t) => (
                  <li key={t}>
                    <span className="pf-tag">{t}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          )}

          {(owner.location || owner.pronouns) && (
            <Reveal delay={480}>
              <p className="pf-meta mt-4">
                {owner.location}
                {owner.location && owner.pronouns ? " · " : ""}
                {owner.pronouns}
              </p>
            </Reveal>
          )}

          {socials.length > 0 && (
            <Reveal delay={560}>
              <div
                className="mt-5 flex flex-wrap items-center gap-2"
                data-testid="profile-socials"
              >
                <span className="pf-meta mr-1">Find on</span>
                {socials.map((s) => {
                  const label = SocialPlatformLabel({ platform: s.platform });
                  return (
                    <a
                      key={s.platform}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pf-icon-btn"
                      aria-label={`${owner.displayName} on ${label}${
                        s.handle ? ` (${s.handle})` : ""
                      } — opens in a new tab`}
                      title={`${label}${s.handle ? ` · ${s.handle}` : ""}`}
                    >
                      <SocialIcon platform={s.platform} className="h-[18px] w-[18px]" />
                    </a>
                  );
                })}
              </div>
            </Reveal>
          )}
        </div>
      </div>

      <div className="mt-8 md:mt-10">
        <div className="pf-hairline" />
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

/**
 * Follower / following counts.
 *
 * These are fictional demo numbers (see `ProfileOwner.socialStats.isDemo`)
 * used only so the layout can be evaluated before the backend exists. No
 * Follow buttons and no account relationships are implied — those arrive
 * with real authenticated data in a later phase.
 */
function FollowerStats({
  stats,
  displayName,
}: {
  stats: NonNullable<ProfileOwner["socialStats"]>;
  displayName: string;
}) {
  const demoNote = stats.isDemo ? "Demo counts for layout preview." : "";
  return (
    <dl
      className="pf-stats mt-4"
      data-testid="profile-social-stats"
      aria-label={`${displayName} follower and following counts`}
    >
      <div className="pf-stat">
        <dt className="pf-stat-label">Followers</dt>
        <dd className="pf-stat-value" data-testid="profile-followers">
          {formatCount(stats.followers)}
        </dd>
      </div>
      <div className="pf-stat">
        <dt className="pf-stat-label">Following</dt>
        <dd className="pf-stat-value" data-testid="profile-following">
          {formatCount(stats.following)}
        </dd>
      </div>
      {stats.isDemo && (
        <p className="pf-meta basis-full opacity-70" aria-label={demoNote}>
          {demoNote}
        </p>
      )}
    </dl>
  );
}

/** Compact count formatting: 1284 → "1,284", 12000 → "12K". */
function formatCount(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1_000_000) {
    return `${trimZero((n / 1_000_000).toFixed(1))}M`;
  }
  if (Math.abs(n) >= 10_000) {
    return `${trimZero((n / 1_000).toFixed(0))}K`;
  }
  return n.toLocaleString("en-US");
}

function trimZero(s: string): string {
  return s.replace(/\.0$/, "");
}