import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import {
  BarChart3,
  Bot,
  PieChart,
  ArrowRight,
  TrendingUp,
  CheckCircle2,
  FileText,
  Lock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { isLoggedIn } from "@/hooks/useAuth"

export const Route = createFileRoute("/")({
  component: LandingPage,
  beforeLoad: async () => {
    if (isLoggedIn()) {
      throw redirect({
        to: "/chat",
      })
    }
  },
})


function LandingPage() {
  const loggedIn = isLoggedIn()

  return (
    <div className="min-h-screen bg-[#FAF6F0] text-[#27272A] flex flex-col justify-between p-4 md:p-8 font-sans">
      {/* Navigation Header */}
      <header className="border-2 border-[#27272A] bg-white rounded-lg p-4 flex items-center justify-between shadow-[3px_3px_0px_#27272A] max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded bg-amber-200 border-2 border-[#27272A] flex items-center justify-center text-[#27272A]">
            <Bot className="h-5 w-5" />
          </div>
          <span className="font-display font-extrabold text-xl tracking-tight">Finance Agent</span>
        </div>

        <div className="flex items-center gap-3">
          {loggedIn ? (
            <Link to="/chat">
              <Button className="neubrutal-btn-primary gap-2 text-xs">
                Open Chat Terminal <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost" className="font-bold text-xs">Log In</Button>
              </Link>
              <Link to="/signup">
                <Button className="neubrutal-btn-primary gap-2 text-xs">
                  Sign Up <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </>
          )}
        </div>
      </header>

      {/* Hero & Value Proposition */}
      <main className="max-w-6xl mx-auto w-full py-12 space-y-16">
        <div className="bg-white border-2 border-[#27272A] shadow-[4px_4px_0px_#27272A] rounded-xl p-8 md:p-12 space-y-6">
          <Badge className="bg-amber-200 text-[#27272A] border-1.5 border-[#27272A] font-bold text-xs px-3.5 py-1 gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" /> Built Exclusively for Indian Equities (NSE & BSE)
          </Badge>

          <h1 className="text-4xl sm:text-6xl font-display font-extrabold text-[#27272A] leading-tight max-w-4xl">
            Analyze Indian Stocks Faster with Your Personal AI CFA
          </h1>

          <p className="text-base sm:text-lg text-[#52525B] max-w-3xl font-normal leading-relaxed">
            Stop wasting hours sifting through balance sheets, technical charts, and corporate filings. Finance Agent acts as your dedicated CFA, executing stock queries, calculating risk-adjusted portfolio metrics, and recommending optimal asset allocations.
          </p>

          <div className="pt-2 flex flex-wrap gap-4">
            {loggedIn ? (
              <>
                <Link to="/chat">
                  <Button className="neubrutal-btn-primary text-sm px-8 h-12 gap-2">
                    Open Chat Analysis <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/portfolios">
                  <Button className="neubrutal-btn text-sm px-8 h-12 gap-2">
                    <PieChart className="h-4 w-4 text-indigo-600" /> View Portfolios
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <Link to="/login">
                  <Button className="neubrutal-btn-primary text-sm px-8 h-12 gap-2">
                    <Lock className="h-4 w-4" /> Log In to Start Analysis
                  </Button>
                </Link>
                <Link to="/signup">
                  <Button className="neubrutal-btn text-sm px-8 h-12 gap-2">
                    Create Free Account <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Feature Capabilities Breakdown */}
        <div className="space-y-4">
          <h2 className="text-2xl font-display font-extrabold text-[#27272A]">Core Capabilities</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="bg-white border-2 border-[#27272A] shadow-[3px_3px_0px_#27272A] rounded-lg">
              <CardHeader className="space-y-2">
                <div className="h-10 w-10 rounded bg-blue-100 border-2 border-[#27272A] flex items-center justify-center text-[#2563EB]">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <CardTitle className="font-display font-bold text-lg text-[#27272A]">Technical Analysis</CardTitle>
                <CardDescription className="text-xs text-[#52525B]">
                  Computes RSI 14, MACD, SMA 20/50/200, and Bollinger Bands on command to give you immediate buy/sell indicator signals.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="bg-white border-2 border-[#27272A] shadow-[3px_3px_0px_#27272A] rounded-lg">
              <CardHeader className="space-y-2">
                <div className="h-10 w-10 rounded bg-amber-100 border-2 border-[#27272A] flex items-center justify-center text-amber-700">
                  <FileText className="h-5 w-5" />
                </div>
                <CardTitle className="font-display font-bold text-lg text-[#27272A]">Financial Statements & Filings</CardTitle>
                <CardDescription className="text-xs text-[#52525B]">
                  Instantly fetches balance sheets, income statements, cash flow reports, SEC/BSE corporate filings, and press releases.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="bg-white border-2 border-[#27272A] shadow-[3px_3px_0px_#27272A] rounded-lg">
              <CardHeader className="space-y-2">
                <div className="h-10 w-10 rounded bg-emerald-100 border-2 border-[#27272A] flex items-center justify-center text-emerald-700">
                  <PieChart className="h-5 w-5" />
                </div>
                <CardTitle className="font-display font-bold text-lg text-[#27272A]">HRP Portfolio Optimization</CardTitle>
                <CardDescription className="text-xs text-[#52525B]">
                  Executes Hierarchical Risk Parity (HRP) covariance cluster optimization and recommends target weight percentages in a clean table.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>

        {/* Detailed Feature List Section */}
        <div className="bg-white border-2 border-[#27272A] shadow-[4px_4px_0px_#27272A] rounded-xl p-8 space-y-6">
          <h2 className="text-2xl font-display font-extrabold text-[#27272A]">
            Everything You Need for Smarter Stock Decisions
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-[#2563EB] shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-sm text-[#27272A]">Analyst Predictions</h3>
                <p className="text-xs text-[#52525B]">Target price highs/lows and consensus recommendations (Buy/Hold/Sell).</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-[#2563EB] shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-sm text-[#27272A]">Indian Indices Tracking</h3>
                <p className="text-xs text-[#52525B]">Real-time status for NIFTY 50, SENSEX, NIFTY Bank, and sector indices.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-[#2563EB] shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-sm text-[#27272A]">Stock Screener</h3>
                <p className="text-xs text-[#52525B]">Screen top stocks by sector (Defense, IT, Banking, Auto, Pharma, Renewables).</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-[#2563EB] shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-sm text-[#27272A]">Risk-Adjusted Portfolio Metrics</h3>
                <p className="text-xs text-[#52525B]">Computes Sharpe Ratio, Sortino Ratio, Beta, and Alpha against NIFTY 50.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-[#2563EB] shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-sm text-[#27272A]">Custom Watchlists</h3>
                <p className="text-xs text-[#52525B]">Organize up to 10 watchlists with 50 stocks each, linked directly to Yahoo Finance.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-[#2563EB] shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-sm text-[#27272A]">Direct Yahoo Finance Link</h3>
                <p className="text-xs text-[#52525B]">Global stock search redirects directly to official stock quote pages.</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t-2 border-[#27272A] py-6 text-center text-xs text-[#52525B] font-semibold">
        Finance Agent Platform • Built for Indian Equity Markets (NSE & BSE)
      </footer>
    </div>
  )
}
