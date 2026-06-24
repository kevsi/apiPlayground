export interface SelectionNode {
  field: string;
  args: Record<string, string>;
  subfields: string[] | SelectionNode[];
  inlineFragments?: Record<string, SelectionNode[]>;
}

export function buildQueryFromSelections(
  selections: SelectionNode[],
  operationName = "GeneratedQuery",
): string {
  function renderArgs(args: Record<string, string>): string {
    const entries = Object.entries(args);
    if (entries.length === 0) return "";
    return `(${entries.map(([k, v]) => `${k}: ${v}`).join(", ")})`;
  }

  function renderFields(fields: string[] | SelectionNode[]): string {
    if (fields.length === 0) return "";
    const inner = fields
      .map((f) => {
        if (typeof f === "string") return `    ${f}`;
        const node = f as SelectionNode;
        const args = renderArgs(node.args);
        const sub = renderFields(node.subfields);
        return sub
          ? `    ${node.field}${args} {\n${sub}\n    }`
          : `    ${node.field}${args}`;
      })
      .join("\n");
    return `{\n${inner}\n  }`;
  }

  const body = selections
    .map((sel) => {
      const args = renderArgs(sel.args);
      const sub = renderFields(sel.subfields);
      return sub
        ? `  ${sel.field}${args} {\n${sub}\n  }`
        : `  ${sel.field}${args}`;
    })
    .join("\n");

  return `query ${operationName} {\n${body}\n}`;
}
