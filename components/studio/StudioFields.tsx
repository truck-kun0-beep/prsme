/** Reusable form primitives used by the studio panels. */

import type {
  ChangeEvent,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";

export function FieldGroup({
  label,
  hint,
  error,
  children,
  id,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  id: string;
}) {
  return (
    <div className="space-y-1.5" data-field-id={id}>
      <label
        htmlFor={id}
        className="block text-[12px] font-medium text-[var(--text-default)]"
      >
        {label}
      </label>
      {children}
      {hint && !error && (
        <p className="text-[11px] text-[var(--text-muted)]">{hint}</p>
      )}
      {error && (
        <p className="text-[11px] text-[color:#D6757B]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextInput({
  id,
  value,
  onChange,
  onBlur,
  type = "text",
  invalid,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  invalid?: boolean;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      aria-invalid={invalid || undefined}
      className={`block w-full rounded-md border bg-[var(--surface-2)] px-3 py-2 text-[13px] text-[var(--text-strong)] placeholder:text-[var(--text-faint)] focus:border-[var(--accent-400)] focus:outline-none ${
        invalid
          ? "border-[color:#D6757B]"
          : "border-[var(--line-strong)]"
      }`}
      {...rest}
    />
  );
}

export function TextArea({
  id,
  value,
  onChange,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  id: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
}) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={onChange}
      className="block w-full resize-y rounded-md border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-2 text-[13px] leading-relaxed text-[var(--text-strong)] placeholder:text-[var(--text-faint)] focus:border-[var(--accent-400)] focus:outline-none"
      {...rest}
    />
  );
}

export function Select({
  id,
  value,
  onChange,
  children,
  ...rest
}: InputHTMLAttributes<HTMLSelectElement> & {
  id: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={onChange}
      className="block w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-2 text-[13px] text-[var(--text-strong)] focus:border-[var(--accent-400)] focus:outline-none"
      {...rest}
    >
      {children}
    </select>
  );
}

export function PanelCard({
  title,
  description,
  children,
  testId,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section
      data-testid={testId}
      className="rounded-lg border border-[var(--line-strong)] bg-[var(--surface-1)] p-4 sm:p-5"
    >
      <header className="mb-4">
        <h2 className="font-display text-lg text-[var(--text-strong)]">{title}</h2>
        {description && (
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-muted)]">
            {description}
          </p>
        )}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}