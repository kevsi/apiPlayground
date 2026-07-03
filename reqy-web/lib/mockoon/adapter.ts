import type { MockRoute, MockRouteVariant } from "@/lib/mock-types"
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
    endpoint: route.pathPattern,
    responses: [baseResponse, ...variantResponses],
  }
}

export function convertMockRoutesToEnvironment(
  routes: MockRoute[],
  options: { name: string; port: number; hostname?: string } = {
    name: "reqy-mock-environment",
    port: 3001,
  },
): MockoonEnvironment {
  return {
    uuid: generateUuid(),
    name: options.name,
    port: options.port,
    hostname: options.hostname ?? "127.0.0.1",
    routes: routes.filter((route) => route.enabled).map(convertRouteToMockoonRoute),
  }
}

export function environmentToJson(environment: MockoonEnvironment): string {
  return JSON.stringify(environment, null, 2)
}
