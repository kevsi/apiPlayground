"use client"

import { WebSocketTab } from "@/components/websocket/WebSocketTab"

export default function WebSocketPage() {
  return (
    <main className="flex-1 overflow-hidden flex flex-col" data-testid="websocket-page">
      <WebSocketTab />
    </main>
  )
}
