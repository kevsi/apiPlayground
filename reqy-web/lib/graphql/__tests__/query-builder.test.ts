import { describe, it, expect } from "vitest";
import { buildQueryFromSelections } from "@/lib/graphql/query-builder";

describe("buildQueryFromSelections", () => {
  it("builds a simple query", () => {
    const selections = [
      { field: "countries", args: {}, subfields: ["code", "name"] },
    ];
    const result = buildQueryFromSelections(selections);
    expect(result).toContain("query");
    expect(result).toContain("countries");
    expect(result).toContain("code");
  });

  it("builds a query with arguments", () => {
    const selections = [
      { field: "country", args: { code: "\"FR\"" }, subfields: ["name"] },
    ];
    const result = buildQueryFromSelections(selections);
    expect(result).toContain('country(code: "FR")');
  });

  it("builds a nested query", () => {
    const selections = [
      {
        field: "countries",
        args: {},
        subfields: [
          { field: "continent", args: {}, subfields: ["name"] },
        ],
      },
    ];
    const result = buildQueryFromSelections(selections);
    expect(result).toContain("continent");
    expect(result).toContain("name");
  });

  it("returns empty subfield block when no subfields", () => {
    const selections = [{ field: "__typename", args: {}, subfields: [] }];
    const result = buildQueryFromSelections(selections);
    expect(result).toContain("__typename");
    expect(result).not.toContain("__typename {");
  });
});
