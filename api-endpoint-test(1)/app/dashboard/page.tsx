"use client"

import { useMemo, useState } from "react"
import {
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Play,
  Zap,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Server,
} from "lucide-react"
import { ApiSidebar } from "@/components/api-sidebar"
import { ApiHeader } from "@/components/api-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ThemeSwitcher } from "@/components/theme-switcher"
import { useSidebar } from "@/contexts/sidebar-context"
import { cn } from "@/lib/utils"
import { useRequestStore, type HistoryItem } from "@/hooks/use-request-store"
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

const CHART_MARGIN = { top: 10, right: 10, left: -10, bottom: 0 } as const
const ERROR_RATE_DOMAIN = [0, 100] as const
const CHART_DOT = { r: 3 } as const

const methodColors: Record<string, string> = {
  GET: "bg-emerald-100 text-emerald-700",
  POST: "bg-blue-100 text-blue-700",
  PUT: "bg-amber-100 text-amber-700",
  DELETE: "bg-red-100 text-red-700",
  PATCH: "bg-purple-100 text-purple-700",
}

const _statusColors: Record<string, string> = {
  healthy: "text-emerald-600",
  warning: "text-amber-600",
  critical: "text-red-600",
}

const formatDayLabel = (date: Date) => {
  return `${date.getDate()}/${date.getMonth() + 1}`
}

const buildLastSevenDays = () => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (6 - index))
    return {
      key: date.toISOString().slice(0, 10),
      label: formatDayLabel(date),
      count: 0,
      errors: 0,
      avgTime: 0,
    }
  })
}

const buildRecentRequests = (history: HistoryItem[]) =>
  [...history]
    .sort((a, b) => b.executedAt - a.executedAt)
    .slice(0, 6)
    .map((request) => ({
      method: request.method,
      endpoint: request.endpoint || request.url,
      status: request.responseStatus ?? 0,
      time: request.responseTime != null ? `${request.responseTime}ms` : "-",
      timestamp: request.executedAt ? `${Math.round((Date.now() - request.executedAt) / 60000)} min ago` : "-",
    }))

const buildTopSlowEndpoints = (history: HistoryItem[]) => {
  const stats = history.reduce<Record<string, { totalTime: number; count: number; lastStatus: number }>>((acc, item) => {
    const endpoint = item.endpoint || item.url || "Unknown"
    if (item.responseTime == null) return acc
    const existing = acc[endpoint] ?? { totalTime: 0, count: 0, lastStatus: 0 }
    existing.totalTime += item.responseTime
    existing.count += 1
    existing.lastStatus = item.responseStatus ?? existing.lastStatus
    acc[endpoint] = existing
    return acc
  }, {})

  return Object.entries(stats)
    .map(([endpoint, data]) => ({
      endpoint,
      requests: data.count,
      avgTime: Math.round(data.totalTime / data.count),
      status: data.lastStatus >= 500 ? "critical" : data.lastStatus >= 400 ? "warning" : "healthy",
    }))
    .sort((a, b) => b.avgTime - a.avgTime)
    .slice(0, 5)
}

