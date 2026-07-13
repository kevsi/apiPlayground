"use client";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";

interface Props {
  preRequestScript?: string;
  postResponseScript?: string;
  onPreChange: (next: string) => void;
  onPostChange: (next: string) => void;
}

export function ScriptEditor({
  preRequestScript,
  postResponseScript,
  onPreChange,
  onPostChange,
}: Props) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel className="text-xs">Pre-request script (JS, sandboxed)</FieldLabel>
        <textarea
          value={preRequestScript ?? ""}
          onChange={(e) => onPreChange(e.target.value)}
          placeholder="// pm.environment.set('token', 'abc123')"
          className="w-full h-32 px-2 py-1.5 text-xs font-mono border rounded bg-muted/30"
          spellCheck={false}
        />
      </Field>
      <Field>
        <FieldLabel className="text-xs">Post-response script (JS, sandboxed)</FieldLabel>
        <textarea
          value={postResponseScript ?? ""}
          onChange={(e) => onPostChange(e.target.value)}
          placeholder="// pm.expect(pm.response.code).to.equal(200)"
          className="w-full h-32 px-2 py-1.5 text-xs font-mono border rounded bg-muted/30"
          spellCheck={false}
        />
      </Field>
    </FieldGroup>
  );
}
