import type { RequestStore, Notification } from "@/hooks/request-types"
import { CommitFn, WORKSPACE_PERSONAL_ID } from "./types"
import { toast } from "@/hooks/use-toast"

export function createNotificationsMutations(commit: CommitFn) {
  const addNotification = (
    notification: Omit<Notification, "id" | "read" | "createdAt"> & {
      id?: string
      read?: boolean
      createdAt?: number
    },
  ) => {
    const newNotification: Notification = {
      ...notification,
      id: notification.id ?? crypto.randomUUID(),
      read: notification.read ?? false,
      createdAt: notification.createdAt ?? Date.now(),
    }

    commit((prev: RequestStore) => ({
      ...prev,
      notifications: [...prev.notifications, newNotification],
    }))

    if (newNotification.type && newNotification.type !== "info") {
      toast({
        title: newNotification.title,
        description: newNotification.body,
        variant: newNotification.type === "error" ? "destructive" : "default",
      })
    }
  }

  const markNotificationRead = (
    id: string) => {
      commit((prev: RequestStore) => ({
        ...prev,
        notifications: prev.notifications.map((n) =>
          n.id === id ? { ...n, read: true } : n,
        ),
      }))
    }

  const clearNotifications = () => {
    commit((prev: RequestStore) => ({
      ...prev,
      notifications: prev.notifications.filter(
        (n) =>
          prev.activeWorkspaceId && prev.activeWorkspaceId !== WORKSPACE_PERSONAL_ID
            ? n.event !== undefined
            : false,
      ),
    }))
  }

  const setNotificationPreference = (
    key: string, value: boolean) => {
      commit((prev: RequestStore) => ({
        ...prev,
        notificationPreferences: {
          ...(prev.notificationPreferences ?? {}),
          [key]: value,
        },
      }))
    }

  const requestSystemNotificationPermission = async () => {
    if (!("Notification" in window)) {
      commit((prev: RequestStore) => ({
        ...prev,
        systemNotificationPermission: "unsupported",
      }))
      return "unsupported" as const
    }

    const result = await Notification.requestPermission()
    commit((prev: RequestStore) => ({
      ...prev,
      systemNotificationPermission: result,
    }))
    return result
  }

  return {
    addNotification,
    markNotificationRead,
    clearNotifications,
    setNotificationPreference,
    requestSystemNotificationPermission,
  }
}
