import type { RequestStore } from "@/hooks/request-types"

export type CommitFn = (updater: (prev: RequestStore) => RequestStore) => void
export const WORKSPACE_PERSONAL_ID = "ws-personal"