export default function DashboardPage() {
  const { history } = useRequestStore()
  const { isCollapsed, toggleSidebar } = useSidebar()
  const [isSlowEndpointsOpen, setIsSlowEndpointsOpen] = useState(false)
  const [isRecentRequestsOpen, setIsRecentRequestsOpen] = useState(false)

  const recentRequests = useMemo(() => buildRecentRequests(history), [history])

  const stats = useMemo(() => {
    const totalRequests = history.length
    const successfulRequests = history.filter((item) => item.responseStatus != null && item.responseStatus < 400).length
    const avgResponseTime = history.length
      ? Math.round(history.reduce((sum, item) => sum + (item.responseTime ?? 0), 0) / history.length)
      : 0
    const activeEndpoints = new Set(history.map((item) => item.endpoint || item.url)).size
    const successRate = totalRequests ? +(successfulRequests / totalRequests * 100).toFixed(1) : 0

    return [
      {
        title: "Total Requests",
        value: totalRequests.toLocaleString(),
        change: "",
        trend: "up",
        icon: Activity,
        description: "Based on stored request history",
      },
      {
        title: "Avg Response Time",
        value: `${avgResponseTime}ms`,
        change: "",
        trend: "up",
        icon: Clock,
        description: "Based on the last 100 requests",
      },
      {
        title: "Success Rate",
        value: `${successRate}%`,
        change: "",
        trend: successRate >= 90 ? "up" : "down",
        icon: CheckCircle2,
        description: "Success ratio over history",
      },
      {
        title: "Active Endpoints",
        value: activeEndpoints.toString(),
        change: "",
        trend: "up",
        icon: Server,
        description: "Unique endpoints called",
      },
    ]
  }, [history])

  const requestsByDay = useMemo(() => {
    const buckets = buildLastSevenDays()
    const indexByKey = Object.fromEntries(buckets.map((bucket, index) => [bucket.key, index]))

    history.forEach((item) => {
      const executed = new Date(item.executedAt)
      const key = executed.toISOString().slice(0, 10)
      const bucketIndex = indexByKey[key]
      if (bucketIndex === undefined) return
      buckets[bucketIndex].count += 1
      if (item.responseStatus != null && item.responseStatus >= 400) {
        buckets[bucketIndex].errors += 1
      }
      buckets[bucketIndex].avgTime += item.responseTime ?? 0
    })

    return buckets.map((bucket) => ({
      label: bucket.label,
      requests: bucket.count,
      errorRate: bucket.count ? +(bucket.errors / bucket.count * 100).toFixed(1) : 0,
      avgTime: bucket.count ? Math.round(bucket.avgTime / bucket.count) : 0,
    }))
  }, [history])

  const topSlowEndpoints = useMemo(() => buildTopSlowEndpoints(history), [history])

  const healthCounts = useMemo(() => {
    const latestByEndpoint = new Map<string, HistoryItem>()
    history.forEach((item) => {
      const key = item.endpoint || item.url || "Unknown"
      const existing = latestByEndpoint.get(key)
      if (!existing || item.executedAt > existing.executedAt) {
        latestByEndpoint.set(key, item)
      }
    })

    let healthy = 0
    let warning = 0
    let critical = 0

    latestByEndpoint.forEach((item) => {
      if (item.responseStatus == null || item.responseStatus < 400) healthy += 1
      else if (item.responseStatus < 500) warning += 1
      else critical += 1
    })

    return { healthy, warning, critical }
  }, [history])

  const isEmpty = history.length === 0

  return (
    <div className="flex min-h-screen bg-background bg-dot-pattern">
      <ApiSidebar activePage="dashboard" collapsed={isCollapsed} onCollapse={toggleSidebar} />

      <div className={cn(
          "flex flex-1 flex-col overflow-hidden transition-[margin] duration-200 ease-out",
        isCollapsed ? "ml-[60px]" : "ml-64",
        "max-[916px]:ml-[60px]"
      )}>
        <ApiHeader />

        <main className="flex-1 overflow-auto p-6 scrollbar-thin bg-dot-pattern">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
              <p className="text-sm text-muted-foreground">
                Overview of your API performance and activity
              </p>
            </div>
            <ThemeSwitcher />
          </div>

          {isEmpty ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Activity className="mb-4 size-12 text-muted-foreground/40" />
              <h2 className="text-xl font-semibold text-foreground">No data yet</h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Start sending API requests to see your dashboard metrics, charts, and endpoint performance.
              </p>
              <a
                href="/"
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Play className="size-4" />
                Go to API Endpoints
              </a>
            </div>
          ) : (
          <>

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

          <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
            <div className="grid gap-6">
              <Card className="bg-card">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base font-semibold text-foreground">
                    Request volume (last 7 days)
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={requestsByDay} margin={CHART_MARGIN}>
                      <defs>
                        <linearGradient id="requestsGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      {/* @ts-expect-error recharts 2.x + React 19 incompatibility */}
                      <XAxis dataKey="label" stroke="#9ca3af" />
                      {/* @ts-expect-error recharts 2.x + React 19 incompatibility */}
                      <YAxis stroke="#9ca3af" />
                      {/* @ts-expect-error recharts 2.x + React 19 incompatibility */}
                      <Tooltip formatter={(value) => [value, "Requests"]} />
                      {/* @ts-expect-error recharts 2.x + React 19 incompatibility */}
                      <Area type="monotone" dataKey="requests" stroke="#22c55e" fill="url(#requestsGradient)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="bg-card">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base font-semibold text-foreground">
                    Error rate (last 7 days)
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={requestsByDay} margin={CHART_MARGIN}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      {/* @ts-expect-error recharts 2.x + React 19 incompatibility */}
                      <XAxis dataKey="label" stroke="#9ca3af" />
                      {/* @ts-expect-error recharts 2.x + React 19 incompatibility */}
                      <YAxis stroke="#9ca3af" domain={ERROR_RATE_DOMAIN} />
                      {/* @ts-expect-error recharts 2.x + React 19 incompatibility */}
                      <Tooltip formatter={(value) => [`${value}%`, "Error rate"]} />
                      {/* @ts-expect-error recharts 2.x + React 19 incompatibility */}
                      <Line type="monotone" dataKey="errorRate" stroke="#f97316" strokeWidth={2} dot={CHART_DOT} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-card">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base font-semibold text-foreground">
                  Slowest endpoints
                </CardTitle>
                <button
                  className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setIsSlowEndpointsOpen(true)}
                >
                  See more
                </button>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {topSlowEndpoints.map((endpoint, index) => (
                    <div key={endpoint.endpoint} className="rounded-lg border border-border bg-background p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{endpoint.endpoint}</p>
                          <p className="text-xs text-muted-foreground">{endpoint.requests} requests</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-foreground">{endpoint.avgTime}ms</p>
                          <p className="text-xs text-muted-foreground">avg response</p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-xs font-medium">
                        <span className={`rounded-full px-2 py-1 ${endpoint.status === "healthy" ? "bg-emerald-100 text-emerald-700" : endpoint.status === "warning" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                          {endpoint.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2 mt-6">
            <Card className="bg-card">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base font-semibold text-foreground">
                  Recent requests
                </CardTitle>
                <button
                  className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setIsRecentRequestsOpen(true)}
                >
                  See more
                </button>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recentRequests.map((request, index) => (
                    <div key={index} className="flex items-center justify-between rounded-lg border border-border bg-background p-3">
                      <div className="flex items-center gap-3">
                        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${methodColors[request.method]}`}>
                          {request.method}
                        </span>
                        <span className="font-mono text-sm text-foreground truncate">
                          {request.endpoint}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`text-sm font-medium ${request.status >= 400 ? "text-red-600" : "text-emerald-600"}`}>
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

            <Card className="bg-card">
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
                    <div className="flex size-12 items-center justify-center rounded-full bg-emerald-100 overflow-hidden">
                      <Server className="size-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">{healthCounts.healthy}</p>
                      <p className="text-sm text-muted-foreground">Healthy Endpoints</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 rounded-lg border border-border bg-background p-4">
                    <div className="flex size-12 items-center justify-center rounded-full bg-amber-100 overflow-hidden">
                      <AlertTriangle className="size-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">{healthCounts.warning}</p>
                      <p className="text-sm text-muted-foreground">Warning Endpoints</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 rounded-lg border border-border bg-background p-4">
                    <div className="flex size-12 items-center justify-center rounded-full bg-red-100 overflow-hidden">
                      <TrendingUp className="size-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">{healthCounts.critical}</p>
                      <p className="text-sm text-muted-foreground">Critical Endpoints</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Dialog open={isSlowEndpointsOpen} onOpenChange={setIsSlowEndpointsOpen}>
            <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden p-0">
              <div className="h-full rounded-lg bg-card">
                <div className="border-b px-6 py-4">
                  <DialogHeader className="text-left">
                    <DialogTitle>Slowest endpoints</DialogTitle>
                  </DialogHeader>
                </div>
                <div className="overflow-auto p-6 space-y-4">
                  {topSlowEndpoints.map((endpoint) => (
                    <div key={endpoint.endpoint} className="rounded-lg border border-border bg-background p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{endpoint.endpoint}</p>
                          <p className="text-xs text-muted-foreground">{endpoint.requests} requests</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-foreground">{endpoint.avgTime}ms</p>
                          <p className="text-xs text-muted-foreground">avg response</p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-xs font-medium">
                        <span className={`rounded-full px-2 py-1 ${endpoint.status === "healthy" ? "bg-emerald-100 text-emerald-700" : endpoint.status === "warning" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                          {endpoint.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isRecentRequestsOpen} onOpenChange={setIsRecentRequestsOpen}>
            <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden p-0">
              <div className="h-full rounded-lg bg-card">
                <div className="border-b px-6 py-4">
                  <DialogHeader className="text-left">
                    <DialogTitle>Recent requests</DialogTitle>
                  </DialogHeader>
                </div>
                <div className="overflow-auto p-6 space-y-3">
                  {recentRequests.map((request, index) => (
                    <div key={index} className="flex items-center justify-between rounded-lg border border-border bg-background p-3">
                      <div className="flex items-center gap-3">
                        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${methodColors[request.method]}`}>
                          {request.method}
                        </span>
                        <span className="font-mono text-sm text-foreground truncate">{request.endpoint}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`text-sm font-medium ${request.status >= 400 ? "text-red-600" : "text-emerald-600"}`}>
                          {request.status}
                        </span>
                        <span className="text-xs text-muted-foreground">{request.time}</span>
                        <span className="text-xs text-muted-foreground">{request.timestamp}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </DialogContent>
          </Dialog>
          </>
          )}
        </main>
      </div>
    </div>
  )
}
