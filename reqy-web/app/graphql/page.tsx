"use client"
import { ApiSidebar } from "@/components/api-sidebar"
import { ApiHeader } from "@/components/api-header"
import { Code2 } from "lucide-react"

export default function GraphqlPage() {
  return (
    <div className="flex h-screen">
      <ApiSidebar />
      <div className="flex-1 flex flex-col">
        <ApiHeader />
        <main className="flex-1 overflow-auto p-6" data-testid="graphql-page">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <Code2 className="w-6 h-6 text-purple-500" />
              <h1 className="text-2xl font-bold">GraphQL Explorer</h1>
            </div>
            <p className="text-muted-foreground mb-6">
              Schema tree-view, saved queries, query editor and response in large format.
            </p>
            <div className="border rounded-lg p-8 bg-card text-center">
              <Code2 className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
              <h2 className="text-lg font-semibold mb-2">Coming soon</h2>
              <p className="text-sm text-muted-foreground">
                The GraphQL Explorer is being built. For now, you can use GraphQL via the
                REST/GraphQL tabs in the request editor.
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
