import { Suspense } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { AlertCircle, BarChart3, Zap, Layers, AlertTriangle } from 'lucide-react'

import { OpenAPI } from '@/client'
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

const fetchLangSmithStats = async (): Promise<LangSmithStats> => {
  const response = await fetch(`${OpenAPI.BASE}/agent/admin/langsmith/stats`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${localStorage.getItem('access_token') || ''}`,
    },
  })

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Admin access required')
    }
    throw new Error(`Failed to fetch LangSmith stats: ${response.status}`)
  }

  try {
    const text = await response.text()
    if (!text) {
      throw new Error('Empty response from server')
    }
    return JSON.parse(text)
  } catch (err) {
    console.error('LangSmith parse error:', err)
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="text-muted-foreground">{Icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {typeof value === 'number' ? value.toLocaleString() : value}
          {unit && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  )
}

function LangSmithDashboardContent() {
  const { data: stats, error } = useSuspenseQuery({
    queryKey: ['langsmith-stats'],
    queryFn: fetchLangSmithStats,
    staleTime: 5 * 60 * 1000, // 5 minutes — cache fresh for 5 min
    gcTime: 10 * 60 * 1000, // 10 minutes — keep in memory for 10 min
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 min only if visible
    retry: 1,
  })

  if (error) {
    return (
      <Alert variant="destructive">
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
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{stats.error_message}</AlertDescription>
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
          description={`${stats.total_tokens_input.toLocaleString()} input, ${stats.total_tokens_output.toLocaleString()} output`}
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
        <Card>
          <CardHeader>
            <CardTitle>Top Tools</CardTitle>
            <CardDescription>Most frequently called tools</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.top_tools.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={stats.top_tools}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No tool data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Models */}
        <Card>
          <CardHeader>
            <CardTitle>Top Models</CardTitle>
            <CardDescription>Most used LLM models</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.top_models.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={stats.top_models}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8b5cf6" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No model data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Info */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-sm">About This Dashboard</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            • Data aggregated from LangSmith project over the last 7 days
          </p>
          <p>
            • Stats are cached for 5 minutes to optimize free-tier quota usage
          </p>
          <p>
            • Only research mode and portfolio operations are traced to minimize data volume
          </p>
          <p>
            • Auto-refreshes every 30 seconds
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export function LangSmithDashboard() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <LangSmithDashboardContent />
    </Suspense>
  )
}
