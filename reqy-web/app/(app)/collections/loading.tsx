/**
 * Loading UI shown while the Collections page is being prepared.
 * Mirrors the two-pane layout (sidebar list + main panel) so the transition
 * to the real content feels seamless.
 */
export default function Loading() {
  return (
    <div className="flex h-full w-full" role="status" aria-label="Loading collections">
      {/* Left: collection/folder tree */}
      <div className="w-72 border-r border-border p-3 space-y-2">
        <div className="h-8 w-full skeleton rounded-md" />
        <div className="h-6 w-3/4 skeleton rounded opacity-60" />
        <div className="h-6 w-2/3 skeleton rounded opacity-60" />
        <div className="h-6 w-4/5 skeleton rounded opacity-60" />
        <div className="h-6 w-1/2 skeleton rounded opacity-40" />
      </div>

      {/* Right: main panel */}
      <div className="flex-1 p-6 space-y-3">
        <div className="h-7 w-48 skeleton rounded" />
        <div className="h-4 w-64 skeleton rounded opacity-60" />
        <div className="flex-1 skeleton rounded-lg opacity-40 mt-4" />
      </div>
    </div>
  )
}
