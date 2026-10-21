"use client";

import { useRef, useState, useEffect } from "react";
import { useProfileDraft } from "@/components/ProfileDraftProvider";
import { PALETTE_NAMES, type Palette } from "@/lib/noirProfile";
import { validateSocialUrl, validateTag, isDuplicate, normalizeSocialUrl, deriveHandle } from "@/lib/validate";
import { PanelCard, FieldGroup, TextInput, TextArea, Select } from "./StudioFields";
import { AvatarUpload } from "./AvatarUpload";
import { IconPlus, IconX, IconTrash } from "./StudioIcons";

const SOCIAL_PLATFORMS = ["facebook", "instagram", "snapchat", "linkedin"] as const;
type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

const SOCIAL_LABELS: Record<SocialPlatform, { platform: string; placeholder: string; help: string }> = {
  facebook: {
    platform: "Facebook",
    placeholder: "https://facebook.com/your-handle",
    help: "Paste your Facebook profile URL.",
  },
  instagram: {
    platform: "Instagram",
    placeholder: "https://instagram.com/your-handle",
    help: "Paste your Instagram URL — must end with your username.",
  },
  snapchat: {
    platform: "Snapchat",
    placeholder: "https://snapchat.com/add/your-handle",
    help: "Your public Snapchat profile URL.",
  },
  linkedin: {
    platform: "LinkedIn",
    placeholder: "https://linkedin.com/in/your-handle",
    help: "Personal profile (linkedin.com/in/…). Company pages aren't supported yet.",
  },
};

// PALETTE_NAMES is a Set; we hand the studio an Array so AvatarUpload can
// .map() over it. Order matches the named palette tokens.
const PALETTE_OPTIONS: Palette[] = Array.from(PALETTE_NAMES) as Palette[];

