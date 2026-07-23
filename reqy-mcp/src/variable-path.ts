/**
 * Shared variable-path utilities.
 * Core functions re‑exported from @reqly/shared.
 * Response‑parsing helpers kept locally since they are MCP‑specific.
 */
export {
  resolveJsonPath,
  getValueByPath,
  tryParseJson,
  isSourcePathSyntaxValid,
  type PathExtractionResult,
} from "@reqly/shared/variable-path";

/**
 * Parse a response body for value extraction. Returns the parsed value
 * alongside a flag indicating whether the original looked like JSON.
 */
export function parseResponseForExtraction(responseBody: string): {
  parsed: unknown;
  isJson: boolean;
} {
  const trimmed = responseBody.trim();
  if (!trimmed) {
    return { parsed: "", isJson: false };
  }

  try {
    return { parsed: JSON.parse(responseBody), isJson: true };
  } catch {
    return { parsed: responseBody, isJson: false };
  }
}
