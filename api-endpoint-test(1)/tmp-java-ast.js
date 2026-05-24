const { parse } = require('java-parser')
const code = `import javax.ws.rs.GET;
@Path("/api")
public class UserResource {
  @GET
  @Path("/users")
  public String getUsers() { return "x"; }
}`
const ast = parse(code)
console.log(JSON.stringify(ast, null, 2).slice(0, 1600))
