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

/**
 * Saves a Blob to disk using Tauri's native "Save As" dialog.
 *
 * The browser's `showSaveFilePicker` / `<a download>` don't work inside a
 * Tauri Webview, so we show a native dialog (`plugin-dialog`) and write the
 * bytes via the `save_file` Rust command (which can write anywhere the user
 * picks, without the fs plugin's scope limits).
 *
 * @returns `"saved"` on success, `"cancelled"` if the user dismissed the dialog.
 * @throws  on any write/invocation error.
 */
export async function saveBlobToDisk(filename: string, blob: Blob): Promise<"saved" | "cancelled"> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { invoke } = await import("@tauri-apps/api/core");

  const target = await save({
    defaultPath: filename,
    filters: [{ name: "ZIP archive", extensions: ["zip"] }],
  });
  if (!target) return "cancelled";

  const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
  await invoke("save_file", { path: target, contents: bytes });
  return "saved";
}
