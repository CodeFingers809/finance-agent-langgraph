import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowRight, Bot, Eye, MessageSquare, PieChart } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout/dashboard")({
  component: Dashboard,
  head: () => ({
    meta: [
      {
        title: "Dashboard - Financial Agent CFA",
      },
    ],
  }),
})

function Dashboard() {
  const { user: currentUser } = useAuth()

  return (
    <div className="space-y-6 text-[#27272A]">
      {/* Welcome Banner */}
      <div className="bg-white border-2 border-[#27272A] shadow-[4px_4px_0px_#27272A] rounded-lg p-6 space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded bg-amber-200 border-1.5 border-[#27272A] flex items-center justify-center text-[#27272A]">
            <Bot className="h-4 w-4" />
          </div>
          <span className="font-display font-extrabold text-lg">
            FinCFA Agent Workspace
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-[#27272A]">
          Welcome back,{" "}
          {currentUser?.full_name || currentUser?.email?.split("@")[0]} 👋
        </h1>
        <p className="text-xs text-[#52525B]">
          Your CFA agent is active. Analyze Indian stock tickers, compute Sharpe
          & Sortino portfolio metrics, and request HRP weight allocations.
        </p>
        <div className="pt-2 flex flex-wrap gap-3">
          <Link to="/chat">
            <Button className="neubrutal-btn-primary gap-2 text-xs">
              <MessageSquare className="h-4 w-4" /> Open Chat Analysis
            </Button>
          </Link>
          <Link to="/portfolios">
            <Button className="neubrutal-btn gap-2 text-xs">
              <PieChart className="h-4 w-4 text-indigo-600" /> Manage Portfolios
            </Button>
          </Link>
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-white border-2 border-[#27272A] shadow-[3px_3px_0px_#27272A] rounded-lg">
          <CardHeader>
            <div className="h-9 w-9 rounded bg-blue-100 border border-[#27272A] flex items-center justify-center text-[#2563EB] mb-1">
              <MessageSquare className="h-4 w-4" />
            </div>
            <CardTitle className="font-display font-bold text-base">
              Chat Terminal
            </CardTitle>
            <CardDescription className="text-xs text-[#52525B]">
              Stream answers, technical indicators (RSI, MACD), balance sheets &
              HRP weightings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/chat">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-between font-bold text-xs text-[#2563EB]"
              >
                Open Chat <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="bg-white border-2 border-[#27272A] shadow-[3px_3px_0px_#27272A] rounded-lg">
          <CardHeader>
            <div className="h-9 w-9 rounded bg-indigo-100 border border-[#27272A] flex items-center justify-center text-indigo-600 mb-1">
              <PieChart className="h-4 w-4" />
            </div>
            <CardTitle className="font-display font-bold text-base">
              Portfolios
            </CardTitle>
            <CardDescription className="text-xs text-[#52525B]">
              Track buy price, average price, Sharpe ratio, Sortino ratio, Beta,
              and Alpha vs NIFTY 50.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/portfolios">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-between font-bold text-xs text-indigo-600"
              >
                View Portfolios <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="bg-white border-2 border-[#27272A] shadow-[3px_3px_0px_#27272A] rounded-lg">
          <CardHeader>
            <div className="h-9 w-9 rounded bg-amber-100 border border-[#27272A] flex items-center justify-center text-amber-600 mb-1">
              <Eye className="h-4 w-4" />
            </div>
            <CardTitle className="font-display font-bold text-base">
              Watchlists
            </CardTitle>
            <CardDescription className="text-xs text-[#52525B]">
              Manage up to 10 watchlists with 50 stocks each. Direct external
              Yahoo Finance links included.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/watchlists">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-between font-bold text-xs text-amber-600"
              >
                View Watchlists <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
