/**
 * Tiny icon library used by the studio controls. Inline SVGs only so we
 * don't pull a dependency.
 */

import type { SVGProps } from "react";

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  size?: number;
}

function makePath(d: string | React.ReactNode, props: IconProps = {}) {
  const { size = 16, ...rest } = props;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {typeof d === "string" ? <path d={d} /> : d}
    </svg>
  );
}

export const IconCheck = (p: IconProps) =>
  makePath(<>
    <path d="M4 12 L10 18 L20 6" />
  </>, p);
export const IconX = (p: IconProps) => makePath(<>
  <path d="M5 5 L19 19" /><path d="M19 5 L5 19" /></>, p);
export const IconUp = (p: IconProps) => makePath("M6 14 L12 8 L18 14", p);
export const IconDown = (p: IconProps) => makePath("M6 10 L12 16 L18 10", p);
export const IconTrash = (p: IconProps) => makePath(<>
  <path d="M5 7 H19" /><path d="M9 7 V5 H15 V7" />
  <path d="M7 7 L8 20 H16 L17 7" /></>, p);
export const IconPlus = (p: IconProps) => makePath(<>
  <path d="M5 12 H19" /><path d="M12 5 V19" /></>, p);
export const IconReset = (p: IconProps) => makePath(<>
  <path d="M21 12 A9 9 0 1 1 6.6 7" /><path d="M21 4 V10 H15" /></>, p);
export const IconExternal = (p: IconProps) => makePath(<>
  <path d="M7 17 L17 7" /><path d="M9 7 H17 V15" /></>, p);
export const IconSave = (p: IconProps) => makePath(<>
  <path d="M6 4 H17 L20 7 V20 H4 V4" /><path d="M8 4 V9 H16 V4" /></>, p);
export const IconChevron = (p: IconProps) => makePath("M9 6 L15 12 L9 18", p);
export const IconEye = (p: IconProps) => makePath(<>
  <path d="M3 12 C5 6 8 4 12 4 C16 4 19 6 21 12 C19 18 16 20 12 20 C8 20 5 18 3 12" />
  <circle cx="12" cy="12" r="2.5" /></>, p);
export const IconEyeOff = (p: IconProps) => makePath(<>
  <path d="M4 4 L20 20" /><path d="M9.5 6.2 C10.3 6 11.1 6 12 6 C16 6 19 7.5 21 12 C20.5 13.2 19.8 14.2 19 15" />
  <path d="M6.5 7.4 C5 8.5 3.9 10 3 12 C5 17 8 18.5 12 19" /></>, p);
export const IconSearch = (p: IconProps) => makePath(<>
  <circle cx="11" cy="11" r="6" /><path d="M15.5 15.5 L20 20" /></>, p);

/** Indeterminate progress. Used while a Spotify oEmbed lookup is in flight. */
export const IconSpinner = (p: IconProps) => {
  const { size = 16, ...rest } = p;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
      className={`animate-spin ${rest.className ?? ""}`.trim()}
      {...rest}
    >
      <circle cx="12" cy="12" r="9" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  );
};
export const IconLock = (p: IconProps) => makePath(<>
  <rect x="5" y="11" width="14" height="9" rx="2" />
  <path d="M8 11 V8 A4 4 0 0 1 16 8 V11" /></>, p);
export const IconGear = (p: IconProps) => makePath(<>
  <circle cx="12" cy="12" r="3" />
  <path d="M12 2 V5" /><path d="M12 19 V22" />
  <path d="M5 5 L7 7" /><path d="M17 17 L19 19" />
  <path d="M2 12 H5" /><path d="M19 12 H22" /></>, p);
export const IconSliders = (p: IconProps) => makePath(<>
  <path d="M5 7 H19" /><circle cx="9" cy="7" r="2.5" />
  <path d="M5 12 H19" /><circle cx="15" cy="12" r="2.5" />
  <path d="M5 17 H19" /><circle cx="11" cy="17" r="2.5" /></>, p);
