const { parse } = require('java-parser')
const { inspect } = require('util')
const code = `import javax.ws.rs.GET;\n@Path("/api")\npublic class UserResource {\n  @GET\n  @Path("/users")\n  public String getUsers() { return "x"; }\n}`
const ast = parse(code)
function find(node, path=[]) {
  if (!node || typeof node !== 'object') return
  if (node.name === 'binaryExpression') {
    console.log('\nBINARY', path.join('/'))
    console.log(inspect(node, { depth: 10, maxArrayLength: 50 }))
  }
  for (const key of Object.keys(node)) {
    const v = node[key]
    if (Array.isArray(v)) v.forEach((child, idx) => find(child, [...path, `${key}[${idx}]`]))
    else if (v && typeof v === 'object') find(v, [...path, key])
  }
}
find(ast)
