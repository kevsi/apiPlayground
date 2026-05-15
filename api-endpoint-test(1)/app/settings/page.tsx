import { EmptyPlaceholder } from "@/components/empty-placeholder"
import { Settings } from "lucide-react"

export default function SettingsPage() {
  return (
    <EmptyPlaceholder
      title="Settings"
      description="Configure workspace preferences, theme, shortcuts, and profile settings."
      icon={Settings}
      activePage="settings"
    />
  )
}
