"use client"
import { Label } from "@/components/ui/label"

interface Props {
  preRequestScript?: string
  postResponseScript?: string
  onPreChange: (next: string) => void
  onPostChange: (next: string) => void
}

export function ScriptEditor({ preRequestScript, postResponseScript, onPreChange, onPostChange }: Props) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Pre-request script (JS, sandboxed)</Label>
        <textarea
          value={preRequestScript ?? ""}
          onChange={(e) => onPreChange(e.target.value)}
          placeholder="// pm.environment.set('token', 'abc123')"
          className="w-full h-32 px-2 py-1.5 text-xs font-mono border rounded bg-muted/30"
          spellCheck={false}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Post-response script (JS, sandboxed)</Label>
        <textarea
          value={postResponseScript ?? ""}
          onChange={(e) => onPostChange(e.target.value)}
          placeholder="// pm.expect(pm.response.code).to.equal(200)"
          className="w-full h-32 px-2 py-1.5 text-xs font-mono border rounded bg-muted/30"
          spellCheck={false}
        />
      </div>
    </div>
  )
}
