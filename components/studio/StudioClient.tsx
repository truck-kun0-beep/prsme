"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { ProfileDraftProvider, useProfileDraft } from "@/components/ProfileDraftProvider";
import { useThemeMount } from "@/components/useTheme";
import { IconCheck, IconReset, IconSave } from "./StudioIcons";
import { AppearancePanel } from "./AppearancePanel";
import { IdentityPanel } from "./IdentityPanel";
import { CollectionsPanel } from "./CollectionsPanel";
import { SectionsPanel } from "./SectionsPanel";
import { SoundtrackPanel } from "./SoundtrackPanel";
import { PrivacyPanel } from "./PrivacyPanel";
import { LivePreviewFrame } from "./LivePreviewFrame";
import type { PanelId } from "./types";
import { PANEL_DEFINITIONS } from "./types";

/**
 * Top-level studio entry point.
 *
 * The studio is a fully client-side application: its hooks depend on
 * localStorage hydration and must run on the client. To keep SSR and
 * the first-paint experience reasonable, we render a minimal boot shell
 * during SSR and the full studio UI on mount.
 */
export function StudioClient() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <StudioBootShell />;
  return (
    <ProfileDraftProvider>
      <StudioShell />
    </ProfileDraftProvider>
  );
}

function StudioBootShell() {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-[var(--line-soft)] bg-[var(--surface-1)]/85 backdrop-blur-md">
        <div className="container-page flex h-14 items-center">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-iris-300">
            Customization Studio
          </span>
        </div>
      </header>
      <div className="container-page flex min-h-[60vh] items-center justify-center">
        <p className="text-[13px] text-[var(--text-muted)]">Loading studio…</p>
      </div>
    </div>
  );
}

