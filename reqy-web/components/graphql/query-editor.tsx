"use client"
import dynamic from "next/dynamic"
import { javascript } from "@codemirror/lang-javascript"

// CodeMirror is a ~200 KB chunk; only needed when the GraphQL playground is
// open. Lazy-load it so the main bundle stays lean.
const CodeMirror = dynamic(
  () => import("@uiw/react-codemirror").then((m) => m.default),
  { ssr: false, loading: () => null },
)

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  readOnly?: boolean
}

export function QueryEditor({ value, onChange, placeholder, readOnly }: Props) {
  return (
    <div className="border-b bg-muted/10" data-testid="graphql-query-editor">
      <CodeMirror
        value={value}
        height="300px"
        extensions={[javascript()]}
        onChange={(v) => onChange(v)}
        placeholder={placeholder ?? "# Write your GraphQL query here\nquery GetUsers {\n  users { id name }\n}"}
        readOnly={readOnly}
        basicSetup={{ lineNumbers: true, foldGutter: true, autocompletion: false, highlightActiveLine: !readOnly }}
        className="text-sm"
      />
    </div>
  )
}
