"use client";

import { useCallback } from "react";
import { useProfileDraft } from "@/components/ProfileDraftProvider";
import { THEME_PRESETS } from "@/lib/theme";
import {
  TYPOGRAPHY_LIST,
  LAYOUT_LIST,
  BACKGROUND_OPTIONS,
} from "@/lib/profileTheme";
import type {
  ThemeId,
  TypographyId,
  LayoutPreset,
  BackgroundTreatment,
} from "@/lib/themeTypes";
import { PanelCard } from "./StudioFields";

/**
 * AppearancePanel — theme, custom accent, typography, global layout, background.
 *
 * Every control here writes to the real draft, and the live preview reads
 * that same draft, so a change here is visible in the preview immediately
 * (Phase 3.1 requirement: the selected control must match what is rendered).
 */
export function AppearancePanel() {
  const { draft, update } = useProfileDraft();
  const a = draft.appearance;

  const setTheme = useCallback(
    (theme: ThemeId) => update({ appearance: { ...a, theme } }),
    [a, update],
  );
  const setType = useCallback(
    (typography: TypographyId) => update({ appearance: { ...a, typography } }),
    [a, update],
  );
  const setLayout = useCallback(
    (layout: LayoutPreset) => update({ appearance: { ...a, layout } }),
    [a, update],
  );
  const setBackground = useCallback(
    (background: BackgroundTreatment) => update({ appearance: { ...a, background } }),
    [a, update],
  );
  const setAccent = useCallback(
    (accentOverride: string | null) =>
      update({ appearance: { ...a, accentOverride } }),
    [a, update],
  );

  return (
    <div className="space-y-4">
      <PanelCard
        testId="studio-appearance-themes"
        title="Theme"
        description="Eleven complete palettes — dark, light, and editorial. Ratings, tags, hover and focus states all follow the chosen theme."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-2">
          {THEME_PRESETS.map((t) => {
            const active = a.theme === t.id;
            return (
              <label
                key={t.id}
                className={`group cursor-pointer overflow-hidden rounded-lg border bg-[var(--surface-2)] transition-colors ${
                  active
                    ? "border-[var(--accent-400)]/60 ring-1 ring-[var(--accent-400)]/40"
                    : "border-[var(--line-soft)] hover:border-[var(--line-strong)]"
                }`}
                data-testid={`studio-theme-${t.id}`}
                data-active={active}
              >
                <input
                  type="radio"
                  name="theme"
                  value={t.id}
                  checked={active}
                  onChange={() => setTheme(t.id)}
                  className="sr-only"
                />
                <span
                  aria-hidden
                  className="block h-14 w-full"
                  style={{
                    background: `linear-gradient(135deg, ${t.swatch.from}, ${t.swatch.to})`,
                  }}
                />
                <span className="block px-3 py-2.5">
                  <span className="block text-[13px] font-medium text-[var(--text-strong)]">
                    {t.name}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-[var(--text-muted)]">
                    {t.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </PanelCard>

      <PanelCard
        testId="studio-appearance-accent"
        title="Accent colour"
        description="Override the theme accent. The whole accent family — ratings, tags, hover, focus — is derived from it."
      >
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="color"
            value={a.accentOverride ?? THEME_PRESETS.find((t) => t.id === a.theme)?.tokens["--accent-400"] ?? "#8C6CFF"}
            onChange={(e) => setAccent(e.target.value)}
            aria-label="Custom accent colour"
            data-testid="studio-accent-color"
            className="h-10 w-14 cursor-pointer rounded-md border border-[var(--line-strong)] bg-transparent p-1"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-[var(--text-default)]">
              {a.accentOverride ? (
                <>
                  Custom accent <span className="font-mono">{a.accentOverride}</span>
                </>
              ) : (
                "Using the theme's own accent."
              )}
            </p>
          </div>
          {a.accentOverride && (
            <button
              type="button"
              onClick={() => setAccent(null)}
              className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-strong)]"
              data-testid="studio-accent-reset"
            >
              Reset to theme
            </button>
          )}
        </div>
      </PanelCard>

      <PanelCard
        testId="studio-appearance-typography"
        title="Typography"
        description="Eight curated voices. Each preset uses one of the eight families resolved through next/font — no runtime stylesheet dependency."
      >
        <div className="grid grid-cols-1 gap-2.5">
          {TYPOGRAPHY_LIST.map((o) => {
            const active = a.typography === o.id;
            return (
              <label
                key={o.id}
                className={`flex cursor-pointer items-start gap-3 rounded-md border bg-[var(--surface-2)] px-3 py-2.5 transition-colors ${
                  active
                    ? "border-[var(--accent-400)]/60"
                    : "border-[var(--line-soft)] hover:border-[var(--line-strong)]"
                }`}
                data-testid={`studio-typography-${o.id}`}
                data-active={active}
              >
                <input
                  type="radio"
                  name="typography"
                  value={o.id}
                  checked={active}
                  onChange={() => setType(o.id)}
                  className="mt-1 h-3.5 w-3.5 shrink-0 accent-[var(--accent-400)]"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-[var(--text-strong)]">
                    {o.name}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-muted)]">
                    {o.description}
                  </p>
                  {/* Real-font specimen so the choice is legible before saving. */}
                  <p
                    aria-hidden
                    className="mt-1.5 truncate text-[17px] leading-tight"
                    style={{
                      fontFamily: o.display,
                      color: "var(--text-strong)",
                    }}
                  >
                    Noir Aldridge
                  </p>
                  <p
                    aria-hidden
                    className="truncate text-[10px]"
                    style={{
                      fontFamily: o.meta,
                      color: "var(--text-muted)",
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                    }}
                  >
                    Curated shelves
                  </p>
                </div>
              </label>
            );
          })}
        </div>
      </PanelCard>

      <PanelCard
        testId="studio-appearance-layout"
        title="Global profile layout"
        description="The page composition: canvas width, section rhythm, and header arrangement. Independent of any single collection's layout."
      >
        <div className="grid grid-cols-1 gap-2.5">
          {LAYOUT_LIST.map((o) => {
            const active = a.layout === o.id;
            return (
              <label
                key={o.id}
                className={`flex cursor-pointer items-start gap-3 rounded-md border bg-[var(--surface-2)] px-3 py-2.5 transition-colors ${
                  active
                    ? "border-[var(--accent-400)]/60"
                    : "border-[var(--line-soft)] hover:border-[var(--line-strong)]"
                }`}
                data-testid={`studio-layout-${o.id}`}
                data-active={active}
              >
                <input
                  type="radio"
                  name="layout"
                  value={o.id}
                  checked={active}
                  onChange={() => setLayout(o.id)}
                  className="mt-1 h-3.5 w-3.5 shrink-0 accent-[var(--accent-400)]"
                />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-[var(--text-strong)]">
                    {o.name}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-muted)]">
                    {o.description}
                  </p>
                </div>
              </label>
            );
          })}
        </div>
      </PanelCard>

      <PanelCard
        testId="studio-appearance-background"
        title="Background"
        description="How the page sits behind the profile content."
      >
        <div className="grid grid-cols-1 gap-2.5">
          {BACKGROUND_OPTIONS.map((o) => {
            const active = a.background === o.id;
            return (
              <label
                key={o.id}
                className={`flex cursor-pointer items-start gap-3 rounded-md border bg-[var(--surface-2)] px-3 py-2.5 transition-colors ${
                  active
                    ? "border-[var(--accent-400)]/60"
                    : "border-[var(--line-soft)] hover:border-[var(--line-strong)]"
                }`}
                data-testid={`studio-background-${o.id}`}
                data-active={active}
              >
                <input
                  type="radio"
                  name="background"
                  value={o.id}
                  checked={active}
                  onChange={() => setBackground(o.id)}
                  className="mt-1 h-3.5 w-3.5 shrink-0 accent-[var(--accent-400)]"
                />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-[var(--text-strong)]">
                    {o.name}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-muted)]">
                    {o.description}
                  </p>
                </div>
              </label>
            );
          })}
        </div>
      </PanelCard>
    </div>
  );
}