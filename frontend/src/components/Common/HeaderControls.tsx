import { useState, useEffect, useRef } from "react"
import { Search, ExternalLink, Zap } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { OpenAPI } from "@/client"

interface SearchStockResult {
  symbol: string
  name: string
  exchange?: string
  price?: number
  change_1d_pct?: number
}

export function HeaderControls() {
  const [searchSymbol, setSearchSymbol] = useState("")
  const [searchResults, setSearchResults] = useState<SearchStockResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [quota, setQuota] = useState<{
    standard_remaining_today: number
    standard_limit_today: number
    upgraded_remaining_today: number
    upgraded_limit_today: number
    seconds_until_next_allowed: number
  } | null>(null)

  const dropdownRef = useRef<HTMLDivElement>(null)

  const fetchQuota = async () => {
    try {
      const token = localStorage.getItem("access_token")
      if (!token) return
      const res = await fetch(`${OpenAPI.BASE}/api/v1/agent/quota`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      if (res.ok) {
        const data = await res.json()
        setQuota(data)
      }
    } catch (err) {
      console.error("Quota fetch error", err)
    }
  }

  useEffect(() => {
    fetchQuota()
    const interval = setInterval(fetchQuota, 15000)
    return () => clearInterval(interval)
  }, [])

  // Live stock search API lookup with debouncing
  useEffect(() => {
    if (!searchSymbol.trim()) {
      setSearchResults([])
      return
    }

    const timer = setTimeout(async () => {
      try {
        setIsLoading(true)
        const res = await fetch(`${OpenAPI.BASE}/api/v1/utils/stock-search?q=${encodeURIComponent(searchSymbol.trim())}`)
        if (res.ok) {
          const data: SearchStockResult[] = await res.json()
          setSearchResults(data.slice(0, 6))
        }
      } catch (err) {
        console.error("Live stock search error", err)
      } finally {
        setIsLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [searchSymbol])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleSelectStock = (symbol: string) => {
    window.open(`https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`, "_blank")
    setSearchSymbol("")
    setIsOpen(false)
  }

  const handleSubmitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchSymbol.trim()) return
    let sym = searchSymbol.trim().toUpperCase()
    if (!sym.startsWith("^") && !sym.endsWith(".NS") && !sym.endsWith(".BO")) {
      sym = `${sym}.NS`
    }
    window.open(`https://finance.yahoo.com/quote/${encodeURIComponent(sym)}`, "_blank")
    setSearchSymbol("")
    setIsOpen(false)
  }

  return (
    <div className="flex flex-1 items-center justify-between gap-4">
      {/* Search Bar with Live Yahoo Search Dropdown */}
      <div ref={dropdownRef} className="relative flex-1 max-w-md">
        <form onSubmit={handleSubmitSearch} className="relative flex items-center">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#27272A]" />
          <Input
            type="text"
            placeholder="Search stocks by name or ticker..."
            className="pl-9 pr-8 h-9 text-xs font-semibold bg-white border-2 border-[#27272A] shadow-[2px_2px_0px_#27272A] focus-visible:ring-0 focus-visible:border-primary text-[#27272A]"
            value={searchSymbol}
            onFocus={() => setIsOpen(true)}
            onChange={(e) => {
              setSearchSymbol(e.target.value)
              setIsOpen(true)
            }}
          />
        </form>

        {/* Live Search Results Dropdown */}
        {isOpen && (searchSymbol.trim().length > 0) && (
          <div className="absolute top-11 left-0 right-0 z-50 bg-white border-2 border-[#27272A] shadow-[4px_4px_0px_#27272A] rounded-md overflow-hidden py-1">
            {isLoading ? (
              <div className="p-3 text-center text-xs text-[#52525B] font-semibold italic">Searching Yahoo Finance...</div>
            ) : searchResults.length > 0 ? (
              searchResults.map((stock) => (
                <button
                  key={stock.symbol}
                  type="button"
                  onClick={() => handleSelectStock(stock.symbol)}
                  className="w-full px-3 py-2 text-left flex items-center justify-between hover:bg-amber-100 transition-colors text-xs border-b border-muted/50 last:border-0"
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-extrabold text-[#27272A] truncate">{stock.name}</div>
                    <div className="text-[11px] font-mono text-[#52525B]">{stock.symbol} {stock.exchange ? `• ${stock.exchange}` : ""}</div>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-[#2563EB] shrink-0" />
                </button>
              ))
            ) : (
              <div className="p-3 text-center text-xs text-[#52525B] italic">No matching stocks found. Press Enter to search symbol.</div>
            )}
          </div>
        )}
      </div>

      {/* Quota Status Display */}
      <div className="flex items-center gap-2 text-xs">
        {quota && (
          <Badge className="gap-1 font-bold text-[11px] bg-amber-200 text-[#27272A] border-1.5 border-[#27272A] shadow-[1.5px_1.5px_0px_#27272A]">
            <Zap className="h-3 w-3 fill-[#27272A]" />
            Standard: {quota.standard_remaining_today}/{quota.standard_limit_today} | Upgraded: {quota.upgraded_remaining_today}/{quota.upgraded_limit_today}
          </Badge>
        )}
      </div>
    </div>
  )
}
