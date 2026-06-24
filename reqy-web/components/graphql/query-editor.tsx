"use client"
import CodeMirror from "@uiw/react-codemirror"
import { javascript } from "@codemirror/lang-javascript"

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
