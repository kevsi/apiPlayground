/**
 * Unit tests for project-analyzer.ts
 * 
 * Run with: npx tsx lib/project-analyzer.test.ts
 * Or integrate with Jest/Vitest after setup
 */

// Test data structures
interface TestRoute {
  method: string
  path: string
  authRequired: boolean
  authType: string | null
  bodyType: string
  sourceFile: string
}

// Mock implementations for testing
const testCases = {
  nextjsAppRouter: {
    description: "Next.js App Router route detection",
    fileContent: `
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const token = cookies().get('github_token')
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ data: 'success' })
}

export async function POST(request: Request) {
  const body = await request.json()
  return NextResponse.json({ created: true })
}
`,
    filePath: "app/api/auth/route.ts",
    expectedRoutes: [
      { method: "GET", path: "/auth", authRequired: true, authType: "cookie" },
      { method: "POST", path: "/auth", authRequired: false, authType: null },
    ],
  },

  expressPassport: {
    description: "Express with Passport.js authentication",
    fileContent: `
import express from 'express'
import passport from 'passport'

const router = express.Router()

router.get('/profile', passport.authenticate('jwt'), (req, res) => {
  res.json({ user: req.user })
})

router.post('/login', (req, res) => {
  res.json({ token: 'abc123' })
})

export default router
`,
    filePath: "routes/users.ts",
    expectedRoutes: [
      { method: "GET", path: "/profile", authRequired: true, authType: "passport" },
      { method: "POST", path: "/login", authRequired: false, authType: null },
    ],
  },

  nextjsBearerToken: {
    description: "Next.js route with Bearer token verification",
    fileContent: `
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Not Authenticated' }), { status: 401 })
  }
  const token = authHeader.slice(7)
  return new Response(JSON.stringify({ data: 'authorized' }))
}
`,
    filePath: "app/api/data/route.ts",
    expectedRoutes: [
      { method: "GET", path: "/data", authRequired: true, authType: "jwt" },
    ],
  },

  fastapi: {
    description: "FastAPI route detection",
    fileContent: `
from fastapi import APIRouter, Depends
from fastapi.security import HTTPBearer

router = APIRouter()
security = HTTPBearer()

@router.get("/items")
async def list_items():
    return {"items": []}

@router.get("/protected", dependencies=[Depends(security)])
async def protected_route(token: str = Depends(security)):
    return {"data": "secret"}

@router.post("/create")
async def create_item(item: dict):
    return {"created": item}
`,
    filePath: "routers/items.py",
    expectedRoutes: [
      { method: "GET", path: "/items", authRequired: false, authType: null },
      { method: "GET", path: "/protected", authRequired: true, authType: "jwt" },
      { method: "POST", path: "/create", authRequired: false, authType: null },
    ],
  },

  dynamicRoutes: {
    description: "Dynamic route segments [id], [...slug]",
    fileContent: `
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  return new Response(JSON.stringify({ id: params.id }))
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  return new Response(JSON.stringify({ deleted: params.id }))
}
`,
    filePath: "app/api/items/[id]/route.ts",
    expectedRoutes: [
      { method: "GET", path: "/items/:id", authRequired: false, authType: null },
      { method: "DELETE", path: "/items/:id", authRequired: false, authType: null },
    ],
  },

  catchAllRoutes: {
    description: "Catch-all routes [...slug]",
    fileContent: `
export async function GET(
  request: Request,
  { params }: { params: { slug: string[] } }
) {
  const path = '/' + params.slug.join('/')
  return new Response(JSON.stringify({ path }))
}
`,
    filePath: "app/api/proxy/[...slug]/route.ts",
    expectedRoutes: [
      { method: "GET", path: "/proxy/:slug", authRequired: false, authType: null },
    ],
  },

  formData: {
    description: "Form data request handling",
    fileContent: `
export async function POST(request: Request) {
  const formData = await request.formData()
  const file = formData.get('file')
  return new Response(JSON.stringify({ uploaded: !!file }))
}
`,
    filePath: "app/api/upload/route.ts",
    expectedRoutes: [
      { method: "POST", path: "/upload", authRequired: false, authType: null, bodyType: "form" },
    ],
  },

  nestjsControllers: {
    description: "NestJS controller detection",
    fileContent: `
import { Controller, Get, Post, Req } from '@nestjs/common'
import { JwtGuard } from '../auth/jwt.guard'

@Controller('api/users')
export class UsersController {
  @Get()
  findAll() {
    return []
  }

  @Post('login')
  login(@Req() req: Request) {
    return { token: 'abc' }
  }

  @Get('profile')
  @UseGuards(JwtGuard)
  getProfile(@Req() req: Request) {
    return { user: req.user }
  }
}
`,
    filePath: "src/users/users.controller.ts",
    expectedRoutes: [
      { method: "GET", path: "/api/users", authRequired: false, authType: null },
      { method: "POST", path: "/api/users/login", authRequired: false, authType: null },
      { method: "GET", path: "/api/users/profile", authRequired: true, authType: "middleware" },
    ],
  },

  statusCodeResponses: {
    description: "401/403 status code detection",
    fileContent: `
export async function GET(request: Request) {
  const user = request.headers.get('x-user-id')
  if (!user) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
  return Response.json({ user })
}
`,
    filePath: "app/api/secure/route.ts",
    expectedRoutes: [
      { method: "GET", path: "/secure", authRequired: true, authType: "middleware" },
    ],
  },

  frontendCorrelation: {
    description: "Frontend to backend API call correlation",
    fileContent: `
// Frontend file - components/UserList.tsx
import { useState, useEffect } from 'react'

export function UserList() {
  const [users, setUsers] = useState([])
  
  useEffect(() => {
    // Direct fetch call
    fetch('/api/users')
      .then(r => r.json())
      .then(data => setUsers(data.users))
    
    // Axios call
    axios.post('/api/auth/login', { email, password })
      .then(res => localStorage.setItem('token', res.data.token))
    
    // Template literal with env var
    ky(\`\${API_BASE}/api/data/123\`).json()
  }, [])
  
  return null
}
`,
    filePath: "components/UserList.tsx",
    expectedRoutes: [
      // Routes detected from file path and frontend calls
      { method: "GET", path: "/users", authRequired: false, actuallyUsedByFrontend: true },
      { method: "POST", path: "/auth/login", authRequired: false, actuallyUsedByFrontend: true },
      { method: "GET", path: "/data/123", authRequired: false, actuallyUsedByFrontend: true },
    ],
  },

  multipleFrameworks: {
    description: "Mixed framework detection in same project",
    fileContent: `
// Express middleware
const express = require('express')
const router = express.Router()

router.get('/status', (req, res) => {
  res.json({ status: 'ok' })
})

// Followed by a FastAPI-like comment (not actual code but in comments/docs)
# @app.post("/process")
# async def process_data(data: dict):
#   return {"processed": True}
`,
    filePath: "mixed/routes.js",
    expectedRoutes: [
      { method: "GET", path: "/status", authRequired: false, authType: null },
    ],
  },
}

