"use client";

import { useRef, useState } from "react";
import type { Palette } from "@/lib/noirProfile";
import { IconTrash } from "./StudioIcons";

const MAX_DIM = 320; // Largest side in pixels after compression.
const JPEG_QUALITY = 0.86;
const MAX_DATA_URL_LENGTH = 240_000;

interface Props {
  dataUrl: string | null;
  palette: Palette;
  palettes: Palette[];
  onAvatarChange: (next: string | null) => void;
  onPaletteChange: (palette: Palette) => void;
}

export function AvatarUpload({
  dataUrl,
  palette,
  palettes,
  onAvatarChange,
  onPaletteChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function handleFile(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("That doesn't look like an image file.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("That image is too large — pick one under 8MB.");
      return;
    }
    setWorking(true);
    try {
      const dataUrl = await readAsDataUrl(file);
      const compressed = await compressImage(dataUrl, MAX_DIM, JPEG_QUALITY);
      if (compressed.length > MAX_DATA_URL_LENGTH) {
        setError(
          "We couldn't shrink that image enough. Try a smaller photo.",
        );
        setWorking(false);
        return;
      }
      onAvatarChange(compressed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read the image.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      {/* Preview + drop */}
      <div className="flex flex-col items-start gap-3">
        <div className="relative h-24 w-24 overflow-hidden rounded-full border border-[var(--line-strong)] bg-[var(--surface-2)]">
          {dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={dataUrl}
              alt="Uploaded avatar preview"
              className="h-full w-full object-cover"
            />
          ) : (
            <PaletteCircle palette={palette} />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={working}
            className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-default)] hover:bg-[var(--surface-3)] disabled:opacity-50"
            data-testid="studio-avatar-pick-btn"
          >
            {working ? "Working…" : dataUrl ? "Replace image" : "Upload image"}
          </button>
          {dataUrl && (
            <button
              type="button"
              onClick={() => onAvatarChange(null)}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--line-soft)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-strong)]"
              data-testid="studio-avatar-clear-btn"
            >
              <IconTrash size={12} /> Remove
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png, image/jpeg, image/webp"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            // Reset so the same file can be re-picked if needed.
            e.target.value = "";
          }}
          aria-label="Avatar file"
        />
      </div>

      <div className="flex-1 space-y-3">
        <div className="space-y-1.5">
          <p className="text-[12px] font-medium text-[var(--text-default)]">
            Generative backup
          </p>
          <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
            If you don&apos;t upload an image, PRSME draws a quiet generative avatar
            from one of these palettes.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {palettes.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPaletteChange(p)}
              aria-pressed={palette === p}
              aria-label={`Avatar palette ${p}`}
              data-testid={`studio-palette-${p}`}
              className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-[11px] capitalize transition-colors ${
                palette === p
                  ? "border-[var(--accent-400)]/60 bg-[var(--accent-400)]/12 text-[var(--text-strong)]"
                  : "border-[var(--line-soft)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text-default)]"
              }`}
            >
              <PaletteSwatch p={p} />
              {p}
            </button>
          ))}
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-md border border-[color:#D6757B] bg-[color:#391A22] px-3 py-2 text-[12px] text-[color:#E9A5A8]"
          >
            {error}
          </p>
        )}
        {!error && (
          <p className="text-[11px] text-[var(--text-muted)]">
            We resize to {MAX_DIM}px, recompress as JPEG, and store the data URL
            in this browser&apos;s localStorage only.
          </p>
        )}
      </div>
    </div>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Read failure"));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  });
}

async function compressImage(
  src: string,
  maxDim: number,
  quality: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      const scale = Math.min(1, maxDim / Math.max(width, height));
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));
      const canvas =
        typeof OffscreenCanvas !== "undefined"
          ? new OffscreenCanvas(w, h)
          : Object.assign(document.createElement("canvas"), { width: w, height: h });
      const ctx = (canvas as HTMLCanvasElement).getContext("2d");
      if (!ctx) {
        reject(new Error("No 2D context"));
        return;
      }
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, w, h);
      try {
        if (canvas instanceof OffscreenCanvas) {
          canvas
            .convertToBlob({ type: "image/jpeg", quality })
            .then((blob) => blobToDataUrl(blob))
            .then(resolve)
            .catch(reject);
        } else {
          const dataUrl = (canvas as HTMLCanvasElement).toDataURL("image/jpeg", quality);
          resolve(dataUrl);
        }
      } catch (e) {
        reject(e instanceof Error ? e : new Error("Compression failed"));
      }
    };
    img.onerror = () => reject(new Error("Image failed to decode"));
    img.src = src;
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Read failure"));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(blob);
  });
}

function PaletteSwatch({ p }: { p: Palette }) {
  const paletteColors: Record<Palette, [string, string, string]> = {
    amber: ["#3A2A12", "#A07736", "#F2D49A"],
    iris: ["#1A1244", "#4730A0", "#C8B8FF"],
    rose: ["#3A0F1F", "#9D2F5A", "#F4B7C8"],
    cyan: ["#0F2A33", "#2E7C8A", "#A7E0EA"],
    forest: ["#0E1F14", "#2E6B3F", "#B7D9B7"],
    sand: ["#2E241A", "#8B7355", "#E5D2B1"],
    mono: ["#0F0F12", "#444450", "#CCCCD0"],
    violet: ["#1A0F2E", "#5C2EA0", "#D3B7F2"],
    rust: ["#2A140A", "#94431F", "#E8A57A"],
  };
  const c = paletteColors[p] ?? paletteColors.iris;
  return (
    <span
      className="inline-block h-3 w-3 rounded-full"
      style={{ background: `linear-gradient(135deg, ${c[0]}, ${c[1]}, ${c[2]})` }}
      aria-hidden
    />
  );
}

function PaletteCircle({ palette }: { palette: Palette }) {
  return (
    <div className="grid h-full w-full place-items-center">
      <PaletteSwatch p={palette} />
    </div>
  );
}