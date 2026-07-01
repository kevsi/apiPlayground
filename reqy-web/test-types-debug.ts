import { execSync } from "node:child_process"

const INTROSPECTION = `query IntrospectionQuery {
  __schema {
    queryType { name }
    types {
      kind
      name
      fields {
        name
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
                }
              }
            }
          }
        }
      }
    }
  }
}`

const out = execSync(
  `curl -s -X POST https://countries.trevorblades.com/ -H "Content-Type: application/json" -d '${JSON.stringify({ query: INTROSPECTION }).replace(/'/g, "'\\''")}'`,
  { encoding: "utf8" }
)
const data = JSON.parse(out)
const queryType = data.data.__schema.queryType.name
const queryTypeObj = data.data.__schema.types.find((t: any) => t.name === queryType)
console.log("Query type:", queryType)
console.log("Fields and their type structure:")
for (const field of queryTypeObj.fields.slice(0, 8)) {
  console.log(`\n  ${field.name}:`)
  console.log("    " + JSON.stringify(field.type))
}
