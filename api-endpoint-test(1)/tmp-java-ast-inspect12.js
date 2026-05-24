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
  if (node.name === 'annotation') {
    console.log('ANNOTATION', path.join('/'))
    console.log(JSON.stringify(node, null, 2))
  }
  for (const key of Object.keys(node)) {
    const v = node[key]
    if (Array.isArray(v)) v.forEach((child, idx) => find(child, [...path, `${key}[${idx}]`]))
    else if (v && typeof v === 'object') find(v, [...path, key])
  }
}
find(ast)
