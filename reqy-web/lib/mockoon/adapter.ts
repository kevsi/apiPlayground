import type { MockRoute, MockRouteVariant, MockServer } from "@/lib/mock-types"
import type {
  MockoonEnvironment,
  MockoonRoute,
  MockoonResponse,
} from "./types"

let _uuidCounter = 0

function generateUuid(): string {
  _uuidCounter++
  return `reqy-${Date.now()}-${_uuidCounter}`
}

export function resetUuidCounter(): void {
  _uuidCounter = 0
}

function convertVariantToResponse(
  route: MockRoute,
  variant: MockRouteVariant,
): MockoonResponse {
  return {
    uuid: generateUuid(),
    body: variant.responseBody,
    latency: variant.delay,
    statusCode: variant.responseStatus,
    label: variant.name,
    headers: Object.entries(variant.responseHeaders).map(([key, value]) => ({
      key,
      value,
    })),
    rules: [],
  }
}

function buildEndpoint(pathPattern: string, prefix?: string): string {
  const normalizedPrefix = prefix?.replace(/^\/+|\/$/g, "") || ""
  const normalizedPath = pathPattern.replace(/^\/?/, "/")
  if (!normalizedPrefix) return normalizedPath
  return `/${normalizedPrefix}${normalizedPath}`
}

function convertRouteToMockoonRoute(route: MockRoute): MockoonRoute {
  const baseResponse: MockoonResponse = {
    uuid: generateUuid(),
    body: route.responseBody,
    latency: route.delay,
    statusCode: route.responseStatus,
    label: route.name,
    headers: Object.entries(route.responseHeaders).map(([key, value]) => ({
      key,
      value,
    })),
    rules: [],
  }

  const variantResponses =
    route.variants?.map((variant) => convertVariantToResponse(route, variant)) ??
    []

  return {
    uuid: generateUuid(),
    type: "http",
    documentation: route.name,
    method: route.method.toUpperCase(),
    endpoint: buildEndpoint(route.pathPattern),
    responses: [baseResponse, ...variantResponses],
  }
}

export function convertMockRoutesToEnvironment(
  routes: MockRoute[],
  servers: MockServer[] = [],
  options: { name: string; port: number; hostname?: string } = {
    name: "reqy-mock-environment",
    port: 3001,
  },
): MockoonEnvironment {
  const prefixByServerId = new Map(servers.map((s) => [s.id, s.localPrefix]))

  return {
    uuid: generateUuid(),
    name: options.name,
    port: options.port,
    hostname: options.hostname ?? "127.0.0.1",
    routes: routes
      .filter((route) => route.enabled)
      .map((route) => {
        const mockoonRoute = convertRouteToMockoonRoute(route)
        const prefix = route.serverId ? prefixByServerId.get(route.serverId) : undefined
        mockoonRoute.endpoint = buildEndpoint(route.pathPattern, prefix)
        return mockoonRoute
      }),
  }
}

export function environmentToJson(environment: MockoonEnvironment): string {
  return JSON.stringify(environment, null, 2)
}
