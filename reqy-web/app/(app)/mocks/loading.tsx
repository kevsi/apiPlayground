/**
 * Loading UI shown while the Mocks page is being prepared.
 * Mirrors the server list + route editor layout to avoid a layout shift.
 */
export default function Loading() {
  return (
    <div className="flex h-full w-full" role="status" aria-label="Loading mocks">
      {/* Left: mock server list */}
      <div className="w-[280px] border-r border-border bg-muted/30 p-3 space-y-2">
        <div className="h-8 w-full skeleton rounded-md" />
        <div className="h-10 w-full skeleton rounded-md opacity-60" />
        <div className="h-10 w-full skeleton rounded-md opacity-40" />
      </div>

      {/* Right: route editor */}
      <div className="flex-1 p-6 space-y-3">
        <div className="h-7 w-48 skeleton rounded" />
        <div className="h-4 w-72 skeleton rounded opacity-60" />
        <div className="flex-1 skeleton rounded-lg opacity-40 mt-4" />
      </div>
    </div>
  )
}
