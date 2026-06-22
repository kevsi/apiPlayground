import type { RequestTestAssertion, TestResult, AssertionType } from "@/lib/types"

function parseJsonPath(obj: unknown, path: string): unknown {
  const cleaned = path.replace(/^\$\./, "").replace(/^\$/, "")
  if (!cleaned) return obj
  const keys = cleaned.split(".")
  let current: unknown = obj
  for (const key of keys) {
    if (current == null || typeof current !== "object") {
      return undefined
    }
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

function evaluateStatusAssertion(actual: number, expected: string): boolean {
  const trimmed = expected.trim()
  // Simple numeric equality
  const num = Number(trimmed)
  if (!isNaN(num) && !/[<>=!&|]/.test(trimmed)) {
    return actual === num
  }
  // Range expressions like ">= 200 && < 300"
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function("status", `return ${trimmed}`)
    return fn(actual) === true
  } catch {
    return false
  }
}

export function runTestAssertion(
  assertion: RequestTestAssertion,
  response: {
    status: number
    body: string
    headers: Record<string, string>
  }
): TestResult {
  const { id, type, target, expected, enabled } = assertion

  if (!enabled) {
    return {
      assertionId: id,
      type,
      target,
      expected,
      passed: true,
      message: "Skipped (disabled)",
    }
  }

  switch (type) {
    case "status": {
      const passed = evaluateStatusAssertion(response.status, target)
      return {
        assertionId: id,
        type,
        target,
        expected,
        passed,
        message: passed
          ? `Status ${response.status} matches "${target}"`
          : `Expected status "${target}", got ${response.status}`,
      }
    }
    case "bodyContains": {
      const passed = response.body.includes(target)
      return {
        assertionId: id,
        type,
        target,
        expected,
        passed,
        message: passed
          ? `Body contains "${target}"`
          : `Body does not contain "${target}"`,
      }
    }
    case "headerExists": {
      const key = target.toLowerCase()
      const exists = Object.keys(response.headers).some(
        (h) => h.toLowerCase() === key
      )
      if (exists && expected !== undefined && expected !== "") {
        const actualValue =
          Object.entries(response.headers).find(
            ([h]) => h.toLowerCase() === key
          )?.[1] ?? ""
        const passed = actualValue.includes(expected)
        return {
          assertionId: id,
          type,
          target,
          expected,
          passed,
          message: passed
            ? `Header "${target}" value contains "${expected}"`
            : `Header "${target}" value "${actualValue}" does not contain "${expected}"`,
        }
      }
      return {
        assertionId: id,
        type,
        target,
        expected,
        passed: exists,
        message: exists
          ? `Header "${target}" exists`
          : `Header "${target}" does not exist`,
      }
    }
    case "jsonPath": {
      let parsedBody: unknown
      try {
        parsedBody = JSON.parse(response.body)
      } catch {
        return {
          assertionId: id,
          type,
          target,
          expected,
          passed: false,
          message: `Response body is not valid JSON`,
        }
      }
      const value = parseJsonPath(parsedBody, target)
      const exists = value !== undefined
      if (expected !== undefined && expected !== "") {
        const passed = String(value) === expected
        return {
          assertionId: id,
          type,
          target,
          expected,
          passed,
          message: passed
            ? `JSON path "${target}" equals "${expected}"`
            : `JSON path "${target}" expected "${expected}", got "${value}"`,
        }
      }
      return {
        assertionId: id,
        type,
        target,
        expected,
        passed: exists,
        message: exists
          ? `JSON path "${target}" exists`
          : `JSON path "${target}" does not exist`,
      }
    }
    default: {
      return {
        assertionId: id,
        type: type as AssertionType,
        target,
        expected,
        passed: false,
        message: `Unknown assertion type: ${type}`,
      }
    }
  }
}

export interface RunTestsResult {
  passed: number
  failed: number
  total: number
  results: TestResult[]
}

export function runAllTests(
  assertions: RequestTestAssertion[] | undefined,
  response: {
    status: number
    body: string
    headers: Record<string, string>
  }
): RunTestsResult {
  const results: TestResult[] = []
  let passed = 0
  let failed = 0

  for (const assertion of assertions ?? []) {
    const result = runTestAssertion(assertion, response)
    results.push(result)
    if (result.passed) {
      passed++
    } else {
      failed++
    }
  }

  return { passed, failed, total: results.length, results }
}
