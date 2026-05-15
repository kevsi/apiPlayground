import { EmptyPlaceholder } from "@/components/empty-placeholder"
import { Sparkles } from "lucide-react"

export default function AiInsightsPage() {
  return (
    <EmptyPlaceholder
      title="AI Insights"
      description="Get intelligent suggestions, detect anomalies, and optimize your API endpoints automatically."
      icon={Sparkles}
      activePage="ai-insights"
    />
  )
}