// Helper function to test a single case
function testCase(testName: string, content: string, filePath: string, expectedRoutes: TestRoute[]) {
  console.log(`\n✓ Testing: ${testName}`)
  console.log(`  File: ${filePath}`)
  console.log(`  Expected routes: ${expectedRoutes.length}`)

  // This is where actual testing would happen
  // In a real test framework, we'd:
  // 1. Call detectNextJsRoutes(content, filePath) or similar
  // 2. Compare results with expectedRoutes
  // 3. Assert match or log differences

  expectedRoutes.forEach((route) => {
    console.log(`    - ${route.method.padEnd(6)} ${route.path.padEnd(25)} [${route.authRequired ? 'AUTH' : 'PUBLIC'}] (${route.authType || 'none'})`)
  })
}

// Run all tests
export function runAllTests() {
  console.log("====================================================")
  console.log("Project Analyzer - Unit Tests")
  console.log("====================================================")

  Object.entries(testCases).forEach(([key, testCase]) => {
    testCase(
      testCase.description,
      testCase.fileContent,
      testCase.filePath,
      testCase.expectedRoutes as TestRoute[]
    )
  })

  console.log("\n====================================================")
  console.log("Note: This is a test specification file.")
  console.log("Integrate with Jest/Vitest for automated testing.")
  console.log("====================================================\n")
}

// Export for use in other modules
export { testCases }

// Run tests if executed directly
if (typeof window === 'undefined' && require.main === module) {
  runAllTests()
}
