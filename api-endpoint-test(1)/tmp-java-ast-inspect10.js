const { parse } = require('java-parser')
const code = `import javax.ws.rs.GET;
@Path("/api")
public class UserResource {
  @GET
  @Path("/users")
  public String getUsers() { return "x"; }
}`
const ast = parse(code)
function find(node, path = []) {
  if (!node || typeof node !== 'object') return
  if (node.name === 'annotation') {
    console.log(path.join('/'))
    console.dir(node, { depth: 6 })
  }
  for (const key of Object.keys(node)) {
    const v = node[key]
    if (Array.isArray(v)) v.forEach((child, idx) => find(child, [...path, `${key}[${idx}]`]))
    else if (v && typeof v === 'object') find(v, [...path, key])
  }
}
find(ast)
