// reqy-web/lib/mockoon/types.ts

export interface MockoonHeader {
  key: string
  value: string
}

export interface MockoonResponseRule {
  target: "header" | "query" | "params" | "body" | "request_number"
  modifier?: string
  value: string
  operator:
    | "equals"
    | "regex"
    | "regex_i"
    | "startsWith"
    | "endsWith"
    | "contains"
}

export interface MockoonResponse {
  uuid: string
  body: string
  latency: number
  statusCode: number
  label: string
  headers: MockoonHeader[]
  rules: MockoonResponseRule[]
  rulesOperator?: "OR" | "AND"
}

export interface MockoonRoute {
  uuid: string
  type: "http"
  documentation: string
  method: string
  endpoint: string
  responses: MockoonResponse[]
}

export interface MockoonEnvironment {
  uuid: string
  name: string
  port: number
  hostname: string
  tlsOptions?: {
    enabled: boolean
  }
  routes: MockoonRoute[]
}
