import { getValueByPath } from "@/lib/variable-path"
import type { Assertion, AssertionResult, RequestResponse } from "./types"

export function evaluateAssertions(
  assertions: Assertion[],
  response: RequestResponse
): AssertionResult[] {
  return assertions.map((assertion) => evaluateOne(assertion, response))
}

function evaluateOne(assertion: Assertion, response: RequestResponse): AssertionResult {
  try {
    switch (assertion.type) {
      case "status":
        return evaluateStatus(assertion.expected, response.statusCode)
      case "responseTime":
        return evaluateResponseTime(assertion.operator, assertion.valueMs, response.responseTimeMs)
      case "jsonPath":
        return evaluateJsonPath(assertion, response.body)
      case "schema":
        return evaluateSchema(assertion.schema, response.body)
      default:
        return { assertion, passed: false, actualValue: null, error: "Unknown assertion type" }
    }
  } catch (err) {
    return {
      assertion,
      passed: false,
      actualValue: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

function evaluateStatus(expected: number | { in: number[] } | { not: number }, actual: number): AssertionResult {
  let passed = false
  if (typeof expected === "number") passed = actual === expected
  else if ("in" in expected) passed = expected.in.includes(actual)
  else if ("not" in expected) passed = actual !== expected.not
  return { assertion: { type: "status", expected }, passed, actualValue: actual }
}

function evaluateResponseTime(op: "<" | "<=" | ">" | ">=", valueMs: number, actualMs: number): AssertionResult {
  const passed =
    op === "<" ? actualMs < valueMs :
    op === "<=" ? actualMs <= valueMs :
    op === ">" ? actualMs > valueMs :
    actualMs >= valueMs
  return { assertion: { type: "responseTime", operator: op, valueMs }, passed, actualValue: actualMs }
}

function evaluateJsonPath(
  a: Extract<Assertion, { type: "jsonPath" }>,
  body: unknown
): AssertionResult {
  const normalizedPath = a.path.replace(/^\$\.?/, "")
  const extracted = getValueByPath(body, normalizedPath)
  if (!extracted.success) {
    return { assertion: a, passed: a.operator === "notExists", actualValue: null, error: extracted.error }
  }
  const actual = extracted.value
  let passed = false
  switch (a.operator) {
    case "equals": passed = deepEqual(actual, a.value); break
    case "contains":
      passed = typeof actual === "string" && typeof a.value === "string" && actual.toLowerCase().includes(a.value.toLowerCase())
      break
    case "exists": passed = actual !== undefined && actual !== null; break
    case "notExists": passed = actual === undefined || actual === null; break
  }
  return { assertion: a, passed, actualValue: actual }
}

function evaluateSchema(schema: Record<string, unknown>, body: unknown): AssertionResult {
  let passed = true
  const errors: string[] = []

  if (schema.required && Array.isArray(schema.required) && typeof body === "object" && body !== null && !Array.isArray(body)) {
    for (const key of schema.required) {
      if (!(key in (body as Record<string, unknown>))) {
        passed = false
        errors.push(`Missing required property: ${key}`)
      }
    }
  }

  return {
    assertion: { type: "schema", schema },
    passed,
    actualValue: body,
    error: errors.length ? errors.join("; ") : undefined,
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return false
  if (typeof a === "object") return JSON.stringify(a) === JSON.stringify(b)
  return false
}
