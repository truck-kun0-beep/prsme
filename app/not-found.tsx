import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";

export default function NotFound() {
  return (
    <main
      id="main"
      className="container-page flex min-h-dvh flex-col items-center justify-center text-center"
    >
      <Wordmark size="md" asLink={false} />
      <p className="mt-8 font-mono text-[12px] uppercase tracking-[0.22em] text-iris-300">
        404
      </p>
      <h1 className="mt-3 font-display text-display-md text-muted-50">
        That page hasn&apos;t been built yet.
      </h1>
      <p className="mt-3 max-w-sm text-[14px] text-muted-200">
        PRSME is in active development. The page you tried to reach will land in
        a later phase.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex h-11 items-center rounded-md bg-iris-400 px-5 text-sm font-medium text-ink-950 transition-transform duration-200 ease-soft hover:-translate-y-0.5"
      >
        Back to home
      </Link>
    </main>
  );
}
