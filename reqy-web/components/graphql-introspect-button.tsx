"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, RefreshCw } from "lucide-react"
import { introspectSchema, endpointHash } from "@/lib/graphql/introspect"

interface Props {
  endpoint: string
  onSchemaFetched?: (sdl: string, hash: string) => void
}

export function GraphQLIntrospectButton({ endpoint, onSchemaFetched }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setLoading(true)
    setError(null)
    try {
      const sdl = await introspectSchema(endpoint)
      const hash = endpointHash(endpoint)
      onSchemaFetched?.(sdl, hash)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Introspection failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={run}
        disabled={loading || !endpoint}
      >
        {loading ? (
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
        ) : (
          <RefreshCw className="w-3 h-3 mr-1" />
        )}
        Introspect schema
      </Button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  )
}
