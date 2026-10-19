"use client";

/**
 * Interactive preview of theme switching — picks between several named
 * palettes to illustrate how a profile background, accent and header band
 * would retune. Pure CSS theme swap; state is local.
 */

import { useState } from "react";
import { Artwork } from "./Artwork";

interface Theme {
  id: string;
  name: string;
  vibe: string;
  bg: string;
  card: string;
  text: string;
  mute: string;
  band: "violet" | "iris" | "amber" | "forest" | "rust" | "rose" | "cyan" | "mono" | "sand";
  accent: string;
  accentText: string;
  serif: boolean;
}

const themes: Theme[] = [
  {
    id: "iris",
    name: "Iris After Dark",
    vibe: "Cinematic night",
    bg: "#0B0B10",
    card: "#101018",
    text: "#F4F4F6",
    mute: "#9A9AAA",
    band: "violet",
    accent: "#8C6CFF",
    accentText: "#0B0B10",
    serif: true,
  },
  {
    id: "paper",
    name: "Paper Lantern",
    vibe: "Quiet morning",
    bg: "#0F0E0C",
    card: "#171513",
    text: "#F4ECE0",
    mute: "#A99E88",
    band: "amber",
    accent: "#E8A57A",
    accentText: "#0B0B10",
    serif: true,
  },
  {
    id: "static",
    name: "Petal Static",
    vibe: "Soft noise",
    bg: "#0A0810",
    card: "#15101E",
    text: "#F4E4F0",
    mute: "#A99FB8",
    band: "rose",
    accent: "#F4B7C8",
    accentText: "#0B0B10",
    serif: false,
  },
  {
    id: "volta",
    name: "Volta",
    vibe: "Studio electric",
    bg: "#080B0F",
    card: "#0E141A",
    text: "#E6F1F4",
    mute: "#7F95A0",
    band: "cyan",
    accent: "#A7E0EA",
    accentText: "#080B0F",
    serif: false,
  },
];

export function ThemePicker() {
  const [active, setActive] = useState<Theme>(themes[0]!);
  return (
    <div className="space-y-5">
      {/* Preview */}
      <div
        className="overflow-hidden rounded-xl border border-white/10 transition-colors duration-500 ease-soft"
        style={{ background: active.bg, color: active.text }}
      >
        <div className="relative h-28 overflow-hidden">
          <Artwork palette={active.band} ratio="auto" className="!h-full !w-full rounded-none" />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(180deg, transparent 60%, ${active.bg} 100%)`,
            }}
          />
          <div className="absolute inset-0 flex items-start justify-between p-4">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em]"
              style={{ background: `${active.bg}cc`, color: active.text }}
            >
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: active.accent }}
              />
              {active.name}
            </span>
          </div>
        </div>
        <div className="p-5">
          <p
            className="font-semibold"
            style={{
              fontFamily: active.serif ? "var(--font-display)" : "var(--font-sans)",
              fontSize: "18px",
            }}
          >
            Noor K.
            <span className="ml-2 text-[12px]" style={{ color: active.mute }}>
              @noor.k
            </span>
          </p>
          <p
            className="mt-2 text-[13px] leading-relaxed"
            style={{ color: active.mute }}
          >
            Quiet films, louder K-dramas. Editors&apos; cuts. Late-night K-pop.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              className="rounded-full px-3.5 py-2 text-[12px] font-medium"
              style={{
                background: active.accent,
                color: active.accentText,
              }}
            >
              Follow
            </button>
            <button
              type="button"
              className="rounded-full border px-3.5 py-2 text-[12px] font-medium"
              style={{
                borderColor: `${active.text}22`,
                color: active.text,
              }}
            >
              Share
            </button>
          </div>
        </div>
      </div>

      {/* Theme picker */}
      <fieldset>
        <legend className="mb-2 text-[11px] uppercase tracking-[0.2em] text-muted-400">
          Try a theme
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {themes.map((t) => {
            const selected = t.id === active.id;
            return (
              <label
                key={t.id}
                className={`group flex cursor-pointer flex-col gap-1.5 rounded-md border px-3 py-2.5 transition-all duration-200 ease-soft ${
                  selected
                    ? "border-iris-400/60 bg-ink-800"
                    : "border-[var(--line-soft)] bg-ink-900/40 hover:border-iris-400/30"
                }`}
              >
                <input
                  type="radio"
                  name="prsme-theme"
                  value={t.id}
                  checked={selected}
                  onChange={() => setActive(t)}
                  className="sr-only"
                />
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="h-4 w-4 rounded-full ring-1 ring-white/15"
                    style={{ background: t.accent }}
                  />
                  <span className="text-[12px] font-medium text-muted-50">
                    {t.name}
                  </span>
                </div>
                <span className="text-[11px] text-muted-400">{t.vibe}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}