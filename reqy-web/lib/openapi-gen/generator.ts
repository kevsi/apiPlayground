/**
 * Generated SDK client using the hosted OpenAPI Generator API.
 *
 * POSTs an OpenAPI spec to https://api.openapi-generator.tech and returns
 * the generated ZIP as a Blob for download.
 */

const OPENAPI_GEN_URL = "https://api.openapi-generator.tech/api/gen/clients"

export interface GenerateResult {
  /** The raw ZIP blob */
  blob: Blob
  /** Suggested filename e.g. "my-api-typescript-fetch.zip" */
  filename: string
  /** The generator name used (e.g. "typescript-fetch", "python") */
  generator: string
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
}

export const AVAILABLE_LANGUAGES = Object.keys(GENERATORS)

/**
 * Generate an SDK from an OpenAPI spec using the hosted OpenAPI Generator.
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
): Promise<GenerateResult> {
  // 1. POST the spec to the hosted generator
  const response = await fetch(`${OPENAPI_GEN_URL}/${language}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      spec,
      options: {},
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "Unknown error")
    throw new Error(`OpenAPI Generator API error (${response.status}): ${text}`)
  }

  const data = (await response.json()) as { code: string; link: string }
  const { link } = data

  if (!link) {
    throw new Error("OpenAPI Generator returned no download link")
  }

  // 2. Download the generated ZIP
  const zipResponse = await fetch(link)

  if (!zipResponse.ok) {
    throw new Error(`Failed to download generated SDK: ${zipResponse.status}`)
  }

  const blob = await zipResponse.blob()
  const safeName = apiName.replace(/\s+/g, "-").toLowerCase()
  const filename = `${safeName}-${language}.zip`

  return { blob, filename, generator: language }
}
