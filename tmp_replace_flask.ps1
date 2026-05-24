from pathlib import Path
p = Path(r'c:\Users\rough\Documents\Workspace\apiPlayground\api-endpoint-test(1)\lib\project-analyzer.ts')
text = p.read_text(encoding='utf-8')
old = '''function detectFlask(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  const sanitized = stripLanguageCommentsAndStrings(content)
  const blueprintPrefix = new Map<string, string>()

  const REGISTER_BP_RE = /app\.register_blueprint\s*\(\s*([A-Za-z_][\w]*)\s*,\s*url_prefix\s*=\s*['\"]([^'\"]+)['\"]\s*\)/g
  for (const m of sanitized.matchAll(REGISTER_BP_RE)) {
    blueprintPrefix.set(m[1], m[2])
  }

  // @app.route or @blueprint.route
  const ROUTE_RE = /@(?:[A-Za-z_][\w.]*)\.(route|add_url_rule)\s*\(\s*['\"]([^'\"\s][^'\"]*)['\"]([\s\S]{0,300}?)(?=\n(?:def|class|\s*$))/g
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

// -- Django'''
new = '''function detectFlask(content: string): DetectedRoute[] {
  const routes: DetectedRoute[] = []
  const sanitized = stripLanguageCommentsAndStrings(content)
  const blueprintPrefix = new Map<string, string>()
  const methodViewMethods = new Map<string, string[]>()

  const REGISTER_BP_RE = /app\.register_blueprint\s*\(\s*([A-Za-z_][\w]*)\s*,\s*url_prefix\s*=\s*['\"]([^'\"]+)['\"]\s*\)/g
  for (const m of sanitized.matchAll(REGISTER_BP_RE)) {
    blueprintPrefix.set(m[1], m[2])
  }

  const BLUEPRINT_DEF_RE = /([A-Za-z_][\w]*)\s*=\s*Blueprint\s*\(\s*['\"][^'\"\s]+['\"]\s*,\s*url_prefix\s*=\s*['\"]([^'\"]+)['\"]/g
  for (const m of sanitized.matchAll(BLUEPRINT_DEF_RE)) {
    blueprintPrefix.set(m[1], m[2])
  }

  const METHOD_VIEW_CLASS_RE = /class\s+([A-Za-z_][\w]*)\s*\(\s*MethodView\s*\)[\s\S]*?(?=\nclass\s|\n\n|$)/g
  for (const m of sanitized.matchAll(METHOD_VIEW_CLASS_RE)) {
    const className = m[1]
    const body = m[0]
    const methods = Array.from(body.matchAll(/def\s+(get|post|put|delete|patch)\s*\(/g)).map((x) => x[1].toUpperCase())
    if (methods.length) methodViewMethods.set(className, methods)
  }

  const ROUTE_DECORATOR_RE = /@([A-Za-z_][\w.]*)\.(route|get|post|put|delete|patch)\s*\(\s*(['\"])([^'\"]+)\3([\s\S]*?)(?=\n\s*@|\n\s*(?:def|class|$))/g
  for (const m of sanitized.matchAll(ROUTE_DECORATOR_RE)) {
    const target = m[1]
    const methodName = m[2]
    let routePath = m[4]
    const args = m[5] || ""
    const methods = methodName === "route"
      ? parseMethodList(args).filter((m) => m !== "") || ["GET"]
      : [methodName.toUpperCase()]

    const prefix = blueprintPrefix.get(target.split(".")[0])
    if (prefix && routePath.startsWith("/")) {
      routePath = normalizePath(`${prefix}${routePath}`)
    }

    const decoratorBlock = sanitized.slice(Math.max(0, (m.index ?? 0) - 200), (m.index ?? 0))
    const hasAuth = /@login_required|@jwt_required|@token_required|@requires_auth|@fresh_jwt_required|@permission_required\(/.test(decoratorBlock + m[0])

    for (const method of methods) {
      const r = makeRoute(method, routePath, "")
      if (hasAuth) {
        r.authRequired = true
        r.authType = "middleware"
        r.reasonings?.push("Décorateur d'auth Flask détecté (@login_required, @jwt_required, etc.)")
      }
      detectAuthByStatusSignal(content, r)
      routes.push(r)
    }
  }

  const ADD_URL_RULE_RE = /([A-Za-z_][\w]*)\.add_url_rule\s*\(\s*(['\"])([^'\"]+)\2([\s\S]*?)(?=\))/g
  for (const m of sanitized.matchAll(ADD_URL_RULE_RE)) {
    const routePath = m[3]
    const args = m[4] || ""
    const methods = parseMethodList(args)
    const routeMethods = methods.length ? methods : ["GET"]

    for (const method of routeMethods) {
      const r = makeRoute(method, routePath, "")
      if (/@login_required|@jwt_required|@token_required|@requires_auth|@fresh_jwt_required|@permission_required\(/.test(args)) {
        r.authRequired = true
        r.authType = "middleware"
        r.reasonings?.push("Auth Flask détecté via add_url_rule")
      }
      detectAuthByStatusSignal(content, r)
      routes.push(r)
    }
  }

  const ADD_RESOURCE_RE = /([A-Za-z_][\w]*)\.add_resource\s*\(\s*([A-Za-z_][\w]*)\s*,\s*([^)]+)\)/g
  for (const m of sanitized.matchAll(ADD_RESOURCE_RE)) {
    const routePaths = Array.from(m[3].matchAll(/['\"]([^'\"]+)['\"]/g)).map((x) => x[1])
    for (const path of routePaths) {
      for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
        const r = makeRoute(method, path, "")
        detectAuthByStatusSignal(content, r)
        routes.push(r)
      }
    }
  }

  const METHOD_VIEW_AS_VIEW_RE = /(?:[A-Za-z_][\w]*)\.add_url_rule\s*\(\s*(['\"])([^'\"]+)\1[^\)]*view_func\s*=\s*([A-Za-z_][\w]*)\.as_view\s*\(/g
  for (const m of sanitized.matchAll(METHOD_VIEW_AS_VIEW_RE)) {
    const routePath = m[2]
    const className = m[3]
    const methods = methodViewMethods.get(className) || ["GET"]
    for (const method of methods) {
      const r = makeRoute(method, routePath, "")
      detectAuthByStatusSignal(content, r)
      routes.push(r)
    }
  }

  if (routes.length === 0) {
    const SIMPLE = /@app\.route\s*\(\s*['\"]([^'\"\s][^'\"]*)['\"]\)/g
    for (const m of content.matchAll(SIMPLE)) {
      const r = makeRoute("GET", m[1], "")
      detectAuthByStatusSignal(content, r)
      routes.push(r)
    }
  }

  return routes
}

// -- Django'''
if old not in text:
    raise SystemExit('old block not found')
text = text.replace(old, new)
p.write_text(text, encoding='utf-8')
print('Flask detector replaced')
