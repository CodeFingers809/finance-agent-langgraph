import { Bot, CheckCircle2, TrendingUp } from "lucide-react"
import { Logo } from "@/components/Common/Logo"
import { Footer } from "./Footer"

interface AuthLayoutProps {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2 bg-[#FAF6F0] text-[#27272A]">
      {/* Left side: Neubrutalist Finance Agent Banner */}
      <div className="bg-[#F4EFE6] border-r-2 border-[#27272A] p-8 md:p-12 hidden lg:flex lg:flex-col justify-between relative overflow-hidden">
        <div className="space-y-6">
          <Logo variant="full" className="h-10" asLink={false} />

          <div className="pt-8 space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-200 border-1.5 border-[#27272A] rounded font-bold text-xs shadow-[2px_2px_0px_#27272A]">
              <TrendingUp className="h-3.5 w-3.5" /> Indian Equities CFA
              Intelligence
            </div>

            <h2 className="text-3xl font-display font-extrabold text-[#27272A] leading-tight">
              Smarter Financial Analysis & Portfolio Management
            </h2>

            <p className="text-sm text-[#52525B] leading-relaxed max-w-md">
              Access technical indicators, corporate statement breakdowns, and
              Hierarchical Risk Parity portfolio optimizations in seconds.
            </p>
          </div>

          <div className="space-y-3 pt-4">
            <div className="flex items-center gap-2.5 text-xs font-bold text-[#27272A]">
              <CheckCircle2 className="h-4 w-4 text-[#2563EB]" />
              <span>Real-time NSE & BSE stock screening</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs font-bold text-[#27272A]">
              <CheckCircle2 className="h-4 w-4 text-[#2563EB]" />
              <span>
                Hierarchical Risk Parity (HRP) covariance optimization
              </span>
            </div>
            <div className="flex items-center gap-2.5 text-xs font-bold text-[#27272A]">
              <CheckCircle2 className="h-4 w-4 text-[#2563EB]" />
              <span>Direct Yahoo Finance Indian stock integration</span>
            </div>
          </div>
        </div>

        <div className="p-4 bg-white border-2 border-[#27272A] shadow-[3px_3px_0px_#27272A] rounded-lg flex items-center justify-between text-xs font-bold">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-amber-600" />
            <span>Finance Agent CFA Active</span>
          </div>
          <span className="text-emerald-600 font-mono">NSE/BSE Online</span>
        </div>
      </div>

      {/* Right side: Login / Form Area */}
      <div className="flex flex-col gap-4 p-6 md:p-10 justify-between bg-[#FAF6F0]">
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm bg-white border-2 border-[#27272A] shadow-[4px_4px_0px_#27272A] rounded-xl p-8">
            {children}
          </div>
        </div>
        <Footer />
      </div>
    </div>
  )
}
