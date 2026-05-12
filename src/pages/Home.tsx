import { ApiSidebar } from "@/components/layout/Sidebar"
import { ApiHeader } from "@/components/layout/Header"
import { RequestTabsManager } from "@/components/request/RequestTabsManager"

export default function ApiTestingDashboard() {
  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <ApiSidebar activePage="api-endpoints" />

      {/* Main Content */}
      <div className="ml-64 flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <ApiHeader />

        {/* Page Content with Tabs Manager */}
        <RequestTabsManager />
      </div>
    </div>
  )
}
