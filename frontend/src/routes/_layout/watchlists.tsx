import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import {
  ExternalLink,
  Eye,
  FolderPlus,
  Plus,
  Search,
  Trash2,
} from "lucide-react"
import { useEffect, useState } from "react"
import { OpenAPI } from "@/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export const Route = createFileRoute("/_layout/watchlists")({
  component: WatchlistsPage,
})

interface WatchlistItem {
  id: string
  symbol: string
  added_at: string
}

interface WatchlistData {
  id: string
  name: string
  created_at: string
  items: WatchlistItem[]
}

interface StockQuoteData {
  symbol: string
  name: string
  ltp: number
  change_1d_pct: number
}

function WatchlistsPage() {
  const queryClient = useQueryClient()
  const [selectedWatchlistId, setSelectedWatchlistId] = useState<string | null>(
    null,
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newWatchlistName, setNewWatchlistName] = useState("")

  const [isAddStockOpen, setIsAddStockOpen] = useState(false)
  const [stockSymbol, setStockSymbol] = useState("")
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [selectedStock, setSelectedStock] = useState<any | null>(null)

  const token = localStorage.getItem("access_token")

  // React Query cached watchlists fetch - instant tab switch SPA
  const { data: watchlists = [] } = useQuery<WatchlistData[]>({
    queryKey: ["watchlists"],
    queryFn: async () => {
      const res = await fetch(`${OpenAPI.BASE}/api/v1/watchlists`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return []
      return await res.json()
    },
    staleTime: 1000 * 60 * 5,
  })

  // Select first watchlist automatically if none selected
  useEffect(() => {
    if (watchlists.length > 0 && !selectedWatchlistId) {
      setSelectedWatchlistId(watchlists[0].id)
    }
  }, [watchlists, selectedWatchlistId])

  const currentList = watchlists.find((w) => w.id === selectedWatchlistId)
  const itemSymbols = currentList?.items?.map((i) => i.symbol) || []
  const symbolsKey = itemSymbols.sort().join(",")

  // React Query cached stock quotes fetch
  const { data: stockQuotes = {} } = useQuery<Record<string, StockQuoteData>>({
    queryKey: ["watchlist_stock_quotes", symbolsKey],
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

  // Live stock search API in add stock modal
  useEffect(() => {
    if (!stockSymbol.trim()) {
      setSearchResults([])
      return
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${OpenAPI.BASE}/api/v1/utils/stock-search?q=${encodeURIComponent(stockSymbol.trim())}`,
        )
        if (res.ok) {
          const data = await res.json()
          setSearchResults(data.slice(0, 5))
        }
      } catch (err) {
        console.error("Search error", err)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [stockSymbol])

  const handleCreateWatchlist = async () => {
    if (!newWatchlistName.trim()) return
    setErrorMessage(null)
    try {
      const res = await fetch(`${OpenAPI.BASE}/api/v1/watchlists`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newWatchlistName.trim() }),
      })

      if (res.ok) {
        const created: WatchlistData = await res.json()
        setNewWatchlistName("")
        setIsCreateOpen(false)
        queryClient.invalidateQueries({ queryKey: ["watchlists"] })
        setSelectedWatchlistId(created.id)
      } else {
        const errJson = await res.json().catch(() => ({}))
        setErrorMessage(errJson.detail || "Failed to create watchlist")
      }
    } catch (_err) {
      setErrorMessage("Failed to create watchlist")
    }
  }

  const handleAddStock = async () => {
    if (!selectedWatchlistId || !selectedStock) return
    setErrorMessage(null)
    try {
      const res = await fetch(
        `${OpenAPI.BASE}/api/v1/watchlists/${selectedWatchlistId}/items`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ symbol: selectedStock.symbol }),
        },
      )

      if (res.ok) {
        setStockSymbol("")
        setSelectedStock(null)
        setIsAddStockOpen(false)
        queryClient.invalidateQueries({ queryKey: ["watchlists"] })
      } else {
        const errJson = await res.json().catch(() => ({}))
        setErrorMessage(errJson.detail || "Failed to add stock to watchlist")
      }
    } catch (_err) {
      setErrorMessage("Failed to add stock to watchlist")
    }
  }

  const handleDeleteItem = async (itemId: string) => {
    if (!selectedWatchlistId) return
    try {
      const res = await fetch(
        `${OpenAPI.BASE}/api/v1/watchlists/${selectedWatchlistId}/items/${itemId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      )
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["watchlists"] })
      }
    } catch (err) {
      console.error("Failed to delete watchlist item", err)
    }
  }

  const handleDeleteWatchlist = async (watchlistId: string) => {
    try {
      const res = await fetch(
        `${OpenAPI.BASE}/api/v1/watchlists/${watchlistId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      )
      if (res.ok) {
        if (selectedWatchlistId === watchlistId) {
          setSelectedWatchlistId(null)
        }
        queryClient.invalidateQueries({ queryKey: ["watchlists"] })
      }
    } catch (err) {
      console.error("Failed to delete watchlist", err)
    }
  }

  return (
    <div className="p-4 md:p-8 space-y-6 bg-[#FAF6F0] text-[#27272A] min-h-full">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b-2 border-[#27272A] pb-4">
        <div>
          <h1 className="text-3xl font-display font-extrabold text-[#27272A] tracking-tight">
            Custom Watchlists
          </h1>
          <p className="text-xs text-[#52525B]">
            Monitor price movements and daily changes across your favorite stock
            groups
          </p>
        </div>

        {/* Create Watchlist Modal */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="neubrutal-btn-primary gap-2 text-xs">
              <FolderPlus className="h-4 w-4" /> Create New Watchlist
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-white border-2 border-[#27272A] shadow-[4px_4px_0px_#27272A] sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display font-extrabold text-lg text-[#27272A]">
                Create Watchlist
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              {errorMessage && (
                <div className="p-2 bg-rose-100 border border-[#27272A] text-xs font-bold text-rose-800 rounded">
                  {errorMessage}
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-[#27272A]">
                  Watchlist Name
                </Label>
                <Input
                  placeholder="e.g. Defense Stocks, High Growth Tech..."
                  value={newWatchlistName}
                  onChange={(e) => setNewWatchlistName(e.target.value)}
                  className="border-2 border-[#27272A] shadow-[2px_2px_0px_#27272A] text-xs font-bold"
                />
              </div>

              <Button
                onClick={handleCreateWatchlist}
                disabled={!newWatchlistName.trim()}
                className="w-full neubrutal-btn-primary text-xs mt-2"
              >
                Create Watchlist
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Top Horizontal Watchlist Tabs Bar */}
      <div className="flex items-center gap-2.5 overflow-x-auto pb-2 border-b-2 border-[#27272A]/20 no-scrollbar">
        {watchlists.map((wl) => {
          const isSelected = wl.id === selectedWatchlistId
          return (
            <button
              key={wl.id}
              onClick={() => setSelectedWatchlistId(wl.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-[#27272A] text-xs font-bold transition-all shrink-0 ${
                isSelected
                  ? "bg-[#2563EB] text-white shadow-[3px_3px_0px_#27272A]"
                  : "bg-white text-[#27272A] hover:bg-amber-100 shadow-[2px_2px_0px_#27272A]"
              }`}
            >
              <Eye
                className={`h-3.5 w-3.5 ${isSelected ? "text-white" : "text-[#2563EB]"}`}
              />
              <span>{wl.name}</span>
              <Badge
                className={`text-[10px] px-1.5 py-0.2 ${
                  isSelected
                    ? "bg-white text-[#2563EB] border-white"
                    : "bg-amber-200 text-[#27272A] border-[#27272A]"
                }`}
              >
                {wl.items?.length || 0}
              </Badge>

              <span
                onClick={(e) => {
                  e.stopPropagation()
                  handleDeleteWatchlist(wl.id)
                }}
                className={`p-1 rounded hover:bg-black/10 transition-colors ml-1 ${
                  isSelected
                    ? "text-white hover:text-white"
                    : "text-rose-600 hover:text-rose-800"
                }`}
                title="Delete Watchlist"
              >
                <Trash2 className="h-3 w-3" />
              </span>
            </button>
          )
        })}

        {watchlists.length === 0 && (
          <span className="text-xs text-[#52525B] italic font-semibold py-2">
            No watchlists created yet. Click "Create New Watchlist" above.
          </span>
        )}
      </div>

      {/* Selected Watchlist Full-Width Details & Stock Table */}
      {currentList ? (
        <div className="bg-white border-2 border-[#27272A] shadow-[4px_4px_0px_#27272A] rounded-xl overflow-hidden p-6 space-y-4">
          <div className="flex items-center justify-between border-b-2 border-[#27272A] pb-3">
            <div>
              <h2 className="text-xl font-display font-extrabold text-[#27272A]">
                {currentList.name}
              </h2>
              <p className="text-xs text-[#52525B]">
                {currentList.items?.length || 0} stock items tracked
              </p>
            </div>

            {/* Add Stock to Watchlist Dialog */}
            <Dialog open={isAddStockOpen} onOpenChange={setIsAddStockOpen}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  className="neubrutal-btn-primary gap-1.5 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Stock Symbol
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-white border-2 border-[#27272A] shadow-[4px_4px_0px_#27272A] sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="font-display font-extrabold text-lg text-[#27272A]">
                    Add Stock to {currentList.name}
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 pt-2">
                  {errorMessage && (
                    <div className="p-2 bg-rose-100 border border-[#27272A] text-xs font-bold text-rose-800 rounded">
                      {errorMessage}
                    </div>
                  )}

                  <div className="space-y-1.5 relative">
                    <Label className="text-xs font-bold text-[#27272A]">
                      Search Stock Symbol
                    </Label>
                    <div className="relative">
                      <Input
                        placeholder="Search NSE/BSE stock or index..."
                        value={stockSymbol}
                        onChange={(e) => setStockSymbol(e.target.value)}
                        className="border-2 border-[#27272A] shadow-[2px_2px_0px_#27272A] text-xs font-bold pl-8"
                      />
                      <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-[#52525B]" />
                    </div>

                    {/* Search Dropdown */}
                    {searchResults.length > 0 && (
                      <div className="absolute top-full left-0 w-full bg-white border-2 border-[#27272A] shadow-[3px_3px_0px_#27272A] rounded-lg mt-1 z-50 divide-y divide-gray-200 overflow-hidden">
                        {searchResults.map((item) => (
                          <div
                            key={item.symbol}
                            onClick={() => {
                              setSelectedStock(item)
                              setStockSymbol(item.symbol)
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

                  <Button
                    onClick={handleAddStock}
                    disabled={!selectedStock}
                    className="w-full neubrutal-btn-primary text-xs mt-2"
                  >
                    Add to Watchlist
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Watchlist Items Table */}
          <div className="border-2 border-[#27272A] rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F4EFE6] border-b-2 border-[#27272A] font-bold text-[#27272A]">
                <tr>
                  <th className="p-3">STOCK NAME</th>
                  <th className="p-3 text-right">LTP (₹)</th>
                  <th className="p-3 text-right">1D CHANGE</th>
                  <th className="p-3 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#27272A]/20 bg-white">
                {currentList.items && currentList.items.length > 0 ? (
                  currentList.items.map((item) => {
                    const qData = stockQuotes[item.symbol]
                    const companyName = qData?.name || item.symbol
                    const ltp = qData?.ltp
                    const changePct = qData?.change_1d_pct

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
                        <td className="p-3 font-bold font-mono text-right text-[#27272A]">
                          {ltp !== undefined ? `₹${ltp.toLocaleString()}` : "—"}
                        </td>
                        <td className="p-3 font-bold font-mono text-right">
                          {changePct !== undefined ? (
                            <span
                              className={
                                changePct >= 0
                                  ? "text-emerald-700"
                                  : "text-rose-700"
                              }
                            >
                              {changePct >= 0 ? "+" : ""}
                              {changePct}%
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDeleteItem(item.id)}
                            title="Remove Stock"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td
                      colSpan={4}
                      className="p-8 text-center text-xs text-[#52525B] italic font-semibold"
                    >
                      No stocks added to this watchlist yet. Click "Add Stock
                      Symbol" above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white border-2 border-[#27272A] rounded-xl p-12 text-center text-xs text-[#52525B] font-semibold italic">
          Select or create a watchlist above to view stocks.
        </div>
      )}
    </div>
  )
}
