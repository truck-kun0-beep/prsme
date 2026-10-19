import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode, Ref } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium tracking-tight transition-all duration-200 ease-soft focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary:
    "bg-iris-400 text-ink-950 shadow-glow hover:bg-iris-300 hover:translate-y-[-1px] active:translate-y-0",
  secondary:
    "bg-ink-700/80 text-muted-50 border border-line-strong hover:bg-ink-600 hover:border-iris-400/40 hover:text-muted-50",
  ghost:
    "bg-transparent text-muted-100 hover:text-muted-50 hover:bg-ink-700/50",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[13px]",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-6 text-[15px]",
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  iconTrailing?: ReactNode;
  iconLeading?: ReactNode;
  className?: string;
  children: ReactNode;
}

type ButtonAsButton = CommonProps &
  Omit<ComponentPropsWithoutRef<"button">, "ref"> & {
    href?: undefined;
    ref?: Ref<HTMLButtonElement>;
  };

type ButtonAsLink = CommonProps &
  Omit<ComponentPropsWithoutRef<"a">, "ref" | "href"> & {
    href: string;
    ref?: Ref<HTMLAnchorElement>;
  };

export function Button(props: ButtonAsButton | ButtonAsLink) {
  const {
    variant = "primary",
    size = "md",
    iconLeading,
    iconTrailing,
    className = "",
    children,
    ref,
  } = props;
  const cls = `${base} ${variants[variant]} ${sizes[size]} ${className}`;

  if ("href" in props && props.href) {
    const { href, target, rel } = props;
    return (
      <Link
        href={href}
        target={target}
        rel={rel}
        ref={ref as Ref<HTMLAnchorElement>}
        className={cls}
      >
        {iconLeading ? <span aria-hidden>{iconLeading}</span> : null}
        <span>{children}</span>
        {iconTrailing ? <span aria-hidden>{iconTrailing}</span> : null}
      </Link>
    );
  }

  const {
    variant: _v,
    size: _s,
    iconLeading: _il,
    iconTrailing: _it,
    className: _c,
    children: _ch,
    ref: _r,
    ...rest
  } = props as ButtonAsButton;
  return (
    <button className={cls} ref={ref as Ref<HTMLButtonElement>} {...rest}>
      {iconLeading ? <span aria-hidden>{iconLeading}</span> : null}
      <span>{children}</span>
      {iconTrailing ? <span aria-hidden>{iconTrailing}</span> : null}
    </button>
  );
}