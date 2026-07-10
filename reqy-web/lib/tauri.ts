/** Post-processed response returned to callers. */
export interface TauriFetchResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
  durationMs: number;
  encoding: string;
}

/**
 * Raw response shape from the Tauri IPC bridge.
 *
 * The Rust `TauriFetchResponse` struct uses `Vec<(String, String)>` for
 * headers, which serde serialises as an array of two-element arrays.
 * The conversion to `Record<string, string>` happens in `invokeTauriFetch`.
 */
interface RawTauriFetchResponse {
  status: number;
  body: string;
  headers: Array<[string, string]>;
  durationMs: number;
  encoding: string;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  }
}

export const isTauriAvailable = (): boolean => {
  if (typeof window === "undefined") return false;
  // Tauri v2 injecte __TAURI_INTERNALS__ (pas __TAURI__ par défaut)
  // On vérifie les deux pour être compatibles v1 et v2
  return !!window.__TAURI_INTERNALS__ || !!window.__TAURI__;
};

export async function invokeTauriFetch(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
): Promise<TauriFetchResponse> {
  if (!isTauriAvailable()) {
    throw new Error("Tauri is not available in this environment");
  }

  const { invoke } = await import("@tauri-apps/api/core");
  const result = await invoke<RawTauriFetchResponse>("fetch_proxy", {
    method,
    url,
    headers: Object.entries(headers),
    body,
  });

  return {
    status: result.status,
    body: result.body,
    headers: Object.fromEntries(result.headers ?? []),
    durationMs: result.durationMs,
    encoding: result.encoding ?? "utf8",
  };
}
