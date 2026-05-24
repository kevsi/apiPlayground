from pathlib import Path
path = Path('lib/project-analyzer.ts')
text = path.read_text(encoding='utf-8')

old = '''function detectFlask(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  // @app.route or @blueprint.route
  const ROUTE_RE = /@(?:[A-Za-z_][\w.]*)\.(route|add_url_rule)\s*\(\s*['\"]([^'\"\s][^'\"]*)['\"]([\s\S]{0,300}?)(?=\n(?:def|class|\s*$))/g
  for (const m of content.matchAll(ROUTE_RE)) {
    const routePath = m[2]
    const args = m[3] || ""
    const methodsMatch = args.match(/methods\s*=\s*\[([^\]]+)\]/)
    const methods = methodsMatch
      ? methodsMatch[1].split(/[,\s]+/).map((x) => x.replace(/['\"]/g, "").toUpperCase()).filter(Boolean)
      : ["GET"]

    for (const method of methods) {
      const r = makeRoute(method, routePath, "")
      // @login_required decorator detection
      if (/@login_required|@jwt_required|@token_required|@requires_auth/.test(m[0])) {
        r.authRequired = true
        r.authType = "middleware"
        r.reasonings?.push("Décorateur d'auth Flask détecté (@login_required, @jwt_required, etc.)")
      }
      routes.push(r)
    }
  }

  // Fallback simple
  if (routes.length === 0) {
    const SIMPLE = /@app\.route\s*\(\s*['\"]([^'\"\s][^'\"]*)['\"]\)/g
    for (const m of content.matchAll(SIMPLE)) {
      routes.push(makeRoute("GET", m[1], ""))
    }
  }

  return routes
}
'''
new = '''function detectFlask(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  const sanitized = stripLanguageCommentsAndStrings(content)
  const blueprintPrefix = new Map<string, string>()

  const REGISTER_BP_RE = /app\.register_blueprint\s*\(\s*([A-Za-z_][\w]*)\s*,\s*url_prefix\s*=\s*['\"]([^'\"]+)['\"]\s*\)/g
  for (const m of sanitized.matchAll(REGISTER_BP_RE)) {
    blueprintPrefix.set(m[1], m[2])
  }

  const ROUTE_RE = /@([A-Za-z_][\w.]*)\.(route|get|post|put|delete|patch)\s*\(\s*(['\"])([^'\"\s][^'\"]*)\3([\s\S]*?)(?=\n\s*@|\n\s*def\s|$)/g
  for (const m of sanitized.matchAll(ROUTE_RE)) {
    const decoratorTarget = m[1]
    const methodName = m[2]
    let routePath = m[4]
    const args = m[5] || ""
    const methods = methodName === "route"
      ? (args.match(/methods\s*=\s*\[([^\]]+)\]/)?.[1]?.split(/[\s,]+/).map((x) => x.replace(/['\"]/g, "").toUpperCase()).filter(Boolean) || ["GET"])
      : [methodName.toUpperCase()]

    const prefix = blueprintPrefix.get(decoratorTarget.split(".")[0])
    if (prefix && routePath.startsWith("/")) {
      routePath = normalizePath(`${prefix}${routePath}`)
    }

    const head = sanitized.slice(Math.max(0, (m.index ?? 0) - 200), (m.index ?? 0))
    const hasAuth = /@login_required|@jwt_required|@token_required|@requires_auth|@permission_required|@fresh_jwt_required|@permission_required\(/.test(head)

    for (const method of methods) {
      const r = makeRoute(method, routePath, "")
      if (hasAuth) {
        r.authRequired = true
        r.authType = "middleware"
        r.reasonings?.push("Décorateur d'auth Flask détecté (@login_required, @jwt_required, etc.)")
      }
      routes.push(r)
    }
  }

  const ADD_URL_RULE_RE = /([A-Za-z_][\w]*)\.add_url_rule\s*\(\s*(['\"])([^'\"\s][^'\"]*)\2([\s\S]*?)\)/g
  for (const m of sanitized.matchAll(ADD_URL_RULE_RE)) {
    const routePath = m[3]
    const args = m[4] || ""
    const methods = args.match(/methods\s*=\s*\[([^\]]+)\]/)
      ? args.match(/methods\s*=\s*\[([^\]]+)\]/)![1].split(/[\s,]+/).map((x) => x.replace(/['\"]/g, "").toUpperCase()).filter(Boolean)
      : ["GET"]
    for (const method of methods) {
      routes.push(makeRoute(method, routePath, ""))
    }
  }

  const ADD_RESOURCE_RE = /([A-Za-z_][\w]*)\.add_resource\s*\(\s*([A-Za-z_][\w]*)\s*,\s*(['\"])([^'\"\s][^'\"]*)\3/g
  for (const m of sanitized.matchAll(ADD_RESOURCE_RE)) {
    const routePath = m[4]
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      const r = makeRoute(method, routePath, "")
      r.reasonings?.push("Flask-RESTful api.add_resource détecté")
      routes.push(r)
    }
  }

  const seen = new Set<string>()
  return routes.filter((r) => {
    const key = `${r.method}|${normalizePath(r.path)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
'''
if old not in text:
    raise SystemExit('Old Flask block not found')
text = text.replace(old, new)
path.write_text(text, encoding='utf-8')
print('patched flask')
