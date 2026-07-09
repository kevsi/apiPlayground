// @reqly/shared — Barrel export
// Ce package contient les modules partagés entre recli, reqy-mcp, reqy-web

export type {
  HttpMethod,
  BodyType,
  AuthType,
  Header,
  QueryParam,
  EnvironmentVariable,
  Environment,
  GraphQLConfig,
  Assertion,
  AssertionResult,
} from "./types.js"

export { parseCurlCommand, generateCurlCommand } from "./curl-parser/index.js"
export type { ParsedCurl } from "./curl-parser/index.js"
