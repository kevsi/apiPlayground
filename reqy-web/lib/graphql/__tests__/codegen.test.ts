import { describe, it, expect } from "vitest";
import {
  generateFetchSnippet,
  generateCurlSnippet,
  generateTypeScriptStub,
} from "@/lib/graphql/codegen";

describe("generateFetchSnippet", () => {
  it("produces valid JS fetch code", () => {
    const code = generateFetchSnippet({
      endpoint: "https://api.example.com/graphql",
      query: "{ hello }",
      variables: {},
      headers: { Authorization: "Bearer token" },
    });
    expect(code).toContain("fetch");
    expect(code).toContain("https://api.example.com/graphql");
    expect(code).toContain("{ hello }");
    expect(code).toContain("Authorization");
  });

  it("includes variables and operation name when provided", () => {
    const code = generateFetchSnippet({
      endpoint: "https://api.example.com/graphql",
      query: "query Hello($id: ID!) { hello(id: $id) }",
      variables: { id: "1" },
      operationName: "Hello",
    });
    expect(code).toContain('"operationName": "Hello"');
    expect(code).toContain('"id": "1"');
  });
});

describe("generateCurlSnippet", () => {
  it("produces valid curl command", () => {
    const code = generateCurlSnippet({
      endpoint: "https://api.example.com/graphql",
      query: "{ hello }",
      variables: {},
      headers: { Authorization: "Bearer token" },
    });
    expect(code).toContain("curl");
    expect(code).toContain("-X POST");
    expect(code).toContain("Authorization: Bearer token");
    expect(code).toContain("Content-Type: application/json");
  });

  it("produces minimal curl when no extra headers", () => {
    const code = generateCurlSnippet({
      endpoint: "https://api.example.com/graphql",
      query: "{ hello }",
    });
    expect(code).toContain("-d");
    expect(code).not.toContain("-H \"Authorization");
  });
});

describe("generateTypeScriptStub", () => {
  it("produces a TypeScript interface", () => {
    const code = generateTypeScriptStub("GetUsers", ["id", "name"]);
    expect(code).toContain("interface GetUsersResponse");
    expect(code).toContain("id: unknown");
    expect(code).toContain("name: unknown");
  });
});
