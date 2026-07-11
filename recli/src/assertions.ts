// Re-export shim — implementation moved to @reqly/shared/assertions
//
// Existing recli callers expect:
//   - evaluateAssertion(assertion, result, vars?)  (text-format)
//   - evaluateAssertions(assertions, result, vars?) (text-format, batch)
//   - evaluateSchemaAssertion(schema, body)        (JSON Schema)
//   - assertsPassed(results)
//
// The unified API in @reqly/shared preserves those signatures by adapting
// RunResult → UnifiedEvalContext internally.

import type { Assertion, AssertionResult } from "./types.js";
import type { RunResult } from "./types.js";
import {
  evaluateTextAssertion,
  evaluateTextAssertions,
  evaluateSchemaAssertion as evaluateSchemaAssertionShared,
  assertsPassed as assertsPassedShared,
  runResultToContext,
} from "@reqly/shared/assertions";

export function evaluateAssertion(
  assertion: Assertion,
  result: RunResult,
  vars?: Map<string, string>,
): AssertionResult {
  return evaluateTextAssertion(assertion, runResultToContext(result), { vars });
}

export function evaluateAssertions(
  assertions: Assertion[],
  result: RunResult,
  vars?: Map<string, string>,
): AssertionResult[] {
  return evaluateTextAssertions(assertions, runResultToContext(result), { vars });
}

export { evaluateSchemaAssertion } from "@reqly/shared/assertions";
export const assertsPassed = assertsPassedShared;
