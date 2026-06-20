export interface SyncPayload {
  type: "update"
  gen: number
}

export interface CrossTabSyncInstance {
  broadcast: (payload: SyncPayload) => void
  listenStorage: (key: string, handler: (value: string) => void) => () => void
  cleanup: () => void
}

export function withCrossTabSync(channelName: string): CrossTabSyncInstance {
  let channel: BroadcastChannel | null = null

  try {
    channel = new BroadcastChannel(channelName)
  } catch {
    channel = null
  }

  return {
    broadcast(payload: SyncPayload) {
      if (channel) {
        channel.postMessage(payload)
      }
    },

    listenStorage(key: string, handler: (value: string) => void) {
      const onStorage = (e: StorageEvent) => {
        if (e.key === key && e.newValue) {
          handler(e.newValue)
        }
      }
      if (typeof window !== "undefined") {
        window.addEventListener("storage", onStorage)
      }
      return () => {
        if (typeof window !== "undefined") {
          window.removeEventListener("storage", onStorage)
        }
      }
    },

    cleanup() {
      channel?.close()
    },
  }
}
