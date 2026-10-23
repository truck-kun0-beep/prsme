"use client";

import { useProfileDraft } from "@/components/ProfileDraftProvider";
import { SECTION_LABELS, type SectionId } from "@/lib/profileDraft";
import { PanelCard } from "./StudioFields";
import { IconUp, IconDown } from "./StudioIcons";

const SECTION_DESCRIPTIONS: Record<SectionId, string> = {
  soundtrack:
    "Mini Spotify card with cover art, title, artist, and a logo-only external action.",
  collections:
    "The grouped shelves of posters, featured items, or compact lists.",
  links:
    "Your link buttons — portfolio, shop, bookings. Sits after your shelves and before Recent activity.",
  activity: "A short ledger of small movements — not a stream, not a feed.",
  clicks:
    "Personal photography — concept artwork for a future PRSME surface.",
};

export function SectionsPanel() {
  const { draft, update } = useProfileDraft();

  function setVisibility(id: SectionId, on: boolean) {
    update({
      sectionVisibility: { ...draft.sectionVisibility, [id]: on },
    });
  }

  function move(id: SectionId, dir: -1 | 1) {
    const order = [...draft.sectionOrder];
    const i = order.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const a = order[i]!;
    const b = order[j]!;
    order[i] = b;
    order[j] = a;
    update({ sectionOrder: order });
  }

  return (
    <div className="space-y-4">
      <PanelCard
        testId="studio-sections-order"
        title="Section order & visibility"
        description="Reorder which sections appear on the public profile, and hide the ones you don't need."
      >
        <ol className="space-y-3" data-testid="studio-sections">
          {draft.sectionOrder.map((id, i) => (
            <li
              key={id}
              data-testid={`studio-section-${id}`}
              className={`flex items-start gap-3 rounded-md border bg-[var(--surface-2)] p-3 ${
                draft.sectionVisibility[id]
                  ? "border-[var(--line-soft)]"
                  : "border-[color:var(--accent-400)]/40 bg-[var(--surface-2)]/70"
              }`}
            >
              <input
                type="checkbox"
                checked={Boolean(draft.sectionVisibility[id])}
                onChange={(e) => setVisibility(id, e.target.checked)}
                aria-label={`Show ${SECTION_LABELS[id]} section`}
                className="mt-1 h-3.5 w-3.5 accent-[var(--accent-400)]"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-[var(--text-strong)]">
                  {SECTION_LABELS[id]}
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-muted)]">
                  {SECTION_DESCRIPTIONS[id]}
                </p>
                <p className="mt-1 text-[11px] text-[var(--text-faint)]">
                  Position {i + 1} of {draft.sectionOrder.length}
                  {!draft.sectionVisibility[id] && (
                    <span className="ml-2 inline-flex rounded-full bg-[var(--accent-400)]/15 px-1.5 py-0.5 text-[10px] text-[var(--text-strong)]">
                      hidden
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(id, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${SECTION_LABELS[id]} up`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--line-soft)] bg-[var(--surface-3)] text-[var(--text-muted)] hover:text-[var(--text-strong)] disabled:opacity-40"
                >
                  <IconUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => move(id, 1)}
                  disabled={i === draft.sectionOrder.length - 1}
                  aria-label={`Move ${SECTION_LABELS[id]} down`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--line-soft)] bg-[var(--surface-3)] text-[var(--text-muted)] hover:text-[var(--text-strong)] disabled:opacity-40"
                >
                  <IconDown size={14} />
                </button>
              </div>
            </li>
          ))}
        </ol>
      </PanelCard>
    </div>
  );
}