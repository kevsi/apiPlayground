export function formatGraphQL(query: string): string {
  if (!query.trim()) return ""

  const normalized = query.replace(/\r\n/g, "\n").trim()
  const tokens = normalized
    .replace(/\s+/g, " ")
    .replace(/\{/g, " { ")
    .replace(/\}/g, " } ")
    .replace(/,/g, " , ")
    .split(/\s+/)
    .filter(Boolean)

  let depth = 0
  const indent = "  "
  const out: string[] = []

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    if (tok === "{") {
      out.push(indent.repeat(depth) + "{")
      depth++
    } else if (tok === "}") {
      depth = Math.max(0, depth - 1)
      out.push(indent.repeat(depth) + "}")
      // peek: next non-space token is on same level so add blank line for readability
      const next = tokens[i + 1]
      if (next && next !== "}" && next !== ",") {
        out.push("")
      }
    } else if (tok === ",") {
      const last = out[out.length - 1]
      if (last !== undefined) out[out.length - 1] = last.replace(/,\s*$/, "") + ","
    } else {
      // Identifier / arg / value — look ahead for "(" to keep one-liners
      const next = tokens[i + 1]
      if (next === "(") {
        // Inline args block
        let inline = tok + " ("
        let j = i + 2
        let parenDepth = 1
        while (j < tokens.length && parenDepth > 0) {
          const t = tokens[j]
          if (t === "(") parenDepth++
          else if (t === ")") {
            parenDepth--
            if (parenDepth === 0) {
              inline += ")"
              break
            }
          } else if (t === ":") {
            inline += ": "
          } else {
            inline += t + " "
          }
          j++
        }
        out.push(indent.repeat(depth) + inline.trim())
        i = j
      } else {
        out.push(indent.repeat(depth) + tok)
      }
    }
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}
