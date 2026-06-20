export type PathExtractionResult = {
  success: boolean
  value?: unknown
  error?: string
}

const JSON_PATH_PATTERN = /^[\w.\[\]-]+$/

export function isSourcePathSyntaxValid(path: string): boolean {
  return typeof path === "string" && (path.trim() === "" || JSON_PATH_PATTERN.test(path.trim()))
}

export function getValueByPath(value: unknown, path: string): PathExtractionResult {
  if (!path || typeof path !== "string" || !path.trim()) {
    return { success: true, value }
  }

  const trimmedPath = path.trim()

  if (!isSourcePathSyntaxValid(trimmedPath)) {
    return {
      success: false,
      error: "Invalid path format: use data.items[0].token or data.user.id.",
    }
  }

  try {
    const result = trimmedPath.split(".").reduce<unknown | undefined>((current, segment) => {
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

export function looksLikeXml(text: string): boolean {
  const trimmed = text.trimStart()
  return trimmed.startsWith("<?xml") || trimmed.startsWith("<")
}

export function parseResponseForExtraction(responseBody: string): {
  parsed: unknown
  isJson: boolean
  isXml: boolean
} {
  const trimmed = responseBody.trim()
  if (!trimmed) {
    return { parsed: "", isJson: false, isXml: false }
  }

  if (looksLikeXml(trimmed)) {
    return { parsed: responseBody, isJson: false, isXml: true }
  }

  try {
    return { parsed: JSON.parse(responseBody), isJson: true, isXml: false }
  } catch {
    return { parsed: responseBody, isJson: false, isXml: false }
  }
}

export function extractValueFromResponse(
  responseBody: string | Blob,
  sourcePath: string,
): { value: string; error?: string } {
  if (responseBody instanceof Blob) {
    return { value: "", error: "Response body is binary (Blob), extraction not possible." }
  }

  if (!sourcePath.trim()) {
    return { value: responseBody }
  }

  if (!isSourcePathSyntaxValid(sourcePath)) {
    return { value: "", error: "Invalid JSON path format." }
  }

  const { parsed, isJson, isXml } = parseResponseForExtraction(responseBody)

  if (isXml) {
    return {
      value: "",
      error: "XML response: JSON paths do not apply. Use a JSON response or leave the path empty.",
    }
  }

  if (!isJson && sourcePath.trim()) {
    return {
      value: "",
      error: "Non-JSON response: leave the path empty to use the raw body, or run a request that returns JSON.",
    }
  }

  const extraction = getValueByPath(parsed, sourcePath)
  if (!extraction.success) {
    return { value: "", error: extraction.error }
  }

  return { value: formatVariableValue(extraction.value) }
}

export function formatVariableValue(value: unknown): string {
  if (value === undefined || value === null) return ""
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
