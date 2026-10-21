"use client";

import { useProfileDraft } from "@/components/ProfileDraftProvider";
import type { ProfileVisibility } from "@/lib/profileDraft";
import { PanelCard } from "./StudioFields";
import { IconEye, IconLock, IconEyeOff } from "./StudioIcons";

const OPTIONS: Array<{
  id: ProfileVisibility;
  label: string;
  description: string;
  icon: typeof IconEye;
}> = [
  {
    id: "public",
    label: "Public",
    description:
      "Anyone with the link can see the profile. (Demo: local-only setting.)",
    icon: IconEye,
  },
  {
    id: "followers",
    label: "Followers only",
    description:
      "Authenticated followers can see the profile. (Demo: local-only setting.)",
    icon: IconEyeOff,
  },
  {
    id: "private",
    label: "Private",
    description:
      "Only the account holder. The demo shows a private-style preview banner.",
    icon: IconLock,
  },
];

export function PrivacyPanel() {
  const { draft, update } = useProfileDraft();
  const value = draft.visibility ?? "public";

  return (
    <div className="space-y-4">
      <PanelCard
        testId="studio-privacy-visibility"
        title="Profile visibility"
        description="Local preview setting. Server-side enforcement arrives with the authenticated backend."
      >
        <div className="space-y-2">
          {OPTIONS.map((o) => {
            const active = value === o.id;
            const Icon = o.icon;
            return (
              <label
                key={o.id}
                className={`flex cursor-pointer items-start gap-3 rounded-md border bg-[var(--surface-2)] px-3 py-3 transition-colors ${
                  active
                    ? "border-[var(--accent-400)]/60"
                    : "border-[var(--line-soft)] hover:border-[var(--line-strong)]"
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  value={o.id}
                  checked={active}
                  onChange={() => update({ visibility: o.id })}
                  className="mt-0.5 h-3.5 w-3.5 accent-[var(--accent-400)]"
                />
                <Icon size={16} aria-hidden />
                <div>
                  <p className="text-[13px] font-medium text-[var(--text-strong)]">
                    {o.label}
                  </p>
                  <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
                    {o.description}
                  </p>
                </div>
              </label>
            );
          })}
        </div>
        <p className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-1)] px-3 py-2 text-[11px] text-[var(--text-muted)]">
          Real private-profile enforcement requires an authenticated backend
          and server-side authorization checks. Hiding elements in the browser
          is not security.
        </p>
      </PanelCard>
    </div>
  );
}