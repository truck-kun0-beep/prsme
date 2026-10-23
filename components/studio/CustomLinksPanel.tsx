"use client";

/**
 * Studio editor for Custom Link Buttons (Phase 4.5, presentation options in 4.6).
 *
 * Adds, edits, reorders, and removes owner-defined outbound buttons, and
 * customizes how they look.
 *
 * Two rules shape this panel:
 *
 *   - **Nothing broken is ever saved.** A button needs a non-empty label AND a
 *     valid https destination. `validateCustomLinkLabel` / `validateCustomLinkUrl`
 *     gate the save, and `readCustomLinks` re-applies the same rules on load — so
 *     a half-typed button can neither reach `localStorage` nor the public page.
 *   - **Label and URL are separate fields, always.** The URL is editable here in
 *     the studio, where the owner needs to see it, and is never rendered on the
 *     public button, which shows the label only.
 *
 * Phase 4.6 adds the appearance controls. Every one of them is stored per button
 * and read back by `ProfileCustomLinks`, and the panel previews the *real*
 * component rather than an approximation — a studio preview that drifts from the
 * public renderer is how a designer ends up promising something they do not ship.
 *
 * Ids are minted with `crypto.randomUUID()` and never derived from the array
 * index, so reordering does not rewrite an entry's identity.
 */

import { useCallback, useMemo, useState } from "react";
import type { CustomLinkButton } from "@/lib/noirProfile";
import { DEFAULT_CUSTOM_LINKS_SECTION } from "@/lib/noirProfile";
import {
  validateCustomLinkAccent,
  validateCustomLinkLabel,
  validateCustomLinkUrl,
  CUSTOM_LINK_COLOUR_MODES,
  CUSTOM_LINK_LAYOUTS,
  CUSTOM_LINK_SHAPES,
  CUSTOM_LINK_STYLES,
  DEFAULT_CUSTOM_LINK_COLOUR_MODE,
  DEFAULT_CUSTOM_LINK_LAYOUT,
  DEFAULT_CUSTOM_LINK_SHAPE,
  DEFAULT_CUSTOM_LINK_STYLE,
} from "@/lib/validate";
import { useProfileDraft } from "@/components/ProfileDraftProvider";
import { ThemeScope } from "@/components/ThemeScope";
import { ProfileCustomLinks, CustomLinksSectionHeader } from "@/components/ProfileCustomLinks";
import { FieldGroup, PanelCard, TextArea, TextInput } from "./StudioFields";
import { IconPlus } from "./StudioIcons";

const MAX_LINKS = 24;

const SHAPE_LABELS: Record<(typeof CUSTOM_LINK_SHAPES)[number], string> = {
  rounded: "Rounded",
  rect: "Soft rectangle",
  pill: "Pill",
};

const STYLE_LABELS: Record<(typeof CUSTOM_LINK_STYLES)[number], string> = {
  solid: "Solid fill",
  outline: "Subtle outline",
  tint: "Soft tint",
};

const LAYOUT_LABELS: Record<(typeof CUSTOM_LINK_LAYOUTS)[number], string> = {
  stack: "Full-width stack",
  grid: "Balanced grid",
};

function newLinkId(): string {
  const uuid =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `lnk-${uuid}`;
}

/**
 * A segmented single-choice control.
 *
 * Used instead of a `<select>` for all four appearance options because the whole
 * point of the options is that the owner should *see* the choice. Every segment
 * is a real `<button>` with an `aria-pressed`, so the group is operable by
 * keyboard and announced correctly, rather than being a div with click handlers.
 */
