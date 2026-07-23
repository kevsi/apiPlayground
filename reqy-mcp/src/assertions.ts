// Re-export shim — implementation moved to @reqly/shared/assertions
//
// Existing reqy-mcp callers expect:
//   - evaluateAssertions(assertions, context)   (structured format)
//   - runResultToAssertionContext(result)        (adapter)
//
// The unified API in @reqly/shared preserves these signatures by delegating
// to evaluateStructuredAssertions internally.

import { evaluateStructuredAssertions, runResultToContext } from "@reqly/shared/assertions";
import type { Assertion, AssertionResult } from "./types.js";
import type { RunResult } from "./types.js";

export interface AssertionContext {
  status: number;
  durationMs: number;
  headers: Record<string, string>;
  body?: string;
}

/**
 * Evaluate a list of structured assertions. Disabled assertions
 * (enabled === false) are filtered out.
 */
export function evaluateAssertions(
  assertions: Assertion[],
  context: AssertionContext,
): AssertionResult[] {
  return evaluateStructuredAssertions(
    assertions as Parameters<typeof evaluateStructuredAssertions>[0],
    context,
  ) as AssertionResult[];
}

/**
 * Convert a RunResult into an AssertionContext for assertion evaluation.
 * Reqy-mcp RunResult does not carry response headers; they are left empty.
 */
export function runResultToAssertionContext(result: RunResult): AssertionContext {
  return {
    status: result.status,
    durationMs: result.durationMs,
    headers: {},
    body: result.body,
  };
}
