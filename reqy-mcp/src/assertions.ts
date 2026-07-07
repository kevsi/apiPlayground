import { getValueByPath, parseResponseForExtraction } from "./variable-path.js"
import type { Assertion, AssertionResult, RunResult } from "./types.js"

export interface AssertionContext {
  status: number
  durationMs: number
  headers: Record<string, string>
  body?: string
}

export function evaluateAssertions(assertions: Assertion[], context: AssertionContext): AssertionResult[] {
  return assertions
    .filter((a) => a.enabled !== false)
    .map((assertion) => evaluateOne(assertion, context))
}

function evaluateOne(assertion: Assertion, context: AssertionContext): AssertionResult {
  try {
    switch (assertion.type) {
      case "status-code":
        return evaluateStatusCode(assertion, context.status)
      case "response-time":
        return evaluateResponseTime(assertion, context.durationMs)
      case "json-path":
        return evaluateJsonPath(assertion, context.body)
      case "header":
        return evaluateHeader(assertion, context.headers)
      case "body-contains":
        return evaluateBodyContains(assertion, context.body)
      default:
        return { assertion, passed: false, actualValue: null, error: `Unknown assertion type: ${(assertion as Assertion).type}` }
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

function evaluateStatusCode(assertion: Assertion, actual: number): AssertionResult {
  const expected = Number(assertion.value ?? assertion.target)
  if (Number.isNaN(expected)) {
    return { assertion, passed: false, actualValue: actual, error: `Invalid expected status: ${assertion.value ?? assertion.target}` }
  }
  const op = assertion.operator ?? "eq"
  const passed = compare(actual, expected, op)
  return { assertion, passed, actualValue: actual }
}

function evaluateResponseTime(assertion: Assertion, actualMs: number): AssertionResult {
  const expectedMs = Number(assertion.value ?? assertion.target)
  if (Number.isNaN(expectedMs)) {
    return { assertion, passed: false, actualValue: actualMs, error: `Invalid expected response time: ${assertion.value ?? assertion.target}` }
  }
  const op = assertion.operator ?? "lt"
  const passed = compare(actualMs, expectedMs, op)
  return { assertion, passed, actualValue: actualMs }
}

function evaluateJsonPath(assertion: Assertion, body?: string): AssertionResult {
  if (!body) {
    return { assertion, passed: false, actualValue: null, error: "No response body" }
  }
  const { parsed, isJson } = parseResponseForExtraction(body)
  if (!isJson) {
    return { assertion, passed: false, actualValue: null, error: "Response body is not JSON" }
  }
  const path = assertion.target
  const extraction = getValueByPath(parsed, path)
  const op = assertion.operator ?? "exists"

  if (!extraction.success) {
    return { assertion, passed: op === "notExists", actualValue: null, error: extraction.error }
  }

  const actual = extraction.value
  let passed = false
  switch (op) {
    case "eq":
      passed = deepEqual(actual, parseExpectedValue(assertion.value))
      break
    case "neq":
      passed = !deepEqual(actual, parseExpectedValue(assertion.value))
      break
    case "contains":
      passed = typeof actual === "string" && typeof assertion.value === "string" && actual.includes(assertion.value)
      break
    case "exists":
      passed = actual !== undefined && actual !== null
      break
    case "notExists":
      passed = actual === undefined || actual === null
      break
    case "gt":
    case "gte":
    case "lt":
    case "lte":
      passed = compare(Number(actual), Number(assertion.value), op)
      break
    case "regex":
      passed = typeof actual === "string" && typeof assertion.value === "string" && new RegExp(assertion.value).test(actual)
      break
    default:
      return { assertion, passed: false, actualValue: actual, error: `Unsupported operator: ${op}` }
  }
  return { assertion, passed, actualValue: actual }
}

function evaluateHeader(assertion: Assertion, headers: Record<string, string>): AssertionResult {
  const headerName = assertion.target
  const actual = Object.entries(headers).find(([k]) => k.toLowerCase() === headerName.toLowerCase())?.[1]
  const op = assertion.operator ?? "exists"

  if (actual === undefined) {
    return { assertion, passed: op === "notExists", actualValue: null, error: `Header not found: ${headerName}` }
  }

  let passed = false
  switch (op) {
    case "exists":
      passed = true
      break
    case "notExists":
      passed = false
      break
    case "eq":
      passed = actual === assertion.value
      break
    case "neq":
      passed = actual !== assertion.value
      break
    case "contains":
      passed = typeof assertion.value === "string" && actual.toLowerCase().includes(assertion.value.toLowerCase())
      break
    case "regex":
      passed = typeof assertion.value === "string" && new RegExp(assertion.value).test(actual)
      break
    default:
      return { assertion, passed: false, actualValue: actual, error: `Unsupported operator: ${op}` }
  }
  return { assertion, passed, actualValue: actual }
}

function evaluateBodyContains(assertion: Assertion, body?: string): AssertionResult {
  if (!body) {
    return { assertion, passed: false, actualValue: null, error: "No response body" }
  }
  const search = assertion.target
  const passed = body.toLowerCase().includes(search.toLowerCase())
  return { assertion, passed, actualValue: body.slice(0, 200) }
}

function compare(actual: number, expected: number, operator: string): boolean {
  switch (operator) {
    case "eq": return actual === expected
    case "neq": return actual !== expected
    case "gt": return actual > expected
    case "gte": return actual >= expected
    case "lt": return actual < expected
    case "lte": return actual <= expected
    default: return false
  }
}

function parseExpectedValue(value?: string): unknown {
  if (value === undefined) return undefined
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return false
  if (typeof a === "object") return JSON.stringify(a) === JSON.stringify(b)
  return false
}

export function runResultToAssertionContext(result: RunResult): AssertionContext {
  return {
    status: result.status,
    durationMs: result.durationMs,
    headers: {},
    body: result.body,
  }
}
