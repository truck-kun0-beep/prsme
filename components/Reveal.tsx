"use client";

import { useEffect, useRef } from "react";

/**
 * Adds the `is-visible` class to a child element once it enters the viewport.
 * Honors `prefers-reduced-motion` by skipping the reveal entirely (CSS in
 * globals.css also neutralizes the transform for that media query).
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: keyof React.JSX.IntrinsicElements;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      el.classList.add("is-visible");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            window.setTimeout(() => el.classList.add("is-visible"), delay);
            io.unobserve(el);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [delay]);

  const Component = Tag as unknown as React.ElementType;
  return (
    <Component ref={ref} className={`reveal ${className}`}>
      {children}
    </Component>
  );
}