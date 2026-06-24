"use client"

import { useMemo, useCallback } from "react"
import CodeMirror, { EditorView } from "@uiw/react-codemirror"
import { graphql } from "cm6-graphql"

interface Props {
  value: string
  onChange: (v: string) => void
  schema?: unknown
  placeholder?: string
  readOnly?: boolean
}

export function GraphqlQueryEditor({
  value,
  onChange,
  schema,
  placeholder,
  readOnly,
}: Props) {
  const extensions = useMemo(() => {
    // cm6-graphql accepts an optional schema for autocompletion.
    // We cast to unknown because its types are loose.
    try {
      return [
        graphql(schema as never),
        EditorView.theme({
          "&": { fontSize: "13px" },
        }),
      ]
    } catch {
      // Fallback: no schema, basic graphql syntax highlighting.
      return [
        graphql(),
        EditorView.theme({
          "&": { fontSize: "13px" },
        }),
      ]
    }
  }, [schema])

  const handleChange = useCallback(
    (v: string) => {
      onChange(v)
    },
    [onChange],
  )

  return (
    <div className="border-b bg-muted/10" data-testid="graphql-query-editor">
      <CodeMirror
        value={value}
        height="300px"
        extensions={extensions}
        onChange={handleChange}
        placeholder={
          placeholder ??
          "# Write your GraphQL query here\nquery GetUsers {\n  users { id name }\n}"
        }
        readOnly={readOnly}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: !readOnly,
        }}
        className="text-sm"
      />
    </div>
  )
}
