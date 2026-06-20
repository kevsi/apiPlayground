# App Module — `reqy-web/app/`

## Purpose
Next.js App Router pages and API routes for the Reqly application. Serves the frontend UI and backend API endpoints from a single Next.js server.

## Pages

### Layout & Root
| File | Purpose |
|------|---------|
| `layout.tsx` | Root layout — providers (theme, sidebar, AI), persistence init, global styles. |
| `page.tsx` | Home page — redirects to dashboard or shows landing. |
| `globals.css` | Tailwind CSS global styles and custom CSS variables. |

### Dashboard
| File | Purpose |
|------|---------|
| `dashboard/page.tsx` | Main dashboard — project cards, recent activity, usage stats. |
| `dashboard/charts-content.tsx` | Chart components for dashboard analytics (uses recharts). |

### Collections
| File | Purpose |
|------|---------|
| `collections/page.tsx` | Collections management page with tree view, request list, and editor. |

### Mocks
| File | Purpose |
|------|---------|
| `mocks/page.tsx` | Mock server management — routes list, server config, route editor. |

### Projects
| File | Purpose |
|------|---------|
| `my-projects/page.tsx` | User projects listing with CRUD operations. |

### Settings
| File | Purpose |
|------|---------|
| `settings/page.tsx` | Settings page with tabbed sections (account, profile, sync, AI, integrations, notifications). |

### AI Insights
| File | Purpose |
|------|---------|
| `ai-insights/page.tsx` | AI-powered insights dashboard for request analysis and patterns. |

### Documentation
| File | Purpose |
|------|---------|
| `documentation/page.tsx` | Generated API documentation viewer. |

### Utility Routes
| File | Purpose |
|------|---------|
| `lib/supabase-server.ts` | Supabase server client for API route authentication. |

## API Routes

### Authentication
| Route | Purpose |
|-------|---------|
| `api/auth/login/route.ts` | Email/password login endpoint. |
| `api/auth/signup/route.ts` | User registration endpoint. |
| `api/auth/logout/route.ts` | Session invalidation. |
| `api/auth/session.ts` | Session management utility. |
| `api/auth/status/route.ts` | Session status check. |
| `api/auth/callback/route.ts` | OAuth callback handler. |

### OAuth Providers
| Route | Purpose |
|-------|---------|
| `api/auth/github/route.ts` | GitHub OAuth initiation. |
| `api/auth/google/route.ts` | Google OAuth initiation. |
| `api/auth/google/callback/route.ts` | Google OAuth callback. |

### GitHub Integration
| Route | Purpose |
|-------|---------|
| `api/github-auth/route.ts` | GitHub App authentication flow. |
| `api/github-auth/callback/route.ts` | GitHub Auth callback. |
| `api/github-auth/status/route.ts` | GitHub connection status. |
| `api/github-auth/repos/route.ts` | List authenticated user's repos. |
| `api/github-auth/logout/route.ts` | Disconnect GitHub. |

### Postman Integration
| Route | Purpose |
|-------|---------|
| `api/postman-auth/route.ts` | Postman OAuth flow. |
| `api/postman-auth/collections/route.ts` | Fetch Postman collections. |
| `api/postman-auth/logout/route.ts` | Disconnect Postman. |

### Mock Server API
| Route | Purpose |
|-------|---------|
| `api/mock/config/route.ts` | Mock server config CRUD — GET returns config, POST updates routes/servers. |
| `api/mock/[...path]/route.ts` | Dynamic mock route handler — matches incoming requests against configured mock routes. |

### Proxy & Import/Export
| Route | Purpose |
|-------|---------|
| `api/proxy/route.ts` | HTTP request proxy — forwards API requests from the browser. |
| `api/proxy‑ai/route.ts` | Proxy for AI provider APIs. |
| `api/postman-import/route.ts` | Postman collection import endpoint. |
| `api/postman-export/route.ts` | Export collections to Postman format. |
| `api/github-import/route.ts` | Import API endpoints from GitHub repos. |

## Architecture
- **App Router** — uses Next.js App Router with server components by default, `"use client"` for interactive pages.
- **API routes** — Next.js Route Handlers for server-side logic. Authentication via Supabase sessions.
- **Mock server** — `/api/mock/[...path]` catches all unmatched paths and matches against configured mock routes. State is held in-memory on the server.
- **Proxy** — `/api/proxy` forwards requests to external APIs, avoiding CORS issues in the browser.

## Dependencies
- `next` — framework
- `@supabase/supabase-js` — auth and database
- `@vercel/analytics` — usage analytics
