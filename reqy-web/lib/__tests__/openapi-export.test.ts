import { describe, it, expect } from "vitest";
import { generateOpenApiSpec } from "@/lib/openapi-export";
import type { Collection, RequestItem } from "@/lib/types";

function makeRequest(overrides: Partial<RequestItem>): RequestItem {
  return {
    id: "r1",
    name: "Get users",
    method: "GET",
    url: "https://api.example.com/users",
    endpoint: "/users",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeCollection(requests: RequestItem[]): Collection {
  return {
    id: "c1",
    name: "My API",
    color: "emerald",
    icon: "package",
    requests,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("generateOpenApiSpec", () => {
  it("derives the API server from absolute request URLs instead of localhost", () => {
    const spec = generateOpenApiSpec([
      makeCollection([
        makeRequest({ url: "https://api.example.com/users", endpoint: "/users" }),
        makeRequest({ url: "https://api.example.com/posts", endpoint: "/posts" }),
      ]),
    ]);
    expect(spec.servers?.[0]?.url).toBe("https://api.example.com");
  });

  it("falls back to localhost when no absolute URL is present", () => {
    const spec = generateOpenApiSpec([
      makeCollection([makeRequest({ url: "/users", endpoint: "/users" })]),
    ]);
    expect(spec.servers?.[0]?.url).toBe("http://localhost");
  });

  it("produces a generic response schema without inference", () => {
    const spec = generateOpenApiSpec([makeCollection([makeRequest({})])]);
    const op = spec.paths["/users"]?.get;
    const schema = (op?.responses?.["200"] as any)?.content?.["application/json"]?.schema;
    expect(schema).toBeDefined();
    // Generic fallback has no `properties`.
    expect(schema.properties).toBeUndefined();
  });

  it("infers a typed response schema from history when enableInference is set", () => {
    const spec = generateOpenApiSpec([makeCollection([makeRequest({ id: "r1" })])], {
      enableInference: true,
      historyItems: [{ requestId: "r1", responseBody: JSON.stringify({ id: 1, name: "Ada" }) }],
    });
    const op = spec.paths["/users"]?.get;
    const schema = (op?.responses?.["200"] as any)?.content?.["application/json"]?.schema;
    // Inference is merged as allOf: [generic, inferred]; typed fields live on the
    // inferred member, which OpenAPI Generator resolves correctly.
    expect(schema.allOf).toBeDefined();
    const inferred = schema.allOf[1];
    expect(inferred.properties.id).toBeDefined();
    expect(inferred.properties.name).toBeDefined();
  });

  it("ignores history with no matching requestId (stays generic)", () => {
    const spec = generateOpenApiSpec([makeCollection([makeRequest({ id: "r1" })])], {
      enableInference: true,
      historyItems: [{ requestId: "other", responseBody: JSON.stringify({ x: 1 }) }],
    });
    const op = spec.paths["/users"]?.get;
    const schema = (op?.responses?.["200"] as any)?.content?.["application/json"]?.schema;
    expect(schema.properties).toBeUndefined();
  });
});
