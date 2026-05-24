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
      error: "Format de chemin invalide : utilisez data.items[0].token ou data.user.id.",
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
      return { success: false, error: `Chemin introuvable : ${trimmedPath}` }
    }

    return { success: true, value: result }
  } catch (err) {
    return {
      success: false,
      error: `Erreur d'extraction : ${err instanceof Error ? err.message : String(err)}`,
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
    return { value: "", error: "Le corps de réponse est binaire (Blob), extraction impossible." }
  }

  if (!sourcePath.trim()) {
    return { value: responseBody }
  }

  if (!isSourcePathSyntaxValid(sourcePath)) {
    return { value: "", error: "Format de chemin JSON invalide." }
  }

  const { parsed, isJson, isXml } = parseResponseForExtraction(responseBody)

  if (isXml) {
    return {
      value: "",
      error: "Réponse XML : les chemins JSON ne s'appliquent pas. Utilisez une réponse JSON ou laissez le chemin vide.",
    }
  }

  if (!isJson && sourcePath.trim()) {
    return {
      value: "",
      error: "Réponse non-JSON : laissez le chemin vide pour utiliser le corps brut, ou exécutez une requête qui renvoie du JSON.",
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
