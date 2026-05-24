import { EmptyPlaceholder } from "@/components/empty-placeholder"
import { FileText } from "lucide-react"

export default function DocumentationPage() {
  return (
    <EmptyPlaceholder
      title="Documentation"
      description="Generate, view, and export API documentation based on your collections."
      icon={<FileText className="size-10" />}
      activePage="documentation"
    />
  )
}
