const { parse } = require('java-parser')
const code = `import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;

@RequestMapping(path = "/api")
public class UserController {
  @RequestMapping(method = RequestMethod.POST, path = "/users")
  public String createUser() { return "x"; }
}`
const ast = parse(code)
function find(node, path=[]) {
  if (!node || typeof node !== 'object') return
  if (node.name === 'elementValuePair' || node.name==='elementValue') {
    console.log('NODE', path.join('/'), node.name)
    console.dir(node, { depth: 8 })
  }
  if (node.name === 'StringLiteral') {
    console.log('STRING', path.join('/'), node.image)
  }
  for (const key of Object.keys(node)) {
    const v = node[key]
    if (Array.isArray(v)) v.forEach((child, idx) => find(child, [...path, `${key}[${idx}]`]))
    else if (v && typeof v === 'object') find(v, [...path, key])
  }
}
find(ast)
