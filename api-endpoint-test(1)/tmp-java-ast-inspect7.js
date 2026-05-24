const { parse } = require('java-parser')
const code = `import javax.ws.rs.GET;\n@Path("/api")\npublic class UserResource {\n  @GET\n  @Path("/users")\n  public String getUsers() { return "x"; }\n}`
const ast = parse(code)
function find(node, path=[]) {
  if (!node || typeof node !== 'object') return
  if (node.name === 'annotation') {
    const id = node.children?.typeName?.[0]?.children?.Identifier?.[0]?.tokenType?.image
    const value = node.children?.elementValue?.[0]?.children?.conditionalExpression?.[0]?.children?.binaryExpression?.[0]?.children?.unaryExpression?.[0]?.children?.primary?.[0]?.children?.primaryPrefix?.[0]?.children?.literal?.[0]?.children?.StringLiteral?.[0]?.tokenType?.image
    console.log('ANNOTATION', path.join('/'))
    console.log('  id=', id)
    console.log('  value=', value)
  }
  for (const key of Object.keys(node)) {
    const v = node[key]
    if (Array.isArray(v)) v.forEach((child, idx) => find(child, [...path, `${key}[${idx}]`]))
    else if (v && typeof v === 'object') find(v, [...path, key])
  }
}
find(ast)
