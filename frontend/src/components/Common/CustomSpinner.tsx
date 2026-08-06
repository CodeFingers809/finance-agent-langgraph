import { cn } from "@/lib/utils"

interface CustomSpinnerProps {
  size?: "sm" | "md" | "lg"
  className?: string
  label?: string
}

export function CustomSpinner({ size = "md", className, label }: CustomSpinnerProps) {
  const sizeMap = {
    sm: "h-4 w-4 border-2",
    md: "h-6 w-6 border-2",
    lg: "h-10 w-10 border-3",
  }

  return (
    <div className={cn("inline-flex items-center gap-2.5", className)}>
      <div className="relative flex items-center justify-center">
        {/* Outer glowing ring */}
        <div
          className={cn(
            "rounded-full border-primary/20 border-t-primary animate-spin shadow-sm shadow-primary/30",
            sizeMap[size]
          )}
        />
        {/* Inner pulsing core */}
        <div
          className={cn(
            "absolute rounded-full bg-primary/80 animate-ping opacity-75",
            size === "sm" ? "h-1.5 w-1.5" : size === "md" ? "h-2 w-2" : "h-3.5 w-3.5"
          )}
        />
      </div>
      {label && <span className="text-xs text-muted-foreground font-medium animate-pulse">{label}</span>}
    </div>
  )
}
