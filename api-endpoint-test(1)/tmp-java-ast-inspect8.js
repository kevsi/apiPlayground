const { parse } = require('java-parser')
const { inspect } = require('util')
const code = `import javax.ws.rs.GET;\n@Path("/api")\npublic class UserResource {\n  @GET\n  @Path("/users")\n  public String getUsers() { return "x"; }\n}`
const ast = parse(code)
function find(node, path=[]) {
  if (!node || typeof node !== 'object') return
  if (node.name === 'annotation') {
    console.log('\nANNOTATION', path.join('/'))
    console.log('typeName=', inspect(node.children?.typeName?.[0], { depth: 6, maxArrayLength: 20 }))
    console.log('elementValue=', inspect(node.children?.elementValue?.[0], { depth: 6, maxArrayLength: 20 }))
  }
  for (const key of Object.keys(node)) {
    const v = node[key]
    if (Array.isArray(v)) v.forEach((child, idx) => find(child, [...path, `${key}[${idx}]`]))
    else if (v && typeof v === 'object') find(v, [...path, key])
  }
}
find(ast)
