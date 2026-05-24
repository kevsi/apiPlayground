const { parse } = require('java-parser')
const code = `import javax.ws.rs.GET;\n@Path("/api")\npublic class UserResource {\n  @GET\n  @Path("/users")\n  public String getUsers() { return "x"; }\n}`
const ast = parse(code)
function walk(node, path=[]) {
  if (!node || typeof node !== 'object') return
  if (node.name === 'annotation') {
    console.log('\nANNOTATION', path.join('/'))
    console.log('typeName', JSON.stringify(node.children.typeName?.[0], null, 2))
    if (node.children.elementValue) console.log('elementValue', JSON.stringify(node.children.elementValue[0], null, 2))
  }
  for (const key of Object.keys(node)) {
    const v = node[key]
    if (Array.isArray(v)) v.forEach((child, idx) => walk(child, [...path, `${key}[${idx}]`]))
    else if (v && typeof v === 'object') walk(v, [...path, key])
  }
}
walk(ast)
