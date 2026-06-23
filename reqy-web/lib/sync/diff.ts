export interface SyncEntity {
  id: string
  data: object
  updatedAt: number
  version: number
  deleted?: boolean
}

export interface DiffResult<T extends SyncEntity> {
  toUpsertRemote: T[]
  toUpsertLocal: T[]
  toDeleteRemote: T[]
  unchanged: T[]
}

export function diffSyncEntities<T extends SyncEntity>(
  local: T[],
  remote: T[]
): DiffResult<T> {
  const localMap = new Map(local.map((e) => [e.id, e]))
  const remoteMap = new Map(remote.map((e) => [e.id, e]))

  const toUpsertRemote: T[] = []
  const toUpsertLocal: T[] = []
  const toDeleteRemote: T[] = []
  const unchanged: T[] = []

  for (const [id, r] of remoteMap) {
    const l = localMap.get(id)
    if (!l) {
      if (!r.deleted) toUpsertRemote.push(r)
    } else if (r.updatedAt > l.updatedAt) {
      if (r.deleted) toDeleteRemote.push(r)
      else toUpsertRemote.push(r)
    } else if (l.updatedAt > r.updatedAt) {
      toUpsertLocal.push(l)
    } else {
      unchanged.push(l)
    }
  }

  for (const [id, l] of localMap) {
    if (!remoteMap.has(id)) {
      toUpsertLocal.push(l)
    }
  }

  return { toUpsertRemote, toUpsertLocal, toDeleteRemote, unchanged }
}
