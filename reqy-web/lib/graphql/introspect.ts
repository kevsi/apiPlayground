// Deep introspection query: GraphQL wraps non-null/list types via ofType,
// with up to 4 levels for a type like [Foo!]! — NON_NULL > LIST > NON_NULL >
// NamedType. We fetch 6 levels of ofType to be safe and avoid the "Unknown!"
// bug where the leaf OBJECT name falls off the introspection response.
//
// Each level is a separate fragment so the response stays readable.
const INTROSPECTION_QUERY = `query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types {
      kind
      name
      fields {
        name
        description
        args {
          name
          description
          type {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                  ofType {
                    kind
                    name
                    ofType {
                      kind
                      name
                      ofType {
                        kind
                        name
                      }
                    }
                  }
                }
              }
            }
          }
        }
        type {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                  ofType {
                    kind
                    name
                    ofType {
                      kind
                      name
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}`

export const INTROSPECTION_QUERY_STRING = INTROSPECTION_QUERY

export async function introspectSchema(endpoint: string, headers?: Record<string, string>): Promise<string> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ query: INTROSPECTION_QUERY }),
  })
  const json = await res.json().catch(() => ({}))
  const data = (json && typeof json === "object" && "data" in json) ? (json as { data: unknown }).data : json
  return JSON.stringify(data ?? {})
}

export function endpointHash(endpoint: string): string {
  let hash = 0
  for (let i = 0; i < endpoint.length; i++) {
    hash = ((hash << 5) - hash + endpoint.charCodeAt(i)) | 0
  }
  return `gql-${Math.abs(hash).toString(36)}`
}