function Segmented<T extends string>({
  legend,
  hint,
  value,
  options,
  labels,
  onChange,
  testId,
}: {
  legend: string;
  hint?: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (next: T) => void;
  testId: string;
}) {
  return (
    <fieldset>
      <legend className="text-[12px] font-medium text-[var(--text-strong)]">
        {legend}
      </legend>
      {hint && (
        <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
          {hint}
        </p>
      )}
      <div
        role="group"
        aria-label={legend}
        data-testid={testId}
        className="mt-2 flex flex-wrap gap-1.5"
      >
        {options.map((option) => {
          const active = option === value;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option)}
              data-testid={`${testId}-${option}`}
              className={`rounded-md border px-2.5 py-1.5 text-[11px] transition-colors ${
                active
                  ? "border-[var(--accent-400)] bg-[var(--accent-400)]/15 text-[var(--text-strong)]"
                  : "border-[var(--line-soft)] text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text-default)]"
              }`}
            >
              {labels[option]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function CustomLinksPanel() {
  const { draft, update, updateWith } = useProfileDraft();
  /*
   * `draft.customLinks ?? []` allocates a fresh array whenever the key is
   * absent, so every render produced a new identity and re-ran the `move` /
   * `remove` / `save` callbacks. `useMemo` keeps the array stable, which matters
   * because `save` compares against `MAX_LINKS` and the callbacks are listed in
   * dependency arrays.
   */
  const links: CustomLinkButton[] = useMemo(
    () => draft.customLinks ?? [],
    [draft.customLinks],
  );

  /*
   * Phase 4.7 — the section copy is edited *directly*, not staged.
   *
   * The button form stages label/URL/presentation and commits on save, because a
   * button is a record with validation. Section copy is different: it is three
   * independent strings with no validity condition, and the whole point is that
   * the owner watches the words change as they type. Staging it would mean a
   * preview that disagrees with the inputs until a save button is pressed, which
   * is exactly the "is it working?" confusion this phase is meant to remove.
   *
   * The `?? DEFAULT` guard covers a draft read before Phase 4.7 added the field;
   * `readDraft` normally fills it, so this is a type-level belt-and-braces for a
   * hand-constructed draft rather than a path the app itself can reach.
   */
  const section = draft.customLinksSection ?? DEFAULT_CUSTOM_LINKS_SECTION;

  const setSectionField = useCallback(
    (key: "eyebrow" | "heading" | "description", value: string) => {
      updateWith((d) => ({
        ...d,
        customLinksSection: {
          ...(d.customLinksSection ?? DEFAULT_CUSTOM_LINKS_SECTION),
          [key]: value,
        },
      }));
    },
    [updateWith],
  );

  const resetSectionCopy = useCallback(() => {
    updateWith((d) => ({
      ...d,
      customLinksSection: { ...DEFAULT_CUSTOM_LINKS_SECTION },
    }));
  }, [updateWith]);

  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ label?: string; url?: string }>({});

  /*
   * Appearance edits are staged here and written only on save, alongside the
   * label and URL. That keeps one mental model — "fill the form, press save" —
   * instead of letting a colour swatch mutate a stored button out from under an
   * edit in progress.
   */
  const [shape, setShape] = useState<(typeof CUSTOM_LINK_SHAPES)[number]>(
    DEFAULT_CUSTOM_LINK_SHAPE,
  );
  const [style, setStyle] = useState<(typeof CUSTOM_LINK_STYLES)[number]>(
    DEFAULT_CUSTOM_LINK_STYLE,
  );
  const [colourMode, setColourMode] =
    useState<(typeof CUSTOM_LINK_COLOUR_MODES)[number]>(
      DEFAULT_CUSTOM_LINK_COLOUR_MODE,
    );
  const [accent, setAccent] = useState("#8c6cff");
  const [layout, setLayout] = useState<(typeof CUSTOM_LINK_LAYOUTS)[number]>(
    DEFAULT_CUSTOM_LINK_LAYOUT,
  );

  const reset = useCallback(() => {
    setLabel("");
    setUrl("");
    setEditingId(null);
    setError(null);
    setFieldError({});
    setShape(DEFAULT_CUSTOM_LINK_SHAPE);
    setStyle(DEFAULT_CUSTOM_LINK_STYLE);
    setColourMode(DEFAULT_CUSTOM_LINK_COLOUR_MODE);
    setAccent("#8c6cff");
    setLayout(DEFAULT_CUSTOM_LINK_LAYOUT);
  }, []);

  const save = useCallback(() => {
    // Validate BOTH fields and surface per-field messages, rather than failing
    // on whichever happens to be checked first.
    const labelResult = validateCustomLinkLabel(label);
    const urlResult = validateCustomLinkUrl(url);
    const nextFieldError: { label?: string; url?: string } = {};
    if (!labelResult.ok) nextFieldError.label = labelResult.message;
    if (!urlResult.ok) nextFieldError.url = urlResult.message;
    setFieldError(nextFieldError);
    if (!labelResult.ok || !urlResult.ok) {
      setError("Fix the highlighted fields before saving this button.");
      return;
    }
    if (links.length >= MAX_LINKS && !editingId) {
      setError(`PRSME keeps up to ${MAX_LINKS} custom buttons.`);
      return;
    }

    /*
     * A custom accent is only stored in custom mode. Saving it in theme mode
     * would leave a dangling colour that the renderer ignores, which is a
     * stored value that means nothing — worse than not storing it.
     */
    let savedAccent: string | undefined;
    if (colourMode === "custom") {
      const accentResult = validateCustomLinkAccent(accent);
      if (!accentResult.ok) {
        setFieldError({ url: undefined, label: undefined });
        setError(accentResult.message ?? "Pick a valid button colour.");
        return;
      }
      savedAccent = accentResult.accent;
    }

    // Stable identity: editing keeps the existing id, adding mints a new one.
    const record: CustomLinkButton = {
      id: editingId ?? newLinkId(),
      label: labelResult.label!,
      url: urlResult.url!,
      shape,
      style,
      colourMode,
      ...(savedAccent ? { accent: savedAccent } : {}),
      layout,
    };

    update({
      customLinks: editingId
        ? links.map((l) => (l.id === editingId ? record : l))
        : [...links, record],
    });
    reset();
  }, [accent, colourMode, editingId, label, layout, links, reset, shape, style, url, update]);

  const move = useCallback(
    (id: string, dir: -1 | 1) => {
      const i = links.findIndex((l) => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= links.length) return;
      const next = [...links];
      [next[i], next[j]] = [next[j]!, next[i]!];
      update({ customLinks: next });
    },
    [links, update],
  );

  const remove = useCallback(
    (id: string) => {
      update({ customLinks: links.filter((l) => l.id !== id) });
      if (editingId === id) reset();
    },
    [editingId, links, reset, update],
  );

  const startEdit = useCallback((link: CustomLinkButton) => {
    setEditingId(link.id);
    setLabel(link.label);
    setUrl(link.url);
    // Load the stored presentation, falling back to the same defaults the
    // renderer uses — so editing a Phase 4.5 button shows the look it renders.
    setShape(link.shape ?? DEFAULT_CUSTOM_LINK_SHAPE);
    setStyle(link.style ?? DEFAULT_CUSTOM_LINK_STYLE);
    setColourMode(link.colourMode ?? DEFAULT_CUSTOM_LINK_COLOUR_MODE);
    setAccent(link.accent ?? "#8c6cff");
    setLayout(link.layout ?? DEFAULT_CUSTOM_LINK_LAYOUT);
    setError(null);
    setFieldError({});
  }, []);

  return (
    <div className="space-y-4">
      <PanelCard
        testId="studio-links-intro"
        title="Custom Links"
        description="Buttons for anything you want to promote — a portfolio, shop, channel, event, or anything else. They appear on your public profile after your shelves and before Recent activity."
      >
        <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">
          Visitors see the label only. The destination URL is used for the link
          and is never printed on the profile. Saved to this browser only.
        </p>
      </PanelCard>

      <PanelCard
        testId="studio-links-editor"
        title={editingId ? "Edit button" : "Add a button"}
        description="A label and an https destination. Both are required."
      >
        <div className="space-y-3">
          <FieldGroup
            id="custom-link-label"
            label="Label"
            hint="What visitors read, e.g. “Portfolio” or “Print shop”."
            error={fieldError.label}
          >
            <TextInput
              id="custom-link-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              invalid={Boolean(fieldError.label)}
              placeholder="Portfolio"
              maxLength={60}
              data-testid="studio-links-label-input"
            />
          </FieldGroup>

          <FieldGroup
            id="custom-link-url"
            label="Destination URL"
            hint="Must start with https://"
            error={fieldError.url}
          >
            <TextInput
              id="custom-link-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              invalid={Boolean(fieldError.url)}
              placeholder="https://example.com/portfolio"
              inputMode="url"
              data-testid="studio-links-url-input"
            />
          </FieldGroup>

          {error && (
            <p role="alert" className="text-[11px] text-[color:#D6757B]">
              {error}
            </p>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              data-testid="studio-links-save"
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent-400)] px-3 py-2 text-[12px] font-medium text-[var(--surface-0)] transition-transform duration-200 ease-soft hover:-translate-y-0.5"
            >
              <IconPlus size={14} />
              {editingId ? "Save changes" : "Add button"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={reset}
                data-testid="studio-links-cancel"
                className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-2)] px-3 py-2 text-[12px] font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text-default)]"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </PanelCard>

      {/*
       * Phase 4.7 — the section's own copy.
       *
       * Placed directly above the preview on purpose: these three fields change
       * *text*, so the owner needs to read the result while typing rather than
       * save, reload, and look for it.
       *
       * Each field is written straight into the draft on every keystroke — there
       * is no separate "apply" — because the live preview iframe and the public
       * profile both render from the same draft, and a debounce would only add a
       * lag between the input and the words appearing.
       *
       * An empty field is a legitimate value, not an error: it means "do not show
       * this line". That is why there is no `required` and no validation error —
       * the hint says so, and the preview demonstrates it immediately.
       */}
      <PanelCard
        testId="studio-links-section-appearance"
        title="Custom Links Section Appearance"
        description="The eyebrow, heading, and sentence above your buttons. Leave any of them empty to hide that line — the buttons still show."
      >
        <FieldGroup
          id="custom-links-eyebrow"
          label="Eyebrow"
          hint="A short label above the heading."
        >
          <TextInput
            id="custom-links-eyebrow"
            value={section.eyebrow ?? ""}
            onChange={(e) => setSectionField("eyebrow", e.target.value)}
            placeholder={DEFAULT_CUSTOM_LINKS_SECTION.eyebrow}
            maxLength={40}
            data-testid="studio-links-eyebrow-input"
          />
        </FieldGroup>

        <FieldGroup
          id="custom-links-heading"
          label="Heading"
          hint="The main line. Write anything — it is not tied to your display name."
        >
          <TextInput
            id="custom-links-heading"
            value={section.heading ?? ""}
            onChange={(e) => setSectionField("heading", e.target.value)}
            placeholder={DEFAULT_CUSTOM_LINKS_SECTION.heading}
            maxLength={80}
            data-testid="studio-links-heading-input"
          />
        </FieldGroup>

        <FieldGroup
          id="custom-links-description"
          label="Description"
          hint="One supporting sentence under the heading."
        >
          <TextArea
            id="custom-links-description"
            value={section.description ?? ""}
            onChange={(e) => setSectionField("description", e.target.value)}
            placeholder={DEFAULT_CUSTOM_LINKS_SECTION.description}
            maxLength={200}
            rows={3}
            data-testid="studio-links-description-input"
          />
        </FieldGroup>

        <button
          type="button"
          onClick={resetSectionCopy}
          className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-2)] px-3 py-2 text-[12px] font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text-default)]"
          data-testid="studio-links-section-reset"
        >
          Restore default text
        </button>
      </PanelCard>

      {/*
        * Phase 4.6 — appearance. Rendered below the editor and above the live
        * preview, so the owner changes an option and then sees the result in the
        * real component immediately underneath.
        */}
      <PanelCard
        testId="studio-links-appearance"
        title="Button appearance"
        description="Applies to the button you are editing or adding. It is saved with that button, so each one can look different."
      >
        <div className="space-y-4">
          <Segmented
            legend="Shape"
            testId="studio-links-shape"
            value={shape}
            options={CUSTOM_LINK_SHAPES}
            labels={SHAPE_LABELS}
            onChange={setShape}
          />
          <Segmented
            legend="Style"
            hint="Solid is the most prominent; outline and tint sit quieter against the page."
            testId="studio-links-style"
            value={style}
            options={CUSTOM_LINK_STYLES}
            labels={STYLE_LABELS}
            onChange={setStyle}
          />
          <Segmented
            legend="Colour"
            hint="Theme accent follows your profile theme automatically. Custom uses the colour you pick here."
            testId="studio-links-colour"
            value={colourMode}
            options={CUSTOM_LINK_COLOUR_MODES}
            labels={{ theme: "Use theme accent", custom: "Custom colour" }}
            onChange={setColourMode}
          />
          {colourMode === "custom" && (
            <FieldGroup
              id="custom-link-accent"
              label="Custom button colour"
              hint="A hex colour like #8C6CFF. The text colour is chosen automatically to stay readable."
            >
              <TextInput
                id="custom-link-accent"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                placeholder="#8c6cff"
                maxLength={7}
                inputMode="text"
                data-testid="studio-links-accent-input"
              />
            </FieldGroup>
          )}
          <Segmented
            legend="Layout"
            hint="The stack is one full-width button per row. Grid sits them two across — it is ignored on narrow screens and for long labels, where one-per-row reads better."
            testId="studio-links-layout"
            value={layout}
            options={CUSTOM_LINK_LAYOUTS}
            labels={LAYOUT_LABELS}
            onChange={setLayout}
          />
        </div>
      </PanelCard>

      {/*
        * Preview of the REAL public buttons.
        *
        * `ProfileCustomLinks` is imported rather than approximated, because a
        * hand-rolled preview that drifts from the public component is exactly how
        * a studio ends up promising a design it does not ship. It applies the
        * same render filter and the same layout fallback rules, so an invalid
        * button disappears from the preview too.
        *
        * It is wrapped in `ThemeScope` rather than a hand-written
        * `profile-scope` div so the preview resolves the *saved* theme and
        * typography through the same code path as the public page. Without the
        * `--pf-*` tokens the buttons would fall back to neutral defaults and the
        * owner could not judge their real colours.
        */}
      <PanelCard
        testId="studio-links-preview"
        title="Public preview"
        description="Exactly how these appear on your profile, in your saved theme and typography."
      >
        {links.length === 0 ? (
          <p className="text-[12px] text-[var(--text-muted)]">
            No buttons yet. The section stays hidden on your profile until you
            add one.
          </p>
        ) : (
          <ThemeScope draft={draft}>
            <div
              className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface-0)] p-5"
              data-testid="studio-links-preview-scope"
            >
              {/*
               * Phase 4.7 — the SAME header component the public profile renders,
               * driven by the same draft. Typing in the three fields above changes
               * these words immediately, and clearing one removes its line here
               * exactly as it will on the profile.
               */}
              <CustomLinksSectionHeader copy={section} />
              <ProfileCustomLinks links={links} />
            </div>
          </ThemeScope>
        )}
      </PanelCard>

      {links.length > 0 && (
        <PanelCard
          testId="studio-links-list"
          title={`Buttons (${links.length})`}
          description="Reorder with the arrows, edit, or remove."
        >
          <ul className="space-y-2" data-testid="studio-links-list">
            {links.map((link, i) => (
              <li
                key={link.id}
                data-testid={`studio-links-row-${link.id}`}
                className="flex items-center gap-2 rounded-md border border-[var(--line-soft)] bg-[var(--surface-2)] px-2.5 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[var(--text-strong)]">
                    {link.label}
                  </p>
                  <p className="truncate text-[11px] text-[var(--text-muted)]">
                    {link.url}
                  </p>
                  {/* Phase 4.6 — show the stored look, so the list is a real
                      record of what was saved rather than just a set of labels. */}
                  <p className="mt-0.5 text-[10px] text-[var(--text-faint)]">
                    {[
                      link.shape ?? DEFAULT_CUSTOM_LINK_SHAPE,
                      link.style ?? DEFAULT_CUSTOM_LINK_STYLE,
                      link.colourMode === "custom" && link.accent
                        ? link.accent
                        : "theme accent",
                      link.layout ?? DEFAULT_CUSTOM_LINK_LAYOUT,
                    ].join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => move(link.id, -1)}
                    disabled={i === 0}
                    aria-label={`Move ${link.label} up`}
                    data-testid={`studio-links-up-${link.id}`}
                    className="rounded border border-[var(--line-soft)] px-1.5 py-1 text-[11px] text-[var(--text-muted)] disabled:opacity-40 enabled:hover:border-[var(--line-strong)] enabled:hover:text-[var(--text-default)]"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(link.id, 1)}
                    disabled={i === links.length - 1}
                    aria-label={`Move ${link.label} down`}
                    data-testid={`studio-links-down-${link.id}`}
                    className="rounded border border-[var(--line-soft)] px-1.5 py-1 text-[11px] text-[var(--text-muted)] disabled:opacity-40 enabled:hover:border-[var(--line-strong)] enabled:hover:text-[var(--text-default)]"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(link)}
                    aria-label={`Edit ${link.label}`}
                    data-testid={`studio-links-edit-${link.id}`}
                    className="rounded border border-[var(--line-soft)] px-2 py-1 text-[11px] text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text-default)]"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(link.id)}
                    aria-label={`Remove ${link.label}`}
                    data-testid={`studio-links-remove-${link.id}`}
                    className="rounded border border-[var(--line-soft)] px-2 py-1 text-[11px] text-[color:#D6757B] hover:border-[color:#D6757B]"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </PanelCard>
      )}
    </div>
  );
}