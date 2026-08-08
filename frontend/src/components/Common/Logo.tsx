import { Link } from "@tanstack/react-router"
import { Bot } from "lucide-react"

interface LogoProps {
  variant?: "full" | "icon" | "responsive"
  className?: string
  asLink?: boolean
}

export function Logo({ asLink = true }: LogoProps) {
  const content = (
    <div className="flex items-center gap-2 text-[#27272A] font-display font-extrabold tracking-tight">
      <div className="h-7 w-7 rounded bg-amber-200 border-2 border-[#27272A] shadow-[1.5px_1.5px_0px_#27272A] flex items-center justify-center text-[#27272A]">
        <Bot className="h-4 w-4" />
      </div>
      <span className="text-sm font-extrabold group-data-[collapsible=icon]:hidden">
        Finance Agent
      </span>
    </div>
  )

  if (!asLink) {
    return content
  }

  return <Link to="/">{content}</Link>
}
