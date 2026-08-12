import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  TrendingUp,
  BarChart3,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  Building2,
} from "lucide-react"

// --- Helper Formatters ---
const formatCurrency = (val: number) => {
  if (val === undefined || val === null) return "₹0"
  if (Math.abs(val) >= 1_000_000) return `₹${(val / 1_000_000).toFixed(1)}M`
  if (Math.abs(val) >= 1_000) return `₹${(val / 1_000).toFixed(1)}k`
  return `₹${val.toLocaleString("en-IN")}`
}

const formatVolume = (val: number) => {
  if (!val) return "0"
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}k`
  return val.toString()
}

// ==========================================
// 1. PriceChartComponent
// ==========================================
export interface PriceChartProps {
  symbol?: string
  period?: string
  points?: Array<{
    date: string
    open: number
    high: number
    low: number
    close: number
    volume: number
  }>
}

export function PriceChartComponent({ symbol, period, points = [] }: PriceChartProps) {
  if (!points || points.length === 0) return null

  const latestPoint = points[points.length - 1]
  const firstPoint = points[0]
  const priceChange = latestPoint.close - firstPoint.close
  const priceChangePct = firstPoint.close
    ? (priceChange / firstPoint.close) * 100
    : 0
  const isPositive = priceChange >= 0

  return (
    <div className="bg-white border-2 border-[#27272A] shadow-[3px_3px_0px_#27272A] rounded-xl p-4 space-y-3 my-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-[#27272A] pb-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded bg-amber-200 border-2 border-[#27272A] flex items-center justify-center text-[#27272A]">
            <TrendingUp className="h-4 w-4 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display font-extrabold text-sm text-[#27272A]">
                {symbol || "Stock"} Price History
              </h3>
              {period && (
                <span className="px-2 py-0.5 rounded bg-[#FAF6F0] border border-[#27272A] text-[10px] font-bold text-[#27272A]">
                  {period}
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-500 font-mono">
              Historical OHLCV Chart
            </p>
          </div>
        </div>

        <div className="text-right">
          <div className="text-sm font-extrabold font-mono text-[#27272A]">
            {formatCurrency(latestPoint.close)}
          </div>
          <div
            className={`text-[11px] font-bold flex items-center justify-end gap-0.5 ${
              isPositive ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {isPositive ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            <span>
              {isPositive ? "+" : ""}
              {priceChange.toFixed(2)} ({isPositive ? "+" : ""}
              {priceChangePct.toFixed(2)}%)
            </span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-64 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2563EB" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "#52525B" }}
              tickLine={false}
            />
            <YAxis
              yAxisId="price"
              domain={["auto", "auto"]}
              tick={{ fontSize: 10, fill: "#52525B" }}
              tickFormatter={(v) => `₹${v}`}
              tickLine={false}
            />
            <YAxis
              yAxisId="volume"
              orientation="right"
              tick={{ fontSize: 10, fill: "#94A3B8" }}
              tickFormatter={formatVolume}
              tickLine={false}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload
                  return (
                    <div className="bg-white border-2 border-[#27272A] shadow-[2px_2px_0px_#27272A] p-2.5 rounded-lg text-[11px] font-mono space-y-1">
                      <div className="font-extrabold border-b border-gray-200 pb-1 text-[#27272A]">
                        📅 {data.date}
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 pt-0.5 text-[#27272A]">
                        <span>Close: <strong className="text-[#2563EB]">₹{data.close}</strong></span>
                        <span>Open: ₹{data.open}</span>
                        <span>High: ₹{data.high}</span>
                        <span>Low: ₹{data.low}</span>
                        <span className="col-span-2 text-gray-500 pt-0.5">
                          Vol: {data.volume?.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )
                }
                return null
              }}
            />
            <Bar
              yAxisId="volume"
              dataKey="volume"
              fill="#CBD5E1"
              opacity={0.5}
              barSize={12}
            />
            <Area
              yAxisId="price"
              type="monotone"
              dataKey="close"
              stroke="#2563EB"
              strokeWidth={2.5}
              fill="url(#priceGradient)"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ==========================================
// 2. QuarterlyGrowthComponent
// ==========================================
export interface GrowthChartProps {
  symbol?: string
  quarters?: string[]
  revenue?: number[]
  netIncome?: number[]
  yoyGrowthPct?: number[]
  qoqGrowthPct?: number[]
}

export function QuarterlyGrowthComponent({
  symbol,
  quarters = [],
  revenue = [],
  netIncome = [],
  yoyGrowthPct = [],
  qoqGrowthPct = [],
}: GrowthChartProps) {
  if (!quarters || quarters.length === 0) return null

  // Filter out zero/null values and keep only meaningful data points
  const data = quarters
    .map((q, i) => ({
      quarter: q,
      revenue: revenue[i] ?? 0,
      netIncome: netIncome[i] ?? 0,
      yoyGrowthPct: yoyGrowthPct[i] ?? 0,
      qoqGrowthPct: qoqGrowthPct[i] ?? 0,
    }))
    .filter(d => d.revenue !== 0 || d.netIncome !== 0)

  const latestYoY = yoyGrowthPct[yoyGrowthPct.length - 1] ?? 0
  const latestRev = revenue[revenue.length - 1] ?? 0

  return (
    <div className="bg-white border-2 border-[#27272A] shadow-[3px_3px_0px_#27272A] rounded-xl p-4 space-y-3 my-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-[#27272A] pb-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded bg-emerald-200 border-2 border-[#27272A] flex items-center justify-center text-[#27272A]">
            <BarChart3 className="h-4 w-4 stroke-[2.5]" />
          </div>
          <div>
            <h3 className="font-display font-extrabold text-sm text-[#27272A]">
              Quarterly Revenue & Net Income {symbol ? `(${symbol})` : ""}
            </h3>
            <p className="text-[11px] text-gray-500 font-mono">
              Financial Growth Trajectory (YoY / QoQ)
            </p>
          </div>
        </div>

        <div className="text-right">
          <div className="text-xs font-extrabold text-[#27272A] font-mono">
            Latest Rev: {formatCurrency(latestRev)}
          </div>
          <div className="text-[11px] font-bold text-emerald-600">
            YoY Growth: +{latestYoY.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-64 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis
              dataKey="quarter"
              tick={{ fontSize: 10, fill: "#52525B" }}
              tickLine={false}
            />
            <YAxis
              yAxisId="amount"
              tick={{ fontSize: 10, fill: "#52525B" }}
              tickFormatter={(v) => `₹${v}`}
              tickLine={false}
            />
            <YAxis
              yAxisId="pct"
              orientation="right"
              tick={{ fontSize: 10, fill: "#D97706" }}
              tickFormatter={(v) => `${v}%`}
              tickLine={false}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload
                  return (
                    <div className="bg-white border-2 border-[#27272A] shadow-[2px_2px_0px_#27272A] p-2.5 rounded-lg text-[11px] font-mono space-y-1">
                      <div className="font-extrabold border-b border-gray-200 pb-1 text-[#27272A]">
                        📊 {d.quarter}
                      </div>
                      <div className="space-y-0.5 text-[#27272A]">
                        <div>Revenue: <strong className="text-[#2563EB]">₹{d.revenue}</strong></div>
                        <div>Net Income: <strong className="text-emerald-600">₹{d.netIncome}</strong></div>
                        <div>YoY Growth: <strong className="text-amber-600">{d.yoyGrowthPct}%</strong></div>
                        <div>QoQ Growth: <strong className="text-purple-600">{d.qoqGrowthPct}%</strong></div>
                      </div>
                    </div>
                  )
                }
                return null
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: "11px", paddingTop: "6px" }}
            />
            <Bar
              yAxisId="amount"
              dataKey="revenue"
              name="Revenue"
              fill="#2563EB"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              yAxisId="amount"
              dataKey="netIncome"
              name="Net Income"
              fill="#10B981"
              radius={[4, 4, 0, 0]}
            />
            <Line
              yAxisId="pct"
              type="monotone"
              dataKey="yoyGrowthPct"
              name="YoY Growth %"
              stroke="#D97706"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            <Line
              yAxisId="pct"
              type="monotone"
              dataKey="qoqGrowthPct"
              name="QoQ Growth %"
              stroke="#8B5CF6"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ==========================================
// 3. AnalystTargetComponent
// ==========================================
export interface AnalystChartProps {
  symbol?: string
  dates?: string[]
  targetPrices?: number[]
  firms?: string[]
  currentPrice?: number
}

export function AnalystTargetComponent({
  symbol,
  dates = [],
  targetPrices = [],
  firms = [],
  currentPrice = 0,
}: AnalystChartProps) {
  if (!targetPrices || targetPrices.length === 0) return null

  const data = dates.map((d, i) => ({
    date: d,
    targetPrice: targetPrices[i] ?? 0,
    firm: firms[i] || "Analyst",
    currentPrice: currentPrice,
  }))

  const sumTargets = targetPrices.reduce((a, b) => a + b, 0)
  const avgTarget = targetPrices.length ? sumTargets / targetPrices.length : 0
  const upsidePct = currentPrice
    ? ((avgTarget - currentPrice) / currentPrice) * 100
    : 0
  const isPositiveUpside = upsidePct >= 0

  return (
    <div className="bg-white border-2 border-[#27272A] shadow-[3px_3px_0px_#27272A] rounded-xl p-4 space-y-3 my-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-[#27272A] pb-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded bg-sky-200 border-2 border-[#27272A] flex items-center justify-center text-[#27272A]">
            <Target className="h-4 w-4 stroke-[2.5]" />
          </div>
          <div>
            <h3 className="font-display font-extrabold text-sm text-[#27272A]">
              Analyst Price Targets vs Current {symbol ? `(${symbol})` : ""}
            </h3>
            <p className="text-[11px] text-gray-500 font-mono">
              Broker Consensus & Price Forecasts
            </p>
          </div>
        </div>

        <div className="text-right">
          <div className="text-xs font-extrabold text-[#27272A] font-mono">
            Consensus: {formatCurrency(avgTarget)}
          </div>
          <div
            className={`text-[11px] font-bold ${
              isPositiveUpside ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            Upside: {isPositiveUpside ? "+" : ""}
            {upsidePct.toFixed(1)}% vs Current (₹{currentPrice})
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-64 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "#52525B" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#52525B" }}
              tickFormatter={(v) => `₹${v}`}
              domain={["auto", "auto"]}
              tickLine={false}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload
                  return (
                    <div className="bg-white border-2 border-[#27272A] shadow-[2px_2px_0px_#27272A] p-2.5 rounded-lg text-[11px] font-mono space-y-1">
                      <div className="font-extrabold border-b border-gray-200 pb-1 text-[#27272A]">
                        🎯 {d.firm} ({d.date})
                      </div>
                      <div className="space-y-0.5 text-[#27272A]">
                        <div>Target Price: <strong className="text-[#2563EB]">₹{d.targetPrice}</strong></div>
                        <div>Current Price: ₹{d.currentPrice}</div>
                      </div>
                    </div>
                  )
                }
                return null
              }}
            />
            {currentPrice > 0 && (
              <ReferenceLine
                y={currentPrice}
                stroke="#EF4444"
                strokeDasharray="4 4"
                strokeWidth={2}
                label={{
                  value: `Current Price: ₹${currentPrice}`,
                  fill: "#EF4444",
                  fontSize: 10,
                  fontWeight: "bold",
                  position: "top",
                }}
              />
            )}
            <Bar
              dataKey="targetPrice"
              name="Analyst Target"
              fill="#2563EB"
              radius={[4, 4, 0, 0]}
              barSize={20}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ==========================================
// 4. FiiDiiFlowComponent
// ==========================================
export interface FiiDiiChartProps {
  symbol?: string
  dates?: string[]
  fiiNetCr?: number[]
  diiNetCr?: number[]
}

export function FiiDiiFlowComponent({
  symbol,
  dates = [],
  fiiNetCr = [],
  diiNetCr = [],
}: FiiDiiChartProps) {
  if (!dates || dates.length === 0) return null

  const data = dates.map((d, i) => ({
    date: d,
    fiiNetCr: fiiNetCr[i] ?? 0,
    diiNetCr: diiNetCr[i] ?? 0,
    netCombined: (fiiNetCr[i] ?? 0) + (diiNetCr[i] ?? 0),
  }))

  const totalFii = fiiNetCr.reduce((a, b) => a + b, 0)
  const totalDii = diiNetCr.reduce((a, b) => a + b, 0)

  return (
    <div className="bg-white border-2 border-[#27272A] shadow-[3px_3px_0px_#27272A] rounded-xl p-4 space-y-3 my-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-[#27272A] pb-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded bg-purple-200 border-2 border-[#27272A] flex items-center justify-center text-[#27272A]">
            <Building2 className="h-4 w-4 stroke-[2.5]" />
          </div>
          <div>
            <h3 className="font-display font-extrabold text-sm text-[#27272A]">
              FII & DII Institutional Money Flows {symbol ? `(${symbol})` : ""}
            </h3>
            <p className="text-[11px] text-gray-500 font-mono">
              {symbol ? `Per-Stock Activity (₹ Cr)` : `Net Institutional Trading Activity (₹ Cr)`}
            </p>
          </div>
        </div>

        <div className="text-right font-mono">
          <div className="text-xs font-extrabold text-[#2563EB]">
            FII Net: {totalFii >= 0 ? "+" : ""}{totalFii.toLocaleString()} Cr
          </div>
          <div className="text-xs font-extrabold text-amber-600">
            DII Net: {totalDii >= 0 ? "+" : ""}{totalDii.toLocaleString()} Cr
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-64 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "#52525B" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#52525B" }}
              tickFormatter={(v) => `${v}`}
              tickLine={false}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload
                  return (
                    <div className="bg-white border-2 border-[#27272A] shadow-[2px_2px_0px_#27272A] p-2.5 rounded-lg text-[11px] font-mono space-y-1">
                      <div className="font-extrabold border-b border-gray-200 pb-1 text-[#27272A]">
                        🏦 {d.date}
                      </div>
                      <div className="space-y-0.5 text-[#27272A]">
                        <div>FII Net: <strong className="text-[#2563EB]">{d.fiiNetCr} Cr</strong></div>
                        <div>DII Net: <strong className="text-amber-600">{d.diiNetCr} Cr</strong></div>
                        <div className="border-t border-gray-200 pt-1 font-bold">
                          Combined: {d.netCombined} Cr
                        </div>
                      </div>
                    </div>
                  )
                }
                return null
              }}
            />
            <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "6px" }} />
            <ReferenceLine y={0} stroke="#27272A" strokeWidth={1.5} />
            <Bar
              dataKey="fiiNetCr"
              name="FII Net (₹ Cr)"
              fill="#2563EB"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="diiNetCr"
              name="DII Net (₹ Cr)"
              fill="#D97706"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ==========================================
// Parent ChartArtifacts Container
// ==========================================
export interface ChartArtifactsProps {
  priceChart?: PriceChartProps
  growthChart?: GrowthChartProps
  analystChart?: AnalystChartProps
  fiiDiiChart?: FiiDiiChartProps
}

export function ChartArtifacts({
  priceChart,
  growthChart,
  analystChart,
  fiiDiiChart,
}: ChartArtifactsProps) {
  const hasCharts = Boolean(
    priceChart?.points?.length ||
      growthChart?.quarters?.length ||
      analystChart?.targetPrices?.length ||
      fiiDiiChart?.dates?.length
  )

  if (!hasCharts) return null

  return (
    <div className="space-y-4 my-3 w-full">
      {priceChart?.points && priceChart.points.length > 0 && (
        <PriceChartComponent {...priceChart} />
      )}

      {growthChart?.quarters && growthChart.quarters.length > 0 && (
        <QuarterlyGrowthComponent {...growthChart} />
      )}

      {analystChart?.targetPrices && analystChart.targetPrices.length > 0 && (
        <AnalystTargetComponent {...analystChart} />
      )}

      {fiiDiiChart?.dates && fiiDiiChart.dates.length > 0 && (
        <FiiDiiFlowComponent {...fiiDiiChart} />
      )}
    </div>
  )
}
