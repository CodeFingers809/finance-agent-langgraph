import { Suspense } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { AlertCircle, BarChart3, Zap, Layers, AlertTriangle } from 'lucide-react'

import { OpenAPI } from '@/client'
import { authHeader } from '@/lib/authFetch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'

interface LangSmithStats {
  total_runs: number
  avg_latency_ms: number
  total_tokens_input: number
  total_tokens_output: number
  error_rate: number
  top_tools: Array<{ name: string; count: number }>
  top_models: Array<{ name: string; count: number }>
  error_message: string | null
}

const getApiUrl = (path: string) => {
  const base = OpenAPI.BASE || 'http://localhost:8000/api/v1'
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base
  const hasApiV1 = cleanBase.includes('/api/v1')
  const prefix = hasApiV1 ? cleanBase : `${cleanBase}/api/v1`
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${prefix}${cleanPath}`
}

const fetchLangSmithStats = async (): Promise<LangSmithStats> => {
  const url = getApiUrl('/agent/admin/langsmith/stats')
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeader()),
    },
  })

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Admin access required')
    }
    throw new Error(`Failed to fetch LangSmith stats: HTTP ${response.status}`)
  }

  const text = await response.text()
  if (!text || !text.trim()) {
    throw new Error('Empty response from server')
  }

  try {
    return JSON.parse(text)
  } catch (err) {
    console.error('LangSmith parse error:', err, 'Response text:', text)
    throw new Error(`Invalid response format: ${err instanceof Error ? err.message : 'Unknown error'}`)
  }
}

function StatCard({
  title,
  value,
  unit,
  icon: Icon,
  description,
}: {
  title: string
  value: number | string
  unit?: string
  icon: React.ReactNode
  description?: string
}) {
  return (
    <Card className="border-2 border-[#27272A] shadow-[2.5px_2.5px_0px_#27272A] bg-white">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-[#27272A]">{title}</CardTitle>
        <div className="text-[#27272A]">{Icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-extrabold text-[#27272A]">
          {typeof value === 'number' ? value.toLocaleString() : value}
          {unit && <span className="text-sm font-normal text-gray-500 ml-1">{unit}</span>}
        </div>
        {description && (
          <p className="text-[11px] text-gray-500 font-medium mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  )
}

function NeubrutalBarChart({
  data,
  barColor = 'bg-[#2563EB]',
}: {
  data: Array<{ name: string; count: number }>
  barColor?: string
}) {
  if (!data || data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-xs font-semibold text-gray-500">
        No execution data available
      </div>
    )
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1)

  return (
    <div className="space-y-3 pt-2">
      {data.map((item, idx) => {
        const pct = Math.round((item.count / maxCount) * 100)
        return (
          <div key={idx} className="space-y-1">
            <div className="flex justify-between text-xs font-mono font-bold text-[#27272A]">
              <span className="truncate max-w-[220px]">{item.name}</span>
              <span className="font-extrabold">
                {item.count} call{item.count !== 1 ? 's' : ''} ({pct}%)
              </span>
            </div>
            <div className="h-3.5 w-full bg-[#F3ECE1] border-2 border-[#27272A] rounded-md overflow-hidden shadow-[1px_1px_0px_#27272A]">
              <div
                className={`h-full ${barColor} transition-all duration-300`}
                style={{ width: `${Math.max(pct, 3)}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function LangSmithDashboardContent() {
  const { data: stats, error } = useSuspenseQuery({
    queryKey: ['langsmith-stats'],
    queryFn: fetchLangSmithStats,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: 1,
  })

  if (error) {
    return (
      <Alert variant="destructive" className="border-2 border-[#27272A] shadow-[2.5px_2.5px_0px_#27272A]">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          {error instanceof Error ? error.message : 'Failed to load LangSmith stats'}
        </AlertDescription>
      </Alert>
    )
  }

  if (!stats) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  const hasError = stats.error_message
  const totalTokens = stats.total_tokens_input + stats.total_tokens_output

  return (
    <div className="space-y-6">
      {hasError && (
        <Alert className="border-2 border-[#27272A] shadow-[2.5px_2.5px_0px_#27272A] bg-amber-50">
          <AlertCircle className="h-4 w-4 text-amber-700" />
          <AlertDescription className="text-xs font-bold text-amber-900">{stats.error_message}</AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          title="Total Runs"
          value={stats.total_runs}
          icon={<Layers className="h-4 w-4" />}
          description="Last 7 days"
        />
        <StatCard
          title="Avg Latency"
          value={stats.avg_latency_ms.toFixed(0)}
          unit="ms"
          icon={<Zap className="h-4 w-4" />}
          description="Per execution"
        />
        <StatCard
          title="Total Tokens"
          value={totalTokens.toLocaleString()}
          icon={<BarChart3 className="h-4 w-4" />}
          description={`${stats.total_tokens_input.toLocaleString()} in, ${stats.total_tokens_output.toLocaleString()} out`}
        />
        <StatCard
          title="Error Rate"
          value={stats.error_rate.toFixed(1)}
          unit="%"
          icon={<AlertTriangle className="h-4 w-4" />}
          description="Failed runs"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Top Tools */}
        <Card className="border-2 border-[#27272A] shadow-[3px_3px_0px_#27272A] bg-white">
          <CardHeader>
            <CardTitle className="text-base font-extrabold text-[#27272A]">Top Tools</CardTitle>
            <CardDescription className="text-xs text-gray-500">Most frequently called tool functions</CardDescription>
          </CardHeader>
          <CardContent>
            <NeubrutalBarChart data={stats.top_tools} barColor="bg-[#2563EB]" />
          </CardContent>
        </Card>

        {/* Top Models */}
        <Card className="border-2 border-[#27272A] shadow-[3px_3px_0px_#27272A] bg-white">
          <CardHeader>
            <CardTitle className="text-base font-extrabold text-[#27272A]">Top Models</CardTitle>
            <CardDescription className="text-xs text-gray-500">Most used LLM model endpoints</CardDescription>
          </CardHeader>
          <CardContent>
            <NeubrutalBarChart data={stats.top_models} barColor="bg-[#8B5CF6]" />
          </CardContent>
        </Card>
      </div>

      {/* Info */}
      <Card className="bg-amber-50/70 border-2 border-[#27272A] shadow-[2.5px_2.5px_0px_#27272A]">
        <CardHeader>
          <CardTitle className="text-xs font-extrabold text-[#27272A] uppercase">About LangSmith Telemetry</CardTitle>
          <CardDescription className="text-xs text-[#52525B] leading-relaxed">
            LangSmith tracing tracks token usage, latency, and tool invocations across all conversations. Stats refresh automatically every 5 minutes.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

export function LangSmithDashboard() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-24 w-full bg-amber-100" />
          <Skeleton className="h-64 w-full bg-amber-100" />
        </div>
      }
    >
      <LangSmithDashboardContent />
    </Suspense>
  )
}
