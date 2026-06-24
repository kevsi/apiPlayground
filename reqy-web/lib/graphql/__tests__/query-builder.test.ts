import { describe, it, expect } from "vitest"
import { buildQueryFromSelections } from "@/lib/graphql/query-builder"

describe("buildQueryFromSelections", () => {
  it("returns empty string for no selections", () => {
    expect(buildQueryFromSelections([])).toBe("")
  })

  it("builds a simple query with default operation name", () => {
    const selections = [{ field: "hello", args: {}, subfields: [] }]
    const result = buildQueryFromSelections(selections)
    expect(result).toBe("query GeneratedQuery {\n  hello\n}")
  })

  it("builds a query with custom operation name", () => {
    const selections = [{ field: "countries", args: {}, subfields: ["code", "name"] }]
    const result = buildQueryFromSelections(selections, "GetCountries")
    expect(result).toContain("query GetCountries")
    expect(result).toContain("countries")
    expect(result).toContain("code")
    expect(result).toContain("name")
  })

  it("builds a query with arguments", () => {
    const selections = [
      { field: "country", args: { code: '"FR"' }, subfields: ["name", "capital"] },
    ]
    const result = buildQueryFromSelections(selections)
    expect(result).toContain('country(code: "FR")')
    expect(result).toContain("name")
    expect(result).toContain("capital")
  })

  it("builds nested subfields with proper indentation", () => {
    const selections = [
      {
        field: "country",
        args: { code: '"US"' },
        subfields: [
          { field: "continent", args: {}, subfields: ["name"] },
        ],
      },
    ]
    const result = buildQueryFromSelections(selections)
    expect(result).toContain("country(code: \"US\")")
    expect(result).toContain("continent")
    expect(result).toContain("name")
    // indentation should be 4 spaces for nested
    expect(result).toMatch(/^ {4}continent/m)
  })
})
