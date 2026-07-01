/**
 * Loading UI for route transitions.
 *
 * Shows a subtle skeleton inside the existing layout (sidebar + header stay
 * visible).  The skeleton mirrors the content area structure so users don't
 * perceive a layout shift when the real content arrives.
 */
export default function Loading() {
  return (
    <div className="flex flex-1 flex-col h-full overflow-hidden" role="status" aria-label="Loading">
      {/* ── Mock header bar ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40">
        <div className="h-8 w-64 skeleton rounded-md" />
        <div className="h-8 w-32 skeleton rounded-md ml-auto" />
        <div className="h-8 w-8 skeleton rounded-md" />
      </div>

      {/* ── Tab bar placeholder ── */}
      <div className="flex items-center gap-1 px-4 pt-2 pb-1 border-b border-border/40">
        <div className="h-8 w-40 skeleton rounded-t-md rounded-b-none" />
        <div className="h-8 w-32 skeleton rounded-t-md rounded-b-none opacity-50" />
        <div className="h-8 w-8 skeleton rounded-md ml-auto opacity-40" />
      </div>

      {/* ── URL bar ── */}
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="h-9 w-20 skeleton rounded-md" />
        <div className="h-9 flex-1 skeleton rounded-md" />
        <div className="h-9 w-24 skeleton rounded-md" />
      </div>

      {/* ── Split panels ── */}
      <div className="flex flex-1 gap-0.5 px-4 pb-4">
        {/* Request panel */}
        <div className="flex-1 flex flex-col gap-3 p-3 rounded-lg border border-border/20">
          <div className="h-5 w-24 skeleton rounded" />
          <div className="flex-1 skeleton rounded-md opacity-60" />
          <div className="h-10 w-full skeleton rounded-md opacity-40" />
        </div>

        {/* Divider */}
        <div className="w-px bg-border/20 mx-1" />

        {/* Response panel */}
        <div className="flex-1 flex flex-col gap-3 p-3 rounded-lg border border-border/20">
          <div className="flex items-center gap-3">
            <div className="h-5 w-28 skeleton rounded" />
            <div className="h-5 w-16 skeleton rounded opacity-50" />
          </div>
          <div className="flex-1 skeleton rounded-md opacity-40" />
        </div>
      </div>
    </div>
  )
}
