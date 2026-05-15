"use client"

import {
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Zap,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Globe,
  Server,
} from "lucide-react"
import { ApiSidebar } from "@/components/api-sidebar"
import { ApiHeader } from "@/components/api-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ThemeSwitcher } from "@/components/theme-switcher"

const stats = [
  {
    title: "Total Requests",
    value: "1.2M",
    change: "+12.5%",
    trend: "up",
    icon: Activity,
    description: "vs last month",
  },
  {
    title: "Avg Response Time",
    value: "124ms",
    change: "-8.2%",
    trend: "up",
    icon: Clock,
    description: "vs last month",
  },
  {
    title: "Success Rate",
    value: "99.8%",
    change: "+0.3%",
    trend: "up",
    icon: CheckCircle2,
    description: "vs last month",
  },
  {
    title: "Active Endpoints",
    value: "48",
    change: "+5",
    trend: "up",
    icon: Zap,
    description: "new this month",
  },
]

const recentRequests = [
  { method: "GET", endpoint: "/api/v1/users", status: 200, time: "124ms", timestamp: "2 min ago" },
  { method: "POST", endpoint: "/api/v1/auth/login", status: 200, time: "89ms", timestamp: "5 min ago" },
  { method: "PUT", endpoint: "/api/v1/users/123", status: 200, time: "156ms", timestamp: "8 min ago" },
  { method: "DELETE", endpoint: "/api/v1/posts/456", status: 204, time: "67ms", timestamp: "12 min ago" },
  { method: "GET", endpoint: "/api/v1/products", status: 500, time: "2.3s", timestamp: "15 min ago" },
  { method: "POST", endpoint: "/api/v1/orders", status: 201, time: "234ms", timestamp: "18 min ago" },
]

const topEndpoints = [
  { endpoint: "/api/v1/users", requests: "245K", avgTime: "98ms", status: "healthy" },
  { endpoint: "/api/v1/auth/login", requests: "189K", avgTime: "112ms", status: "healthy" },
  { endpoint: "/api/v1/products", requests: "156K", avgTime: "145ms", status: "warning" },
  { endpoint: "/api/v1/orders", requests: "98K", avgTime: "234ms", status: "healthy" },
  { endpoint: "/api/v1/analytics", requests: "67K", avgTime: "456ms", status: "critical" },
]

const methodColors: Record<string, string> = {
  GET: "bg-emerald-100 text-emerald-700",
  POST: "bg-blue-100 text-blue-700",
  PUT: "bg-amber-100 text-amber-700",
  DELETE: "bg-red-100 text-red-700",
  PATCH: "bg-purple-100 text-purple-700",
}

const statusColors: Record<string, string> = {
  healthy: "text-emerald-600",
  warning: "text-amber-600",
  critical: "text-red-600",
}

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen bg-background">
      <ApiSidebar activePage="dashboard" />

      <div className="ml-64 flex flex-1 flex-col">
        <ApiHeader />

        <main className="flex-1 overflow-auto p-6">
          {/* Header with Theme Switcher */}
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
              <p className="text-sm text-muted-foreground">
                Overview of your API performance and activity
              </p>
            </div>
            <ThemeSwitcher />
          </div>

          {/* Stats Grid */}
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <Card key={stat.title} className="bg-card">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </CardTitle>
                  <stat.icon className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                  <div className="flex items-center gap-1 text-xs">
                    {stat.trend === "up" ? (
                      <ArrowUpRight className="size-3 text-emerald-600" />
                    ) : (
                      <ArrowDownRight className="size-3 text-red-600" />
                    )}
                    <span className={stat.trend === "up" ? "text-emerald-600" : "text-red-600"}>
                      {stat.change}
                    </span>
                    <span className="text-muted-foreground">{stat.description}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Main Content Grid */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Recent Requests */}
            <Card className="bg-card">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base font-semibold text-foreground">
                  Recent Requests
                </CardTitle>
                <button className="text-xs font-medium text-primary hover:underline">
                  View all
                </button>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recentRequests.map((request, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg border border-border bg-background p-3"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-semibold ${methodColors[request.method]}`}
                        >
                          {request.method}
                        </span>
                        <span className="font-mono text-sm text-foreground">
                          {request.endpoint}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span
                          className={`text-sm font-medium ${
                            request.status >= 400 ? "text-red-600" : "text-emerald-600"
                          }`}
                        >
                          {request.status}
                        </span>
                        <span className="text-xs text-muted-foreground">{request.time}</span>
                        <span className="text-xs text-muted-foreground">{request.timestamp}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Top Endpoints */}
            <Card className="bg-card">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base font-semibold text-foreground">
                  Top Endpoints
                </CardTitle>
                <button className="text-xs font-medium text-primary hover:underline">
                  View all
                </button>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {topEndpoints.map((endpoint, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg border border-border bg-background p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                          <Globe className="size-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-mono text-sm font-medium text-foreground">
                            {endpoint.endpoint}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {endpoint.requests} requests
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm font-medium text-foreground">{endpoint.avgTime}</p>
                          <p className="text-xs text-muted-foreground">avg time</p>
                        </div>
                        <div className={`flex items-center gap-1 ${statusColors[endpoint.status]}`}>
                          {endpoint.status === "healthy" && <CheckCircle2 className="size-4" />}
                          {endpoint.status === "warning" && <AlertTriangle className="size-4" />}
                          {endpoint.status === "critical" && <AlertTriangle className="size-4" />}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* API Health Overview */}
            <Card className="bg-card lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base font-semibold text-foreground">
                  API Health Overview
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="size-2 rounded-full bg-emerald-500" /> Healthy
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="size-2 rounded-full bg-amber-500" /> Warning
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="size-2 rounded-full bg-red-500" /> Critical
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="flex items-center gap-4 rounded-lg border border-border bg-background p-4">
                    <div className="flex size-12 items-center justify-center rounded-full bg-emerald-100">
                      <Server className="size-6 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">42</p>
                      <p className="text-sm text-muted-foreground">Healthy Endpoints</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 rounded-lg border border-border bg-background p-4">
                    <div className="flex size-12 items-center justify-center rounded-full bg-amber-100">
                      <AlertTriangle className="size-6 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">4</p>
                      <p className="text-sm text-muted-foreground">Warning Endpoints</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 rounded-lg border border-border bg-background p-4">
                    <div className="flex size-12 items-center justify-center rounded-full bg-red-100">
                      <TrendingUp className="size-6 text-red-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">2</p>
                      <p className="text-sm text-muted-foreground">Critical Endpoints</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  )
}
