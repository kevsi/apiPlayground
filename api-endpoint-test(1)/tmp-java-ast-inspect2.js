const { parse } = require('java-parser')
const code = `import javax.ws.rs.GET;
@Path("/api")
public class UserResource {
  @GET
  @Path("/users")
  public String getUsers() { return "x"; }
}`
const ast = parse(code)
function walk(node, path = []) {
  if (!node || typeof node !== 'object') return
  if (node.name === 'annotation') {
    console.log('--- annotation at', path.join('/'))
    console.log(JSON.stringify(node, null, 2))
  }
  for (const key of Object.keys(node)) {
    const v = node[key]
    if (Array.isArray(v)) v.forEach((child, idx) => walk(child, [...path, `${key}[${idx}]`]))
    else if (v && typeof v === 'object') walk(v, [...path, key])
  }
}
walk(ast)
