"use client"

import type { ReactNode } from "react"
import { SyncStatusBanner } from "@/components/sync-status-banner"
import { SyncEngineInitializer } from "@/components/sync-engine-initializer"

/**
 * Client-side wrapper mounted inside the server `RootLayout` body.
 * Hosts the sync engine initializer + the sync status banner so both
 * run exactly once per session across all routes.
 */
export function ClientLayoutShell({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <SyncEngineInitializer />
      <SyncStatusBanner />
    </>
  )
}
