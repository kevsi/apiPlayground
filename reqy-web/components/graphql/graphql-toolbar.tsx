"use client"
import { RefreshCw, BookOpen, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PrettifyButton } from "./prettify-button"

interface Props {
  onIntrospect: () => void
  onToggleSchema: () => void
  onPrettify: () => void
  schemaOpen: boolean
  introspecting: boolean
  canPrettify: boolean
}

export function GraphqlToolbar({
  onIntrospect,
  onToggleSchema,
  onPrettify,
  schemaOpen,
  introspecting,
  canPrettify,
}: Props) {
  return (
    <div className="flex items-center gap-2 p-2 border-b bg-muted/20 flex-wrap" data-testid="graphql-toolbar">
      <Button
        variant="outline"
        size="sm"
        onClick={onIntrospect}
        disabled={introspecting}
        data-testid="graphql-introspect-button"
      >
        {introspecting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
        Refresh Schema
      </Button>
      <Button
        variant={schemaOpen ? "default" : "outline"}
        size="sm"
        onClick={onToggleSchema}
        data-testid="graphql-toggle-schema"
      >
        <BookOpen className="w-3 h-3 mr-1" />
        {schemaOpen ? "Hide" : "Show"} Schema
      </Button>
      <PrettifyButton onClick={onPrettify} disabled={!canPrettify} />
    </div>
  )
}