export function IdentityPanel() {
  const { draft, defaults, update } = useProfileDraft();
  const id = draft.identity;

  const setIdentity = (patch: Partial<typeof id>) =>
    update({ identity: { ...id, ...patch } });

  const setPalette = (palette: Palette) => setIdentity({ avatarPalette: palette });

  // Tag input state
  const [tagDraft, setTagDraft] = useState("");
  const [tagError, setTagError] = useState<string | null>(null);

  function addTag() {
    const trimmed = tagDraft.trim();
    setTagError(null);
    const v = validateTag(trimmed);
    if (!v.ok) {
      setTagError(v.message ?? "Invalid tag.");
      return;
    }
    if (isDuplicate(draft.tags, trimmed)) {
      setTagError("You already added that tag.");
      return;
    }
    update({ tags: [...draft.tags, trimmed] });
    setTagDraft("");
  }

  function removeTag(idx: number) {
    update({ tags: draft.tags.filter((_, i) => i !== idx) });
  }

  // Social links
  function setSocial(platform: SocialPlatform, url: string) {
    const list = draft.socials.filter((s) => s.platform !== platform);
    if (url.trim().length > 0) {
      list.push({
        platform,
        url: url.trim(),
        handle: deriveHandle(platform, url),
      });
    }
    update({ socials: list });
  }

  function socialUrl(platform: SocialPlatform): string {
    return draft.socials.find((s) => s.platform === platform)?.url ?? "";
  }

  return (
    <div className="space-y-4">
      <PanelCard
        testId="studio-identity-core"
        title="Identity"
        description="The basics. These surface directly on the public profile."
      >
        <FieldGroup id="f-displayName" label="Display name">
          <TextInput
            id="f-displayName"
            value={id.displayName}
            onChange={(e) => setIdentity({ displayName: e.target.value })}
            onBlur={() => {
              if (!id.displayName.trim())
                setIdentity({ displayName: defaults.identity.displayName });
            }}
          />
        </FieldGroup>

        <FieldGroup
          id="f-bio"
          label="Biography"
          hint="2–4 sentences is the sweet spot. Plain text. Em-dashes are fine."
        >
          <TextArea
            id="f-bio"
            rows={4}
            value={id.bio}
            onChange={(e) => setIdentity({ bio: e.target.value })}
            maxLength={400}
          />
        </FieldGroup>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldGroup id="f-location" label="Location">
            <TextInput
              id="f-location"
              value={id.location}
              onChange={(e) => setIdentity({ location: e.target.value })}
              placeholder="Berlin, Germany"
            />
          </FieldGroup>
          <FieldGroup
            id="f-pronouns"
            label="Pronouns"
            hint="Optional — leave blank to hide."
          >
            <TextInput
              id="f-pronouns"
              value={id.pronouns}
              onChange={(e) => setIdentity({ pronouns: e.target.value })}
              placeholder="she/her, he/him, they/them…"
              maxLength={40}
            />
          </FieldGroup>
        </div>
      </PanelCard>

      <PanelCard
        testId="studio-identity-tags"
        title="Interest tags"
        description="A few small words that show beneath the biography on the public profile."
      >
        <div className="flex flex-wrap gap-1.5">
          {draft.tags.map((t, idx) => (
            <span
              key={`${t}-${idx}`}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--line-strong)] bg-[var(--surface-3)] px-2.5 py-1 text-[12px] text-[var(--text-default)]"
            >
              {t}
              <button
                type="button"
                onClick={() => removeTag(idx)}
                aria-label={`Remove tag ${t}`}
                className="rounded-full p-0.5 text-[var(--text-muted)] hover:bg-[var(--surface-4)] hover:text-[var(--text-strong)]"
              >
                <IconX size={12} />
              </button>
            </span>
          ))}
          {draft.tags.length === 0 && (
            <p className="text-[12px] text-[var(--text-muted)]">
              No tags yet — add one below.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="f-tag-input" className="block text-[12px] font-medium text-[var(--text-default)]">
            Add a tag
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="f-tag-input"
              type="text"
              value={tagDraft}
              onChange={(e) => {
                setTagDraft(e.target.value);
                setTagError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="e.g. noir cinema"
              maxLength={40}
              aria-invalid={Boolean(tagError) || undefined}
              className={`flex-1 rounded-md border bg-[var(--surface-2)] px-3 py-2 text-[13px] text-[var(--text-strong)] placeholder:text-[var(--text-faint)] focus:border-[var(--accent-400)] focus:outline-none ${
                tagError ? "border-[color:#D6757B]" : "border-[var(--line-strong)]"
              }`}
            />
            <button
              type="button"
              onClick={addTag}
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent-400)] px-3 py-2 text-[12px] font-medium text-[var(--surface-0)] hover:bg-[var(--accent-500)] sm:px-4"
              aria-keyshortcuts="Enter"
              data-testid="studio-add-tag"
            >
              <IconPlus size={12} /> Add
            </button>
          </div>
          {tagError && (
            <p className="text-[11px] text-[color:#D6757B]" role="alert">
              {tagError}
            </p>
          )}
        </div>
      </PanelCard>

      <PanelCard
        testId="studio-identity-socials"
        title="Social links"
        description="Only Facebook, Instagram, Snapchat, and LinkedIn are wired up in this phase."
      >
        <div className="space-y-4">
          {SOCIAL_PLATFORMS.map((p) => {
            const value = socialUrl(p);
            const meta = SOCIAL_LABELS[p];
            const result = validateSocialUrl(p, value);
            return (
              <SocialUrlEditor
                key={p}
                platform={p}
                meta={meta}
                value={value}
                valid={result.ok}
                error={result.message}
                onChange={(next) => setSocial(p, next)}
              />
            );
          })}
        </div>
      </PanelCard>

      <PanelCard
        testId="studio-identity-avatar"
        title="Avatar"
        description="One image per profile. We resize your upload to 320px and store it locally in this browser."
      >
        <AvatarUpload
          dataUrl={draft.avatarDataUrl}
          palette={id.avatarPalette}
          onAvatarChange={(next) => update({ avatarDataUrl: next })}
          onPaletteChange={setPalette}
          palettes={PALETTE_OPTIONS}
        />
      </PanelCard>
    </div>
  );
}

interface SocialUrlEditorProps {
  platform: SocialPlatform;
  meta: { platform: string; placeholder: string; help: string };
  value: string;
  valid: boolean;
  error?: string;
  onChange: (next: string) => void;
}

function SocialUrlEditor({ platform, meta, value, valid, error, onChange }: SocialUrlEditorProps) {
  return (
    <FieldGroup
      id={`f-soc-${platform}`}
      label={meta.platform}
      hint={
        valid
          ? meta.help
          : value
            ? error
            : `Optional — leave blank to hide this ${meta.platform} link.`
      }
      error={!valid && value && error ? error : undefined}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <TextInput
          id={`f-soc-${platform}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={meta.placeholder}
          invalid={!valid}
          aria-invalid={!valid || undefined}
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--line-soft)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-strong)]"
            aria-label={`Remove ${meta.platform}`}
          >
            <IconTrash size={12} /> Remove
          </button>
        )}
      </div>
    </FieldGroup>
  );
}