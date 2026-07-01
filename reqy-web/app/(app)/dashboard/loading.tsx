/**
 * Loading UI shown while the Dashboard page is being prepared.
 * The (app) layout keeps the sidebar + header visible — only the main area
 * is replaced with this skeleton to avoid the white flash.
 */
export default function Loading() {
  return (
    <div className="flex h-full w-full flex-col gap-4 p-6" role="status" aria-label="Loading dashboard">
      {/* Header skeleton */}
      <div className="flex flex-col gap-2">
        <div className="h-7 w-40 skeleton rounded" />
        <div className="h-4 w-64 skeleton rounded opacity-60" />
      </div>

      {/* Stat cards skeleton */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border/40 p-4 space-y-2">
            <div className="h-3 w-20 skeleton rounded opacity-60" />
            <div className="h-6 w-16 skeleton rounded" />
          </div>
        ))}
      </div>

      {/* Chart skeleton */}
      <div className="flex-1 skeleton rounded-lg opacity-40" />
    </div>
  )
}
