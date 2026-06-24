export interface SelectionNode {
  field: string
  args: Record<string, string>
  subfields: string[] | SelectionNode[]
}

function renderArgs(args: Record<string, string>): string {
  const entries = Object.entries(args)
  if (entries.length === 0) return ""
  return `(${entries.map(([k, v]) => `${k}: ${v}`).join(", ")})`
}

function renderFields(fields: string[] | SelectionNode[], indent: string): string {
  if (fields.length === 0) return ""
  const lines = fields.map((f) => {
    if (typeof f === "string") return `${indent}${f}`
    const node = f as SelectionNode
    const args = renderArgs(node.args)
    const sub = renderFields(node.subfields, indent + "  ")
    return sub ? `${indent}${node.field}${args} {\n${sub}\n${indent}}` : `${indent}${node.field}${args}`
  })
  return lines.join("\n")
}

export function buildQueryFromSelections(
  selections: SelectionNode[],
  operationName = "GeneratedQuery",
): string {
  if (selections.length === 0) return ""
  const body = selections
    .map((sel) => {
      const args = renderArgs(sel.args)
      const sub = renderFields(sel.subfields, "    ")
      return sub ? `  ${sel.field}${args} {\n${sub}\n  }` : `  ${sel.field}${args}`
    })
    .join("\n")
  return `query ${operationName} {\n${body}\n}`
}
