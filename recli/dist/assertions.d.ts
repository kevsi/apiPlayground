import type { Assertion, AssertionResult } from "./types.js";
import type { RunResult } from "./types.js";
import { assertsPassed as assertsPassedShared } from "@reqly/shared/assertions";
export declare function evaluateAssertion(assertion: Assertion, result: RunResult, vars?: Map<string, string>): AssertionResult;
export declare function evaluateAssertions(assertions: Assertion[], result: RunResult, vars?: Map<string, string>): AssertionResult[];
export { evaluateSchemaAssertion } from "@reqly/shared/assertions";
export declare const assertsPassed: typeof assertsPassedShared;
//# sourceMappingURL=assertions.d.ts.map