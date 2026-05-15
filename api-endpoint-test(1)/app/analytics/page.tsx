import { EmptyPlaceholder } from "@/components/empty-placeholder"
import { BarChart3 } from "lucide-react"

export default function AnalyticsPage() {
  return (
    <EmptyPlaceholder
      title="Analytics"
      description="View detailed statistics, response times, and usage metrics for your API requests."
      icon={BarChart3}
      activePage="analytics"
    />
  )
}