function StudioShell() {
  const { draft, hydrated, dirty, lastSavedAt, lastError, save, reset } =
    useProfileDraft();
  const [activePanel, setActivePanel] = useState<PanelId>("appearance");
  const [resetOpen, setResetOpen] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [mobileView, setMobileView] = useState<"controls" | "preview">(
    "controls",
  );

  // Apply saved theme so the studio chrome reflects the current draft.
  useThemeMount(draft.appearance);

  const onSave = useCallback(() => {
    const result = save();
    if (result.ok) {
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1600);
    }
  }, [save]);

  const onResetConfirmed = useCallback(() => {
    reset();
    setResetOpen(false);
  }, [reset]);

  // Keyboard shortcuts: Cmd/Ctrl+S to save, Esc to close reset dialog.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        onSave();
      }
      if (e.key === "Escape" && resetOpen) {
        setResetOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSave, resetOpen]);

  const statusText = useMemo(() => {
    if (lastError) return lastError;
    if (!hydrated) return "Loading…";
    if (savedFlash) return "Saved on this device.";
    if (dirty) return "Unsaved changes";
    if (lastSavedAt) {
      return `Saved on this device.`;
    }
    return "Ready to customize.";
  }, [hydrated, dirty, lastSavedAt, lastError, savedFlash]);

  return (
    <div className="min-h-dvh">
      {/* Studio top bar — different from the public SiteNav. */}
      <header className="sticky top-0 z-40 border-b border-[var(--line-soft)] bg-[var(--surface-1)]/85 backdrop-blur-md">
        <div className="container-page flex h-14 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/u/noir"
              className="inline-flex items-center gap-2 rounded-md border border-[var(--line-soft)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-default)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text-strong)]"
              aria-label="Return to public profile preview"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                <path d="M14 7 L8 12 L14 17" />
              </svg>
              <span className="hidden sm:inline">Back to profile</span>
            </Link>
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-iris-300">
                Customization Studio
              </p>
              <h1 className="truncate font-display text-base text-[var(--text-strong)] sm:text-lg">
                Editing <span className="text-[var(--text-muted)]">@</span>{draft.identity.username}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              role="status"
              aria-live="polite"
              className={`hidden text-[12px] sm:inline ${
                lastError
                  ? "text-[color:#D6757B]"
                  : dirty
                    ? "text-iris-300"
                    : "text-[var(--text-muted)]"
              }`}
            >
              {statusText}
            </span>
            <button
              type="button"
              onClick={onSave}
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent-400)] px-3 py-2 text-[12px] font-medium text-[var(--surface-0)] transition-transform duration-200 ease-soft hover:-translate-y-0.5 disabled:opacity-50"
              disabled={!dirty || !hydrated}
              aria-keyshortcuts="Control+S Meta+S"
              data-testid="studio-save-btn"
            >
              <IconSave size={14} />
              Save
            </button>
            <button
              type="button"
              onClick={() => setResetOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line-strong)] bg-[var(--surface-3)] px-3 py-2 text-[12px] font-medium text-[var(--text-default)] transition-colors hover:bg-[var(--surface-4)]"
              data-testid="studio-reset-btn"
            >
              <IconReset size={14} />
              <span className="hidden sm:inline">Reset demo</span>
            </button>
          </div>
        </div>

        {/* Mobile view switcher — controls vs. preview */}
        <div className="container-page mt-0 mb-2 flex sm:hidden" data-testid="studio-mobile-switcher">
          <div role="tablist" aria-label="Studio view" className="flex w-full overflow-hidden rounded-md border border-[var(--line-soft)]">
            {(["controls", "preview"] as const).map((v) => (
              <button
                key={v}
                role="tab"
                type="button"
                aria-selected={mobileView === v}
                onClick={() => setMobileView(v)}
                className={`flex-1 px-3 py-2 text-[12px] font-medium transition-colors ${
                  mobileView === v
                    ? "bg-[var(--accent-400)] text-[var(--surface-0)]"
                    : "bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text-default)]"
                }`}
                data-testid={`studio-mobile-tab-${v}`}
              >
                {v === "controls" ? "Controls" : "Live preview"}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Two-panel layout */}
      <div className="container-page grid gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:gap-8 lg:py-8">
        <section
          aria-label="Studio controls"
          data-testid="studio-controls-panel"
          className={`min-w-0 lg:block ${
            mobileView === "controls" ? "block" : "hidden lg:block"
          }`}
        >
          <PanelTabs
            active={activePanel}
            onSelect={setActivePanel}
          />
          <div className="mt-4 space-y-4">
            {/*
              All panels are mounted so SSR HTML contains every panel's
              testid, social editor, and palette picker. Inactive panels
              are visually hidden via `hidden`. This keeps the studio
              instant on first paint and avoids the SSR/CSR divergence
              seen when panels render conditionally.
            */}
            <div hidden={activePanel !== "appearance"} data-panel-id="appearance">
              <AppearancePanel />
            </div>
            <div hidden={activePanel !== "identity"} data-panel-id="identity">
              <IdentityPanel />
            </div>
            <div hidden={activePanel !== "collections"} data-panel-id="collections">
              <CollectionsPanel />
            </div>
            <div hidden={activePanel !== "sections"} data-panel-id="sections">
              <SectionsPanel />
            </div>
            <div hidden={activePanel !== "soundtrack"} data-panel-id="soundtrack">
              <SoundtrackPanel />
            </div>
            <div hidden={activePanel !== "privacy"} data-panel-id="privacy">
              <PrivacyPanel />
            </div>
          </div>
        </section>

        <section
          aria-label="Live preview"
          data-testid="studio-preview-panel"
          className={`min-w-0 lg:block ${
            mobileView === "preview" ? "block" : "hidden lg:block"
          }`}
        >
          <LivePreviewFrame />
        </section>
      </div>

      <SiteFooter />

      {/* Reset confirmation */}
      {resetOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="studio-reset-title"
          data-testid="studio-reset-dialog"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setResetOpen(false);
          }}
        >
          <div className="container-page flex min-h-full items-center justify-center p-4">
            <div className="w-full max-w-md rounded-lg border border-[var(--line-strong)] bg-[var(--surface-2)] p-5 shadow-glow">
              <h2
                id="studio-reset-title"
                className="font-display text-xl text-[var(--text-strong)]"
              >
                Reset demo profile?
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-muted)]">
                This restores the original Noir profile and appearance. Any
                customizations saved on this device will be cleared from local
                storage. You can&apos;t undo this.
              </p>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResetOpen(false)}
                  className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-3)] px-3 py-2 text-[12px] font-medium text-[var(--text-default)] hover:bg-[var(--surface-4)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onResetConfirmed}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line-strong)] bg-[var(--surface-4)] px-3 py-2 text-[12px] font-medium text-[var(--text-strong)] hover:bg-[var(--surface-4)]/90"
                  data-testid="studio-reset-confirm-btn"
                >
                  <IconCheck size={14} />
                  Yes, reset demo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PanelTabs({
  active,
  onSelect,
}: {
  active: PanelId;
  onSelect: (p: PanelId) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Studio panel"
      className="flex flex-wrap gap-1.5"
      data-testid="studio-panel-tabs"
    >
      {PANEL_DEFINITIONS.map((p) => (
        <button
          key={p.id}
          type="button"
          role="tab"
          aria-selected={active === p.id}
          onClick={() => onSelect(p.id)}
          data-testid={`studio-tab-${p.id}`}
          className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors ${
            active === p.id
              ? "border-[var(--accent-400)]/60 bg-[var(--accent-400)]/12 text-[var(--text-strong)]"
              : "border-[var(--line-soft)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text-default)]"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}