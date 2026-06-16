/**
 * Test script pour le serveur mock de l'API Playground.
 *
 * Usage :
 *   1. Assure-toi que le serveur Next.js tourne (npm run dev -p 3001)
 *   2. Lance : node test-mock/test-routes.mjs
 *
 * Ce script va :
 *   - Lister les routes mock actives
 *   - Tester chaque route
 *   - Afficher les résultats
 *   - Proposer d'ajouter quelques routes factices si aucune n'existe
 */

const BASE = "http://localhost:3001"

async function main() {
  console.log("")
  console.log("╔══════════════════════════════════════════╗")
  console.log("║    🧪  Test du serveur Mock Server      ║")
  console.log("╚══════════════════════════════════════════╝")
  console.log("")

  // 1. Récupérer la liste des routes enregistrées
  console.log("📡  Connexion au serveur mock...")
  const configRes = await fetch(`${BASE}/api/mock/config`)
  const config = await configRes.json()
  const routes = config.routes || []

  if (routes.length === 0) {
    console.log("⚠️   Aucune route mock trouvée.")
    console.log("")
    console.log("   ➜  Option 1 : créer des routes depuis l'UI sur /mocks")
    console.log("   ➜  Option 2 : laisser le script en créer quelques-unes")
    console.log("")
    const answer = await prompt("   Créer des routes factices ? (o/N) ")
    if (answer?.toLowerCase() === "o") {
      await seedMockRoutes()
    } else {
      console.log("   OK, rien n'a été créé.")
    }
    return
  }

  console.log(`✅  ${routes.length} route(s) mock trouvée(s)\n`)
  console.log("╔═══ Test de chaque route ═══╗\n")

  for (const route of routes) {
    if (!route.enabled) {
      console.log(`⏭️   ${route.method} ${route.pathPattern}  [désactivée]`)
      continue
    }

    const url = `${BASE}/api/mock${route.pathPattern.startsWith("/") ? "" : "/"}${route.pathPattern}`
    const method = route.method

    try {
      const start = Date.now()
      const res = await fetch(url, { method })
      const body = await res.text()
      const elapsed = Date.now() - start
      const statusColor = res.ok ? "✅" : "⚠️"

      console.log(` ${statusColor}  ${method} ${route.pathPattern}`)
      console.log(`    Status : ${res.status}  (${elapsed}ms)`)
      console.log(`    Nom    : ${route.name}`)
      console.log(`    Body   : ${body.length > 100 ? body.slice(0, 100) + "…" : body}`)
      console.log("")
    } catch (err) {
      console.log(` ❌  ${method} ${route.pathPattern}`)
      console.log(`    Erreur : ${err.message}`)
      console.log("")
    }
  }

  console.log("╚══════════════════════════════╝")
  console.log("")
  console.log("💡  Tu peux aussi ouvrir ces URLs directement dans le navigateur :")
  for (const route of routes.filter((r) => r.enabled)) {
    const url = `/api/mock${route.pathPattern.startsWith("/") ? "" : "/"}${route.pathPattern}`
    console.log(`   ${BASE}${url}`)
  }
  console.log("")
}

async function seedMockRoutes() {
  console.log("\n📝  Création de routes factices...\n")

  const sampleRoutes = [
    {
      name: "Utilisateurs - liste",
      method: "GET",
      pathPattern: "/api/users",
      responseStatus: 200,
      responseBody: JSON.stringify([
        { id: 1, name: "Alice Dupont", email: "alice@example.com", role: "admin" },
        { id: 2, name: "Bob Martin", email: "bob@example.com", role: "user" },
        { id: 3, name: "Claire Petit", email: "claire@example.com", role: "user" },
      ], null, 2),
      responseHeaders: { "content-type": "application/json" },
      contentType: "application/json",
      delay: 200,  // délai simulé de 200ms
      enabled: true,
    },
    {
      name: "Utilisateur par ID",
      method: "GET",
      pathPattern: "/api/users/:id",
      responseStatus: 200,
      responseBody: JSON.stringify({
        id: 1, name: "Alice Dupont", email: "alice@example.com",
        role: "admin", created_at: "2025-01-15T10:30:00Z"
      }, null, 2),
      responseHeaders: { "content-type": "application/json" },
      contentType: "application/json",
      delay: 50,
      enabled: true,
    },
    {
      name: "Créer un utilisateur",
      method: "POST",
      pathPattern: "/api/users",
      responseStatus: 201,
      responseBody: JSON.stringify({
        id: 4, name: "Nouvel Utilisateur", email: "new@example.com", role: "user"
      }, null, 2),
      responseHeaders: { "content-type": "application/json", "x-request-id": "req_abc123" },
      contentType: "application/json",
      delay: 0,
      enabled: true,
    },
    {
      name: "Erreur 404",
      method: "GET",
      pathPattern: "/api/users/not-found",
      responseStatus: 404,
      responseBody: JSON.stringify({
        error: "User not found",
        code: "USER_NOT_FOUND",
      }, null, 2),
      responseHeaders: { "content-type": "application/json" },
      contentType: "application/json",
      delay: 0,
      enabled: true,
    },
    {
      name: "Dashboard stats",
      method: "GET",
      pathPattern: "/api/dashboard/stats",
      responseStatus: 200,
      responseBody: JSON.stringify({
        totalUsers: 1250,
        activeUsers: 847,
        requestsToday: 3420,
        avgResponseTime: 45,
        uptime: "99.97%",
      }, null, 2),
      responseHeaders: { "content-type": "application/json" },
      contentType: "application/json",
      delay: 500,  // délai long pour tester
      enabled: true,
    },
  ]

  // Envoyer chaque route au store via l'API de config
  // On récupère d'abord les routes existantes
  const configRes = await fetch(`${BASE}/api/mock/config`)
  const config = await configRes.json()
  const existingRoutes = config.routes || []

  const allRoutes = [...existingRoutes]

  for (const r of sampleRoutes) {
    const id = `mock_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const now = Date.now()
    allRoutes.push({ ...r, id, createdAt: now, updatedAt: now })
    console.log(`   ✅  ${r.method} ${r.pathPattern}  — ${r.name}`)
  }

  // Sync toutes les routes
  await fetch(`${BASE}/api/mock/config`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ routes: allRoutes }),
  })

  console.log(`\n📦  ${sampleRoutes.length} route(s) factice(s) ajoutée(s.`)
  console.log("")
  console.log("🔗  URLs à tester :")
  for (const r of sampleRoutes) {
    console.log(`   ${BASE}/api/mock${r.pathPattern}`)
  }
  console.log("")
  console.log("📋  Recharge la page /mocks pour voir les nouvelles routes.")
}

// Helper pour lire l'entrée clavier (simple)
function prompt(question) {
  return new Promise((resolve) => {
    const { stdin, stdout } = process
    stdout.write(question)
    stdin.once("data", (data) => {
      resolve(data.toString().trim())
    })
  })
}

main().catch(console.error)
