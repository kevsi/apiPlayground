"use client"
import { ApiSidebar } from "@/components/api-sidebar"
import { ApiHeader } from "@/components/api-header"
import { Play } from "lucide-react"

export default function RunnerPage() {
  return (
    <div className="flex h-screen">
      <ApiSidebar />
      <div className="flex-1 flex flex-col">
        <ApiHeader />
        <main className="flex-1 overflow-auto p-6" data-testid="runner-page">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <Play className="w-6 h-6 text-blue-500" />
              <h1 className="text-2xl font-bold">Collection Runner</h1>
            </div>
            <p className="text-muted-foreground mb-6">
              Run collections with assertions, scripts, data-driven tests, and JUnit export.
            </p>
            <div className="border rounded-lg p-8 bg-card text-center">
              <Play className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
              <h2 className="text-lg font-semibold mb-2">Coming soon</h2>
              <p className="text-sm text-muted-foreground">
                The full runner dashboard is being built. For now, you can run collections
                from the <strong>Collections</strong> page.
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
