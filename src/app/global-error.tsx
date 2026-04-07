"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen flex items-center justify-center bg-[var(--background,#04120a)] text-[var(--foreground,#e8e4d9)]">
        <div className="text-center px-6 py-12 max-w-md">
          <h1 className="text-2xl font-bold mb-3">Something went wrong</h1>
          <p className="text-[var(--muted,#8a8473)] mb-6">
            An unexpected error occurred. Try refreshing the page.
          </p>
          <button
            onClick={reset}
            className="px-5 py-2.5 rounded-lg bg-[var(--accent,#2d6a4f)] text-white font-medium hover:opacity-90 transition-opacity"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
