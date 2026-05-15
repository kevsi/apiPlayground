import { EmptyPlaceholder } from "@/components/empty-placeholder"
import { Key } from "lucide-react"

export default function ApiKeysPage() {
  return (
    <EmptyPlaceholder
      title="API Keys"
      description="Manage your API keys, generate new ones, and configure access permissions for your team."
      icon={Key}
      activePage="api-keys"
    />
  )
}
