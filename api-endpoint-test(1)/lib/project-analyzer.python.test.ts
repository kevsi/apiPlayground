/**
 * Python route detector smoke tests.
 * Run: npx tsx lib/project-analyzer.python.test.ts
 */
import { detectDjango, detectFastAPI, detectFlask } from "./project-analyzer"

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function hasRoute(
  routes: ReturnType<typeof detectFastAPI>,
  method: string,
  path: string,
) {
  return routes.some((r) => r.method === method && r.path === path)
}

// FastAPI — app-level decorators (always detected)
const fastApiSource = `
from fastapi import FastAPI

app = FastAPI()

@app.get("/users")
async def list_users():
    return []

@app.post("/login")
async def login():
    return {"token": "x"}
`

const fastApiRoutes = detectFastAPI(fastApiSource)
assert(hasRoute(fastApiRoutes, "GET", "/users"), "FastAPI GET /users")
assert(hasRoute(fastApiRoutes, "POST", "/login"), "FastAPI POST /login")

// Flask
const flaskSource = `
from flask import Flask

app = Flask(__name__)

@app.route("/health")
def health():
    return "ok"

@app.get("/items")
def list_items():
    return {}
`

const flaskRoutes = detectFlask(flaskSource)
assert(hasRoute(flaskRoutes, "GET", "/health"), "Flask GET /health")
assert(hasRoute(flaskRoutes, "GET", "/items"), "Flask GET /items")
assert(flaskRoutes.length >= 2, "Flask detects at least two routes")

// Django
const djangoSource = `
from django.urls import path
from django.contrib.auth.decorators import login_required
from rest_framework.routers import DefaultRouter

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/status/", status_view),
]

router = DefaultRouter()
router.register("users", UserViewSet)
`

const djangoRoutes = detectDjango(djangoSource)
assert(
  djangoRoutes.some((r) => r.path.includes("api/status")),
  "Django path() route",
)
assert(
  djangoRoutes.some((r) => r.path.includes("users")),
  "DRF router.register users",
)

console.log("project-analyzer.python.test.ts: all assertions passed")
console.log(`  FastAPI: ${fastApiRoutes.length} routes`)
console.log(`  Flask: ${flaskRoutes.length} routes`)
console.log(`  Django: ${djangoRoutes.length} routes`)
