export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "GRAPHQL";
export type BodyType = "none" | "json" | "form-data" | "x-www-form" | "raw" | "binary";
export type AuthType = "none" | "bearer" | "basic" | "api-key" | "oauth2";
export interface Header {
    key: string;
    value: string;
    enabled: boolean;
}
export interface QueryParam {
    key: string;
    value: string;
    enabled: boolean;
}
export interface EnvironmentVariable {
    key: string;
    value: string;
    enabled: boolean;
}
export interface Environment {
    id: string;
    name: string;
    variables: EnvironmentVariable[];
}
export interface RequestItem {
    id: string;
    name: string;
    method: HttpMethod;
    url: string;
    headers: Header[];
    queryParams: QueryParam[];
    body: string;
    bodyType: BodyType;
    authType: AuthType;
    authToken: string;
    sortOrder: number;
}
export interface Collection {
    id: string;
    name: string;
    requests: RequestItem[];
    folders?: CollectionFolder[];
}
export interface CollectionFolder {
    id: string;
    name: string;
    requests: string[];
    children?: CollectionFolder[];
}
export interface Assertion {
    key: string;
    operator: string;
    value: string;
    type?: string;
}
export interface AssertionResult {
    assertion: Assertion;
    passed: boolean;
    actual: unknown;
    expected: unknown;
    error?: string;
}
export interface RunResult {
    id: string;
    collectionId: string;
    timestamp: string;
    results: RequestRunResult[];
    summary: RunSummary;
}
export interface RequestRunResult {
    requestId: string;
    requestName: string;
    method: HttpMethod;
    url: string;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    duration: number;
    assertions: AssertionResult[];
    error?: string;
}
export interface RunSummary {
    total: number;
    passed: number;
    failed: number;
    errors: number;
    totalDuration: number;
}
export interface GraphQLConfig {
    url: string;
    query: string;
    variables?: string;
    operationName?: string;
    headers: Header[];
}
export interface ExportBundle {
    version: string;
    collections: Collection[];
    environments: Environment[];
}
//# sourceMappingURL=types.d.ts.map