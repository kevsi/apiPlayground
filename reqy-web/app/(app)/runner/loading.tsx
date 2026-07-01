/**
 * Loading UI shown while the Runner page is being prepared.
 * Mirrors the report list + details layout.
 */
export default function Loading() {
  return (
    <div className="flex h-full w-full flex-col p-6 gap-4" role="status" aria-label="Loading runner">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-6 w-6 skeleton rounded opacity-60" />
        <div className="h-7 w-48 skeleton rounded" />
      </div>

      {/* Two-pane area */}
      <div className="flex flex-1 gap-4">
        {/* Left: collection list */}
        <div className="w-72 space-y-2">
          <div className="h-8 w-full skeleton rounded-md" />
          <div className="h-12 w-full skeleton rounded-md opacity-60" />
          <div className="h-12 w-full skeleton rounded-md opacity-40" />
        </div>

        {/* Right: report details */}
        <div className="flex-1 space-y-3">
          <div className="h-8 w-full skeleton rounded-md" />
          <div className="h-32 w-full skeleton rounded-lg opacity-60" />
          <div className="h-32 w-full skeleton rounded-lg opacity-40" />
        </div>
      </div>
    </div>
  )
}
