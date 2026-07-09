import type { Assertion, AssertionResult, RunResult } from "./types.js";
export declare function evaluateAssertion(assertion: Assertion, result: RunResult, vars?: Map<string, string>): AssertionResult;
export declare function evaluateAssertions(assertions: Assertion[], result: RunResult, vars?: Map<string, string>): AssertionResult[];
export declare function assertsPassed(assertions: AssertionResult[]): boolean;
export declare function evaluateSchemaAssertion(rawSchema: Record<string, unknown>, body: string | undefined): AssertionResult;
//# sourceMappingURL=assertions.d.ts.map