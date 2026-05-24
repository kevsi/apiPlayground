const { parse } = require('java-parser')
const code = `import javax.ws.rs.GET;
@Path("/api")
public class UserResource {
  @GET
  @Path("/users")
  public String getUsers() { return "x"; }
}`
const ast = parse(code)
function walk(node, path=[]) {
  if (!node || typeof node !== 'object') return
  if (node.name === 'annotation') {
    console.log('ANNOTATION', path.join('/'))
    const typeName = node.children?.typeName?.[0]
    const stringValue = node.children?.elementValue?.[0]
    console.log('typeName', JSON.stringify(typeName, null, 2))
    console.log('elementValue', JSON.stringify(stringValue, null, 2))
  }
  for (const key of Object.keys(node)) {
    const value = node[key]
    if (Array.isArray(value)) value.forEach((child, i) => walk(child, [...path, `${key}[${i}]`]))
    else if (typeof value === 'object' && value !== null) walk(value, [...path, key])
  }
}
walk(ast)
