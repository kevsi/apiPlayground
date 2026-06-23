import type { HttpMethod, Header, QueryParam, RequestTab } from "@/lib/request-executor"

export const methodColors: Record<HttpMethod, string> = {
  GET: "bg-emerald-500 text-white",
  POST: "bg-blue-500 text-white",
  PUT: "bg-amber-500 text-white",
  PATCH: "bg-purple-500 text-white",
  DELETE: "bg-red-500 text-white",
  HEAD: "bg-slate-500 text-white",
  OPTIONS: "bg-slate-500 text-white",
  GRAPHQL: "bg-pink-500 text-white",
}

export const defaultQueryParams: QueryParam[] = []
export const defaultHeaders: Header[] = []
export const defaultBody = ""

export const STORAGE_KEY_TABS = "reqly-request-tabs"

export function generateRequestTabId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

export function headersArrayToRecord(headers: Header[]): Record<string, string> {
  return Object.fromEntries(
    headers
      .filter((header) => header.key.trim() && header.value.trim())
      .map((header) => [header.key.trim(), header.value.trim()]),
  )
}

export function recordToHeaderArray(headers?: Record<string, string>): Header[] {
  return headers ? Object.entries(headers).map(([key, value]) => ({ key, value })) : []
}

export function sanitizeTabForStorage(tab: RequestTab) {
  const { responseData: _responseData, testResults: _testResults, ...rest } = tab
  void _responseData
  void _testResults
  return rest
}

export function createEmptyTab(overrides: Partial<RequestTab> = {}): RequestTab {
  return {
    id: generateRequestTabId(),
    name: "New Request",
    method: "GET",
    url: "",
    endpoint: "",
    headers: defaultHeaders,
    queryParams: defaultQueryParams,
    body: defaultBody,
    bodyType: "json",
    authType: "none",
    authToken: "",
    hasResponse: false,
    isSaved: false,
    ...overrides,
  }
}

export const initialTabs: RequestTab[] = [
  createEmptyTab({ id: "1", name: "New Request" }),
]

export function getMethodPanelClass(method: HttpMethod): string {
  switch (method) {
    case "GET":
      return "border-b-emerald-500/15 bg-emerald-500/[0.02]"
    case "POST":
      return "border-b-blue-500/15 bg-blue-500/[0.02]"
    case "PUT":
      return "border-b-amber-500/15 bg-amber-500/[0.02]"
    case "PATCH":
      return "border-b-purple-500/15 bg-purple-500/[0.02]"
    case "GRAPHQL":
      return "border-b-pink-500/15 bg-pink-500/[0.02]"
    default:
      return "border-b-red-500/15 bg-red-500/[0.02]"
  }
}

export function getMethodBadgeClass(method: HttpMethod): string {
  switch (method) {
    case "GET":
      return "bg-emerald-500 text-white border-emerald-500"
    case "POST":
      return "bg-blue-500 text-white border-blue-500"
    case "PUT":
      return "bg-amber-500 text-white border-amber-500"
    case "PATCH":
      return "bg-purple-500 text-white border-purple-500"
    case "GRAPHQL":
      return "bg-pink-500 text-white border-pink-500"
    default:
      return "bg-red-500 text-white border-red-500"
  }
}

export function getMethodDotClass(method: HttpMethod): string {
  switch (method) {
    case "GET":
      return "bg-emerald-500"
    case "POST":
      return "bg-blue-500"
    case "PUT":
      return "bg-amber-500"
    case "PATCH":
      return "bg-purple-500"
    case "GRAPHQL":
      return "bg-pink-500"
    default:
      return "bg-red-500"
  }
}
