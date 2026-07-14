import { inferJsonSchema, diffSchemas } from "@/lib/schema-diff";
import type { FieldChange, JsonSchema } from "@/lib/schema-diff";

const STORAGE_KEY = "reqly:rest-snapshots";

type SnapshotMap = Record<string, JsonSchema>;

function loadSnapshots(): SnapshotMap {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SnapshotMap) : {};
  } catch {
    return {};
  }
}

function saveSnapshots(map: SnapshotMap): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

/**
 * Persist a JSON-schema snapshot of `response` under `name`.
 * The schema is inferred once and stored as a name→schema map in localStorage.
 */
export function saveRestSnapshot(name: string, response: unknown): void {
  const map = loadSnapshots();
  map[name] = inferJsonSchema(response);
  saveSnapshots(map);
}

/**
 * Compare the current `response` against the stored snapshot named `name`.
 * Returns the schema diff (empty when identical or when the name is unknown).
 */
export function compareRestSnapshot(name: string, response: unknown): FieldChange[] {
  const stored = getRestSnapshot(name);
  if (!stored) return [];
  return diffSchemas(stored, inferJsonSchema(response));
}

/** List saved snapshot names (sorted for stable UI ordering). */
export function listRestSnapshots(): string[] {
  return Object.keys(loadSnapshots()).sort();
}

/** Read a stored snapshot schema by name. */
export function getRestSnapshot(name: string): JsonSchema | undefined {
  return loadSnapshots()[name];
}
