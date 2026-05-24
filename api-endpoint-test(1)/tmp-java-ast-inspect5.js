const { parse } = require('java-parser')
const code = `import javax.ws.rs.GET;\n@Path("/api")\npublic class UserResource {\n  @GET\n  @Path("/users")\n  public String getUsers() { return "x"; }\n}`
const ast = parse(code)
function getKeys(obj) {
  if (!obj || typeof obj !== 'object') return []
  if (Array.isArray(obj)) return obj.map((v, i) => `${i}:${v && v.name ? v.name : typeof v}`)
  return Object.keys(obj)
}
function walk(node, path=[]) {
  if (!node || typeof node !== 'object') return
  if (node.name === 'annotation') {
    console.log('ANNOTATION', path.join('/'))
    console.log('children keys', Object.keys(node.children || {}))
    for (const [k,v] of Object.entries(node.children || {})) {
      console.log('  child', k, Array.isArray(v) ? v.length : typeof v)
      if (Array.isArray(v) && v[0] && typeof v[0] === 'object') {
        console.log('   first type', v[0].name || Object.keys(v[0]))
      }
    }
  }
  for (const key of Object.keys(node)) {
    const value = node[key]
    if (Array.isArray(value)) value.forEach((child, idx) => walk(child, [...path, `${key}[${idx}]`]))
    else if (value && typeof value === 'object') walk(value, [...path, key])
  }
}
walk(ast)
