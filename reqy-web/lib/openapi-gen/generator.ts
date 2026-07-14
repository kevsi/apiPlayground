/**
 * Generated SDK client using the hosted OpenAPI Generator API.
 *
 * POSTs an OpenAPI spec to https://api.openapi-generator.tech and returns
 * the generated ZIP as a Blob for download.
 */

export const OPENAPI_GEN_URL = "https://api.openapi-generator.tech/api/gen/clients";

export interface GenerateResult {
  /** The raw ZIP blob */
  blob: Blob;
  /** Suggested filename e.g. "my-api-typescript-fetch.zip" */
  filename: string;
  /** The generator name used (e.g. "typescript-fetch", "python") */
  generator: string;
}

export interface GenerateOptions {
  /** Override the OpenAPI Generator base URL (defaults to the hosted cloud API).
   *  Point this at a self-hosted instance to keep specs on your own network. */
  baseUrl?: string;
  /** Request timeout in ms (default 120000). */
  timeoutMs?: number;
  /** Options forwarded to the OpenAPI Generator (e.g. `{ supportsES6: true }`). */
  generatorOptions?: Record<string, unknown>;
}

/** Map user-facing labels to OpenAPI Generator identifiers. */
export const GENERATORS: Record<string, string> = {
  TypeScript: "typescript-fetch",
  Python: "python",
  Go: "go",
  Java: "java",
  "C#": "csharp",
  Rust: "rust",
  PHP: "php",
  Kotlin: "kotlin",
  Swift: "swift5",
  Ruby: "ruby",
  Dart: "dart",
};

export const AVAILABLE_LANGUAGES = Object.keys(GENERATORS);

/**
 * Generate an SDK from an OpenAPI spec using the OpenAPI Generator.
 *
 * The request is always proxied through the same-origin `/api/sdk-generate`
 * route, which performs both the generation call and the ZIP download
 * server-side. This avoids CORS and mixed-content failures (the generator
 * returns an `http://` download link that the browser/Webview refuses to
 * fetch directly) and keeps third-party traffic off the client.
 *
 * @param spec     The full OpenAPI spec object (v3)
 * @param language The generator name e.g. "typescript-fetch", "python"
 * @param apiName  Optional. Used in filename suggestion.
 * @returns        A GenerateResult with the ZIP blob.
 */
export async function generateSdk(
  spec: unknown,
  language: string,
  apiName = "api",
  options: GenerateOptions = {},
): Promise<GenerateResult> {
  return generateViaRoute(spec, language, apiName, options);
}

async function generateViaRoute(
  spec: unknown,
  language: string,
  apiName: string,
  options: GenerateOptions,
): Promise<GenerateResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 120000);
  let response: Response;
  try {
    response = await fetch("/api/sdk-generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spec,
        language,
        options: options.generatorOptions ?? {},
        baseUrl: options.baseUrl,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`SDK generation timed out after ${options.timeoutMs ?? 120000}ms.`, {
        cause: err,
      });
    }
    throw new Error("Could not reach the SDK generation endpoint. Is the app server running?", {
      cause: err,
    });
  }
  clearTimeout(timeout);

  if (!response.ok) {
    let detail = "";
    try {
      const data = (await response.json()) as { error?: string };
      detail = data?.error ? `: ${data.error}` : "";
    } catch {
      // ignore — fall through to the generic status message
    }
    throw new Error(`SDK generation failed (${response.status})${detail}`);
  }

  const blob = await response.blob();
  const safeName = apiName.replace(/\s+/g, "-").toLowerCase();
  return { blob, filename: `${safeName}-${language}.zip`, generator: language };
}
