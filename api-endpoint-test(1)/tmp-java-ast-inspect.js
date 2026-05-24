const { parse } = require('java-parser')
const code = `import javax.ws.rs.GET;
@Path("/api")
public class UserResource {
  @GET
  @Path("/users")
  public String getUsers() { return "x"; }
}`
const ast = parse(code)
const nodes = []
function walk(node, path=[]) {
  if (!node || typeof node !== 'object') return
  if (node.name) nodes.push([...path, node.name].join('/'))
  for (const key of Object.keys(node)) {
    const value = node[key]
    if (Array.isArray(value)) {
      value.forEach((child, i) => walk(child, [...path, `${key}[${i}]`]))
    } else if (typeof value === 'object' && value !== null) {
      walk(value, [...path, key])
    }
  }
}
walk(ast)
console.log(nodes.filter((n) => /Annotation|annotation|Path|GET|Controller|Method/.test(n)).slice(0,200).join('\n'))
console.log('---\nTotal nodes', nodes.length)
