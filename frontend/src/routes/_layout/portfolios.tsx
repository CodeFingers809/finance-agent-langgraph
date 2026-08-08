import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import {
  DollarSign,
  ExternalLink,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  TrendingUp,
  Zap,
} from "lucide-react"
import { useEffect, useState } from "react"
import { OpenAPI } from "@/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import useCustomToast from "@/hooks/useCustomToast"

export const Route = createFileRoute("/_layout/portfolios")({
  component: PortfoliosPage,
})

interface PortfolioItem {
  id: string
  portfolio_id: string
  symbol: string
  quantity: number
  buy_price: number
  avg_price: number
  bought_at?: string | null
}

interface Portfolio {
  id: string
  name: string
  items: PortfolioItem[]
}

interface PortfolioMetrics {
  total_invested: number
  current_value: number
  total_return: number
  total_return_pct: number
  cagr?: number | null
  sharpe_ratio?: number | null
  sortino_ratio?: number | null
  beta?: number | null
  alpha?: number | null
}

interface StockQuoteData {
  symbol: string
  name: string
  ltp: number
  change_1d_pct: number
}

function PortfoliosPage() {
  const queryClient = useQueryClient()
  const { showErrorToast, showSuccessToast } = useCustomToast()

  // Add stock dialog state
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [symbolSearchInput, setSymbolSearchInput] = useState("")
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [selectedStock, setSelectedStock] = useState<any>(null)
  const [quantity, setQuantity] = useState("")
  const [buyPrice, setBuyPrice] = useState("")
  const [boughtAt, setBoughtAt] = useState("")

  // Edit stock dialog state
  const [editingItem, setEditingItem] = useState<PortfolioItem | null>(null)
  const [editQuantity, setEditQuantity] = useState("")
  const [editBuyPrice, setEditBuyPrice] = useState("")

  const token = localStorage.getItem("access_token")

  // React Query cached portfolio fetch - instant tab switch SPA
  const { data: portfolio = null } = useQuery<Portfolio | null>({
    queryKey: ["portfolio"],
    queryFn: async () => {
      const res = await fetch(`${OpenAPI.BASE}/api/v1/portfolios`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return null
      const data: Portfolio[] = await res.json()
      return data.length > 0 ? data[0] : null
    },
    staleTime: 1000 * 60 * 5,
  })

  // React Query cached metrics fetch
  const { data: metrics = null } = useQuery<PortfolioMetrics | null>({
    queryKey: ["portfolio_metrics", portfolio?.id],
    enabled: !!portfolio?.id,
    queryFn: async () => {
      const res = await fetch(
        `${OpenAPI.BASE}/api/v1/portfolios/${portfolio!.id}/metrics`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      )
      if (!res.ok) return null
      return (await res.json()) as PortfolioMetrics
    },
    staleTime: 1000 * 60 * 5,
  })

  // React Query cached stock quotes fetch
  const itemSymbols = portfolio?.items?.map((i) => i.symbol) || []
  const symbolsKey = itemSymbols.sort().join(",")

  const { data: stockQuotes = {} } = useQuery<Record<string, StockQuoteData>>({
    queryKey: ["stock_quotes", symbolsKey],
    enabled: itemSymbols.length > 0,
    queryFn: async () => {
      const res = await fetch(`${OpenAPI.BASE}/api/v1/utils/stock-quotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: itemSymbols }),
      })
      if (!res.ok) return {}
      return await res.json()
    },
    staleTime: 1000 * 60 * 2,
  })

  // Live stock search API in portfolio add modal
  useEffect(() => {
    if (!symbolSearchInput.trim()) {
      setSearchResults([])
      return
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${OpenAPI.BASE}/api/v1/utils/stock-search?q=${encodeURIComponent(symbolSearchInput.trim())}`,
        )
        if (res.ok) {
          const data = await res.json()
          setSearchResults(data.slice(0, 5))
        }
      } catch (err) {
        console.error("Stock search error", err)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [symbolSearchInput])

  const handleAddStock = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!portfolio || !selectedStock || !quantity || !buyPrice) return

    if (selectedStock.symbol.startsWith("^")) {
      showErrorToast(
        "Indices cannot be added to portfolios. Stock equities only.",
      )
      return
    }

    try {
      const res = await fetch(
        `${OpenAPI.BASE}/api/v1/portfolios/${portfolio.id}/items`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            symbol: selectedStock.symbol,
            quantity: parseFloat(quantity),
            buy_price: parseFloat(buyPrice),
            bought_at: boughtAt.trim() || null,
          }),
        },
      )

      if (res.ok) {
        setSymbolSearchInput("")
        setSelectedStock(null)
        setQuantity("")
        setBuyPrice("")
        setBoughtAt("")
        setIsAddOpen(false)
        showSuccessToast("Stock added to portfolio")
        queryClient.invalidateQueries({ queryKey: ["portfolio"] })
        queryClient.invalidateQueries({ queryKey: ["portfolio_metrics"] })
      } else {
        const errJson = await res.json().catch(() => ({}))
        showErrorToast(errJson.detail || "Failed to add stock holding")
      }
    } catch (_err) {
      showErrorToast("Failed to add stock holding")
    }
  }

  const handleOpenEdit = (item: PortfolioItem) => {
    setEditingItem(item)
    setEditQuantity(String(item.quantity))
    setEditBuyPrice(String(item.buy_price || item.avg_price))
  }

  const handleUpdateStock = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!portfolio || !editingItem || !editQuantity || !editBuyPrice) return

    try {
      const res = await fetch(
        `${OpenAPI.BASE}/api/v1/portfolios/${portfolio.id}/items/${editingItem.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            symbol: editingItem.symbol,
            quantity: parseFloat(editQuantity),
            buy_price: parseFloat(editBuyPrice),
            avg_price: parseFloat(editBuyPrice),
          }),
        },
      )

      if (res.ok) {
        setEditingItem(null)
        showSuccessToast("Holding updated successfully")
        queryClient.invalidateQueries({ queryKey: ["portfolio"] })
        queryClient.invalidateQueries({ queryKey: ["portfolio_metrics"] })
      } else {
        const errJson = await res.json().catch(() => ({}))
        showErrorToast(errJson.detail || "Failed to update holding")
      }
    } catch (_err) {
      showErrorToast("Failed to update stock holding")
    }
  }

  const handleDeleteItem = async (itemId: string) => {
    if (!portfolio) return
    try {
      const res = await fetch(
        `${OpenAPI.BASE}/api/v1/portfolios/${portfolio.id}/items/${itemId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      )
      if (res.ok) {
        showSuccessToast("Holding removed")
        queryClient.invalidateQueries({ queryKey: ["portfolio"] })
        queryClient.invalidateQueries({ queryKey: ["portfolio_metrics"] })
      }
    } catch (_err) {
      showErrorToast("Failed to delete item")
    }
  }

  return (
    <div className="p-4 md:p-8 space-y-6 bg-[#FAF6F0] text-[#27272A] min-h-full">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b-2 border-[#27272A] pb-4">
        <div>
          <h1 className="text-3xl font-display font-extrabold text-[#27272A] tracking-tight">
            {portfolio ? portfolio.name : "Portfolio Holdings"}
          </h1>
          <p className="text-xs text-[#52525B]">
            Track investment performance, individual stock returns, and
            risk-adjusted metrics
          </p>
        </div>

        {/* Add Stock Dialog Trigger */}
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button className="neubrutal-btn-primary gap-2 text-xs">
              <Plus className="h-4 w-4" /> Add Stock Holding
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-white border-2 border-[#27272A] shadow-[4px_4px_0px_#27272A] sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display font-extrabold text-lg text-[#27272A]">
                Add Stock Holding
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleAddStock} className="space-y-4 pt-2">
              <div className="space-y-1.5 relative">
                <Label className="text-xs font-bold text-[#27272A]">
                  Search Stock (NSE/BSE Only)
                </Label>
                <div className="relative">
                  <Input
                    placeholder="e.g. RELIANCE, MAZDOCK, TCS..."
                    value={symbolSearchInput}
                    onChange={(e) => setSymbolSearchInput(e.target.value)}
                    className="border-2 border-[#27272A] shadow-[2px_2px_0px_#27272A] text-xs font-bold pl-8"
                  />
                  <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-[#52525B]" />
                </div>

                {/* Dropdown search results */}
                {searchResults.length > 0 && (
                  <div className="absolute top-full left-0 w-full bg-white border-2 border-[#27272A] shadow-[3px_3px_0px_#27272A] rounded-lg mt-1 z-50 divide-y divide-gray-200 overflow-hidden">
                    {searchResults.map((item) => (
                      <div
                        key={item.symbol}
                        onClick={() => {
                          setSelectedStock(item)
                          setSymbolSearchInput(item.symbol)
                          setSearchResults([])
                        }}
                        className="p-2.5 hover:bg-amber-100 cursor-pointer flex items-center justify-between text-xs transition-colors"
                      >
                        <div>
                          <span className="font-extrabold text-[#27272A] block">
                            {item.name}
                          </span>
                          <span className="text-[10px] text-gray-500 font-mono">
                            {item.symbol}
                          </span>
                        </div>
                        <Badge className="text-[10px] bg-amber-200 text-[#27272A] border border-[#27272A]">
                          {item.exchange}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}

                {selectedStock && (
                  <div className="bg-amber-100/70 border border-[#27272A] p-2 rounded text-xs flex justify-between items-center mt-1">
                    <div>
                      <span className="font-extrabold text-[#27272A]">
                        {selectedStock.name}
                      </span>
                      <span className="font-mono text-[10px] block text-gray-600">
                        {selectedStock.symbol}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-[#27272A]">
                  Quantity
                </Label>
                <Input
                  type="number"
                  step="any"
                  placeholder="10"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                  className="border-2 border-[#27272A] shadow-[2px_2px_0px_#27272A] text-xs font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-[#27272A]">
                  Buy Price (₹)
                </Label>
                <Input
                  type="number"
                  step="any"
                  placeholder="2500.00"
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(e.target.value)}
                  required
                  className="border-2 border-[#27272A] shadow-[2px_2px_0px_#27272A] text-xs font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-[#27272A]">
                  Date Bought (Optional)
                </Label>
                <Input
                  type="date"
                  value={boughtAt}
                  onChange={(e) => setBoughtAt(e.target.value)}
                  className="border-2 border-[#27272A] shadow-[2px_2px_0px_#27272A] text-xs font-bold"
                />
              </div>

              <Button
                type="submit"
                disabled={!selectedStock}
                className="w-full neubrutal-btn-primary text-xs mt-2"
              >
                Add Stock Holding
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Holding Dialog */}
      <Dialog
        open={!!editingItem}
        onOpenChange={(open) => !open && setEditingItem(null)}
      >
        <DialogContent className="bg-white border-2 border-[#27272A] shadow-[4px_4px_0px_#27272A] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display font-extrabold text-lg text-[#27272A]">
              Edit Holding: {editingItem?.symbol}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleUpdateStock} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-[#27272A]">
                Quantity
              </Label>
              <Input
                type="number"
                step="any"
                value={editQuantity}
                onChange={(e) => setEditQuantity(e.target.value)}
                required
                className="border-2 border-[#27272A] shadow-[2px_2px_0px_#27272A] text-xs font-bold"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-[#27272A]">
                Average Buy Price (₹)
              </Label>
              <Input
                type="number"
                step="any"
                value={editBuyPrice}
                onChange={(e) => setEditBuyPrice(e.target.value)}
                required
                className="border-2 border-[#27272A] shadow-[2px_2px_0px_#27272A] text-xs font-bold"
              />
            </div>

            <Button
              type="submit"
              className="w-full neubrutal-btn-primary text-xs mt-2"
            >
              Save Changes
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Metrics Summary Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-white border-2 border-[#27272A] shadow-[3px_3px_0px_#27272A] rounded-lg">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold text-[#52525B]">
              TOTAL INVESTED
            </CardTitle>
            <DollarSign className="h-4 w-4 text-[#27272A]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-display font-extrabold text-[#27272A]">
              ₹{metrics ? metrics.total_invested.toLocaleString() : "0"}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-2 border-[#27272A] shadow-[3px_3px_0px_#27272A] rounded-lg">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold text-[#52525B]">
              CURRENT VALUE
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-[#2563EB]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-display font-extrabold text-[#27272A]">
              ₹{metrics ? metrics.current_value.toLocaleString() : "0"}
            </div>
            {metrics && (
              <span
                className={`text-xs font-bold ${metrics.total_return >= 0 ? "text-emerald-700" : "text-rose-700"}`}
              >
                {metrics.total_return >= 0 ? "+" : ""}₹
                {metrics.total_return.toLocaleString()} (
                {metrics.total_return_pct}%)
              </span>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white border-2 border-[#27272A] shadow-[3px_3px_0px_#27272A] rounded-lg">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold text-[#52525B]">
              SHARPE / SORTINO
            </CardTitle>
            <ShieldCheck className="h-4 w-4 text-[#2563EB]" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-display font-extrabold text-[#27272A]">
              S: {metrics?.sharpe_ratio ?? "N/A"} | So:{" "}
              {metrics?.sortino_ratio ?? "N/A"}
            </div>
            <p className="text-[11px] text-[#52525B]">Risk-adjusted returns</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-2 border-[#27272A] shadow-[3px_3px_0px_#27272A] rounded-lg">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold text-[#52525B]">
              BETA / ALPHA
            </CardTitle>
            <Zap className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-display font-extrabold text-[#27272A]">
              β: {metrics?.beta ?? "1.0"} | α:{" "}
              {metrics?.alpha ? `${metrics.alpha}%` : "0%"}
            </div>
            <p className="text-[11px] text-[#52525B]">vs NIFTY 50 Benchmark</p>
          </CardContent>
        </Card>
      </div>

      {/* Portfolio Holdings Table with Individual Returns & Stock Editing */}
      <div className="bg-white border-2 border-[#27272A] shadow-[4px_4px_0px_#27272A] rounded-xl overflow-hidden p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-display font-extrabold text-[#27272A]">
              Stock Holdings
            </h2>
            <p className="text-xs text-[#52525B]">
              Individual stock returns, investment performance, and holding edit
              controls.
            </p>
          </div>
        </div>

        <div className="border-2 border-[#27272A] rounded-lg overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[700px]">
            <thead className="bg-[#F4EFE6] border-b-2 border-[#27272A] font-bold text-[#27272A]">
              <tr>
                <th className="p-3">STOCK NAME</th>
                <th className="p-3 text-right">QUANTITY</th>
                <th className="p-3 text-right">BUY PRICE</th>
                <th className="p-3 text-right">CURRENT LTP</th>
                <th className="p-3 text-right">INVESTED VALUE</th>
                <th className="p-3 text-right">CURRENT VALUE</th>
                <th className="p-3 text-right">INDIVIDUAL RETURN</th>
                <th className="p-3 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#27272A]/20 bg-white">
              {portfolio?.items && portfolio.items.length > 0 ? (
                portfolio.items.map((item) => {
                  const qData = stockQuotes[item.symbol]
                  const companyName = qData?.name || item.symbol
                  const ltp = qData?.ltp || item.avg_price || item.buy_price

                  const investedVal =
                    item.quantity * (item.avg_price || item.buy_price)
                  const currentVal = item.quantity * ltp
                  const gainLoss = currentVal - investedVal
                  const retPct =
                    investedVal > 0
                      ? ((gainLoss / investedVal) * 100).toFixed(2)
                      : "0.00"

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-amber-50/50 transition-colors"
                    >
                      <td className="p-3 font-bold">
                        <a
                          href={`https://finance.yahoo.com/quote/${encodeURIComponent(item.symbol)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#2563EB] hover:underline flex items-center gap-1.5"
                        >
                          <span>{companyName}</span>
                          <span className="text-[10px] font-mono text-[#52525B] border border-[#27272A] px-1 rounded bg-[#FAF6F0]">
                            {item.symbol}
                          </span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      </td>
                      <td className="p-3 font-bold font-mono text-right">
                        {item.quantity}
                      </td>
                      <td className="p-3 font-bold font-mono text-right">
                        ₹{(item.avg_price || item.buy_price).toLocaleString()}
                      </td>
                      <td className="p-3 font-bold font-mono text-right text-[#2563EB]">
                        ₹{ltp.toLocaleString()}
                      </td>
                      <td className="p-3 font-bold font-mono text-right">
                        ₹{investedVal.toLocaleString()}
                      </td>
                      <td className="p-3 font-bold font-mono text-right">
                        ₹{currentVal.toLocaleString()}
                      </td>
                      <td className="p-3 font-bold font-mono text-right">
                        <span
                          className={
                            gainLoss >= 0 ? "text-emerald-700" : "text-rose-700"
                          }
                        >
                          {gainLoss >= 0 ? "+" : ""}₹
                          {Math.abs(gainLoss).toLocaleString()} ({retPct}%)
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-gray-700 hover:text-black hover:bg-amber-100"
                            onClick={() => handleOpenEdit(item)}
                            title="Edit Holding"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDeleteItem(item.id)}
                            title="Delete Holding"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td
                    colSpan={8}
                    className="p-8 text-center text-xs text-[#52525B] italic font-semibold"
                  >
                    No stock holdings added to your portfolio yet. Click "Add
                    Stock Holding" above to start tracking.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
