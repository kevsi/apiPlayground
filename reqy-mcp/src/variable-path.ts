export type PathExtractionResult = {
  success: boolean
  value?: unknown
  error?: string
}

export function getValueByPath(value: unknown, path: string): PathExtractionResult {
  if (!path || typeof path !== "string" || !path.trim()) {
    return { success: true, value }
  }

  const trimmedPath = path.trim()

  try {
    const normalizedPath = trimmedPath.replace(/^\$\.?/, "")
    const result = normalizedPath.split(".").reduce<unknown | undefined>((current, segment) => {
      if (current === undefined || current === null) return undefined

      const parts = segment
        .replace(/\[(\d+)\]/g, ".$1")
        .split(".")
        .filter(Boolean)

      return parts.reduce<unknown | undefined>((acc, key) => {
        if (acc === undefined || acc === null) return undefined
        if (typeof acc !== "object") return undefined
        return (acc as Record<string, unknown>)[key]
      }, current)
    }, value)

    if (result === undefined) {
      return { success: false, error: `Path not found: ${trimmedPath}` }
    }

    return { success: true, value: result }
  } catch (err) {
    return {
      success: false,
      error: `Extraction error: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

export function parseResponseForExtraction(responseBody: string): {
  parsed: unknown
  isJson: boolean
} {
  const trimmed = responseBody.trim()
  if (!trimmed) {
    return { parsed: "", isJson: false }
  }

  try {
    return { parsed: JSON.parse(responseBody), isJson: true }
  } catch {
    return { parsed: responseBody, isJson: false }
  }
}
