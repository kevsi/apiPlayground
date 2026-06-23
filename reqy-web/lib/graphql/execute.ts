import type { GraphQLError, GraphQLExecuteResult, GraphQLRequest } from "./types"

export async function executeGraphQL(input: GraphQLRequest): Promise<GraphQLExecuteResult> {
  const started = Date.now()
  const res = await fetch(input.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...input.headers,
    },
    body: JSON.stringify({
      query: input.query,
      variables: input.variables ?? {},
      operationName: input.operationName,
    }),
  })
  const json = await res.json().catch(() => ({}))
  return {
    statusCode: res.status,
    responseTimeMs: Date.now() - started,
    headers: Object.fromEntries(res.headers.entries()),
    graphqlBody: json,
    data: (json && typeof json === "object" && "data" in json) ? (json as { data: unknown }).data : json,
    errors: (json && typeof json === "object" && "errors" in json) ? (json as { errors: GraphQLError[] }).errors : undefined,
  }
}
