"use client"

// Lazy-load FloatingAiChat so its ~700 lines + AI engine + CodeMirror chunk
// don't ship in the initial bundle. The root layout (a Server Component) just
// imports this thin client wrapper.

import dynamic from "next/dynamic"

export const FloatingAiChat = dynamic(
  () =>
    import("@/components/floating-ai-chat").then((m) => ({
      default: m.FloatingAiChat,
    })),
  {
    ssr: false,
    loading: () => null,
  },
)
