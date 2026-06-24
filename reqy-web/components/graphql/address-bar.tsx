"use client"
import { Send, Square, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

interface Props {
  endpoint: string
  onEndpointChange: (v: string) => void
  onSend: () => void
  onStop?: () => void
  running?: boolean
}

export function GraphqlAddressBar({ endpoint, onEndpointChange, onSend, onStop, running }: Props) {
  return (
    <div className="flex items-center gap-2 border-b p-3 bg-card" data-testid="graphql-address-bar">
      <span className="text-xs font-mono px-2 py-1 bg-primary/10 text-primary rounded">POST</span>
      <Input
        value={endpoint}
        onChange={(e) => onEndpointChange(e.target.value)}
        placeholder="https://api.example.com/graphql"
        className="flex-1 font-mono text-sm"
        data-testid="graphql-endpoint-input"
      />
      {running ? (
        <Button size="sm" variant="destructive" onClick={onStop} data-testid="graphql-stop-button">
          <Square className="w-3 h-3 mr-1" /> Stop
        </Button>
      ) : (
        <Button size="sm" onClick={onSend} data-testid="graphql-send-button">
          {running ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Send className="w-3 h-3 mr-1" />}
          Send
        </Button>
      )}
    </div>
  )
}
