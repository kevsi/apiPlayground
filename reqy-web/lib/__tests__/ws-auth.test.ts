import { describe, it, expect } from "vitest"
import {
  buildAuthHeaders,
  applyAuthToUrl,
  type WsAuthConfig,
} from "@/lib/ws-auth"

const NONE: WsAuthConfig = { type: "none", token: "", queryName: "token" }

describe("lib/ws-auth — buildAuthHeaders", () => {
  it("returns empty object when type is 'none'", () => {
    expect(buildAuthHeaders({ ...NONE, type: "none", token: "abc" })).toEqual({})
  })

  it("returns empty object when type is 'query'", () => {
    expect(buildAuthHeaders({ ...NONE, type: "query", token: "abc" })).toEqual({})
  })

  it("returns empty object when bearer token is empty or whitespace", () => {
    expect(buildAuthHeaders({ ...NONE, type: "bearer", token: "" })).toEqual({})
    expect(buildAuthHeaders({ ...NONE, type: "bearer", token: "   " })).toEqual({})
    expect(buildAuthHeaders({ ...NONE, type: "bearer", token: "\n\t " })).toEqual({})
  })

  it("returns Authorization: Bearer header for non-empty bearer token", () => {
    expect(buildAuthHeaders({ ...NONE, type: "bearer", token: "abc123" })).toEqual({
      Authorization: "Bearer abc123",
    })
  })

  it("trims surrounding whitespace from the bearer token", () => {
    expect(buildAuthHeaders({ ...NONE, type: "bearer", token: "  secret  " })).toEqual({
      Authorization: "Bearer secret",
    })
  })

  it("does not encode or otherwise mangle the token value", () => {
    // Tokens are arbitrary user-provided strings; we pass them through verbatim.
    expect(buildAuthHeaders({ ...NONE, type: "bearer", token: "a.b.c+d==" })).toEqual({
      Authorization: "Bearer a.b.c+d==",
    })
  })
})

describe("lib/ws-auth — applyAuthToUrl", () => {
  it("returns the URL unchanged when type is 'none'", () => {
    expect(applyAuthToUrl("wss://example.com/socket", { ...NONE, type: "none", token: "abc" })).toBe(
      "wss://example.com/socket",
    )
  })

  it("returns the URL unchanged when type is 'bearer'", () => {
    expect(applyAuthToUrl("wss://example.com/socket", { ...NONE, type: "bearer", token: "abc" })).toBe(
      "wss://example.com/socket",
    )
  })

  it("returns the URL unchanged when query token is empty/whitespace", () => {
    const cfg: WsAuthConfig = { type: "query", token: "", queryName: "token" }
    expect(applyAuthToUrl("wss://example.com/socket", cfg)).toBe("wss://example.com/socket")

    const wsCfg: WsAuthConfig = { type: "query", token: "   ", queryName: "token" }
    expect(applyAuthToUrl("wss://example.com/socket", wsCfg)).toBe("wss://example.com/socket")
  })

  it("appends ?<name>=<token> when there is no existing query string", () => {
    const cfg: WsAuthConfig = { type: "query", token: "abc123", queryName: "token" }
    const out = applyAuthToUrl("wss://example.com/socket", cfg)
    const parsed = new URL(out)
    expect(parsed.searchParams.get("token")).toBe("abc123")
    expect(parsed.origin).toBe("wss://example.com")
    expect(parsed.pathname).toBe("/socket")
  })

  it("merges into an existing query string with '&' separator", () => {
    const cfg: WsAuthConfig = { type: "query", token: "abc123", queryName: "token" }
    const out = applyAuthToUrl("wss://example.com/socket?room=42", cfg)
    const parsed = new URL(out)
    expect(parsed.searchParams.get("room")).toBe("42")
    expect(parsed.searchParams.get("token")).toBe("abc123")
  })

  it("honours a custom query parameter name", () => {
    const cfg: WsAuthConfig = { type: "query", token: "abc123", queryName: "api_key" }
    const out = applyAuthToUrl("wss://example.com/socket", cfg)
    const parsed = new URL(out)
    expect(parsed.searchParams.get("api_key")).toBe("abc123")
    expect(parsed.searchParams.has("token")).toBe(false)
  })

  it("falls back to the default name 'token' when queryName is empty/whitespace", () => {
    const cfg: WsAuthConfig = { type: "query", token: "abc123", queryName: "   " }
    const out = applyAuthToUrl("wss://example.com/socket", cfg)
    const parsed = new URL(out)
    expect(parsed.searchParams.get("token")).toBe("abc123")
  })

  it("does not overwrite a query param with the same name already present in the URL", () => {
    const cfg: WsAuthConfig = { type: "query", token: "fromAuth", queryName: "token" }
    const out = applyAuthToUrl("wss://example.com/socket?token=fromUrl", cfg)
    const parsed = new URL(out)
    expect(parsed.searchParams.get("token")).toBe("fromUrl")
  })

  it("percent-encodes tokens that contain reserved characters", () => {
    const cfg: WsAuthConfig = { type: "query", token: "a b/c?d&e", queryName: "token" }
    const out = applyAuthToUrl("wss://example.com/socket", cfg)
    const parsed = new URL(out)
    // The parsed value will be decoded back to the original string.
    expect(parsed.searchParams.get("token")).toBe("a b/c?d&e")
    // The raw output should contain the encoded form.
    expect(out).toContain("token=a")
  })

  it("throws when given an invalid URL", () => {
    const cfg: WsAuthConfig = { type: "query", token: "abc", queryName: "token" }
    expect(() => applyAuthToUrl("not a url", cfg)).toThrow()
  })
})
