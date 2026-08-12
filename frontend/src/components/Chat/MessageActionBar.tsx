import {
  Bookmark,
  Check,
  Copy,
  FileDown,
  GitBranch,
  Loader2,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { ResearchReportsService } from "@/client/organizations"
import useAuth from "@/hooks/useAuth"
import type { ChartArtifactsProps } from "@/components/Chat/ChartArtifacts"
import { exportFormattedReportPdf } from "@/lib/exportPdf"

export interface MessageActionBarProps {
  readonly message: {
    id: string
    content: string
    sender: "user" | "agent"
    metadata_json?: string | null
    created_at?: string
    priceChart?: any
    growthChart?: any
    analystChart?: any
    fiiDiiChart?: any
  }
  readonly conversationId?: string | null
  readonly onBranch: (messageId: string) => void
  /** Model that produced this message, recorded on saved reports. */
  readonly modelName?: string
}

/** First line of prose, used as a default report/PDF title. */
function deriveTitle(content: string, fallback: string): string {
  const cleaned = content
    .replace(/^#+\s*/gm, "")
    .replace(/[*_`]/g, "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  return cleaned?.slice(0, 80) || fallback
}

export function MessageActionBar({
  message,
  conversationId,
  onBranch,
  modelName,
}: MessageActionBarProps) {
  const { isOrgAdmin } = useAuth()
  const [copied, setCopied] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isSaved, setIsSaved] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    toast.success("Copied to clipboard")
    setTimeout(() => setCopied(false), 2000)
  }

  const handleExportPdf = async () => {
    setIsExporting(true)
    try {
      const charts: ChartArtifactsProps = {
        priceChart: message.priceChart,
        growthChart: message.growthChart,
        analystChart: message.analystChart,
        fiiDiiChart: message.fiiDiiChart,
      }
      const hasCharts = Object.values(charts).some(Boolean)
      await exportFormattedReportPdf({
        title: deriveTitle(message.content, "Financial Research Note"),
        markdownReport: message.content,
        filename: `message-${message.id.slice(0, 8)}`,
        charts: hasCharts ? charts : undefined,
      })
      toast.success("Exported PDF")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to export PDF")
    } finally {
      setIsExporting(false)
    }
  }

  const handleSaveReport = async () => {
    setIsSaving(true)
    try {
      const charts = {
        priceChart: message.priceChart ?? null,
        growthChart: message.growthChart ?? null,
        analystChart: message.analystChart ?? null,
        fiiDiiChart: message.fiiDiiChart ?? null,
      }
      const hasCharts = Object.values(charts).some(Boolean)
      await ResearchReportsService.create({
        title: deriveTitle(message.content, "Research Report"),
        markdown_report: message.content,
        created_by_model: modelName ?? "",
        conversation_id: conversationId ?? null,
        message_id: message.id,
        chart_data: hasCharts ? JSON.stringify(charts) : null,
      } as any)
      setIsSaved(true)
      toast.success("Saved as research report")
      setTimeout(() => setIsSaved(false), 3000)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save report")
    } finally {
      setIsSaving(false)
    }
  }


  const isUser = message.sender === "user"
  const busy = isExporting || isSaving

  return (
    <div
      className={`sticky top-4 shrink-0 self-start opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 flex flex-col gap-1 ${
        isUser ? "mr-1 items-end" : "ml-1 items-start"
      }`}
    >
      {/* Copy Button (available for both user and agent messages) */}
      <button
        type="button"
        onClick={handleCopy}
        title={copied ? "Copied" : "Copy text"}
        className="h-7 w-7 flex items-center justify-center rounded border-2 border-[#27272A] bg-white text-[#27272A] shadow-[1.5px_1.5px_0px_#27272A] hover:bg-amber-100 transition-colors"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>

      {/* NOTE: User chat messages get ONLY the Copy button above.
          Branching, PDF Export, and Saving as Research Report are reserved exclusively for agent messages. */}
      {!isUser && (
        <>
          {/* Branch */}
          <button
            type="button"
            onClick={() => onBranch(message.id)}
            title="Branch from here"
            className="h-7 w-7 flex items-center justify-center rounded border-2 border-[#27272A] bg-white text-[#27272A] shadow-[1.5px_1.5px_0px_#27272A] hover:bg-amber-100 transition-colors"
          >
            <GitBranch className="h-3.5 w-3.5" />
          </button>

          {/* Export PDF */}
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isExporting}
            title="Export as PDF"
            className="h-7 w-7 flex items-center justify-center rounded border-2 border-[#27272A] bg-white text-[#27272A] shadow-[1.5px_1.5px_0px_#27272A] hover:bg-amber-100 transition-colors disabled:opacity-50"
          >
            {isExporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileDown className="h-3.5 w-3.5" />
            )}
          </button>

          {/* Save report (admin-only) */}
          <button
            type="button"
            onClick={handleSaveReport}
            disabled={!isOrgAdmin || isSaving || busy}
            title={
              isSaved
                ? "Saved"
                : !isOrgAdmin
                  ? "Save (admins only)"
                  : "Save as research report"
            }
            className="h-7 w-7 flex items-center justify-center rounded border-2 border-[#27272A] bg-white text-[#27272A] shadow-[1.5px_1.5px_0px_#27272A] hover:bg-amber-100 transition-colors disabled:opacity-50"
          >
            {isSaved ? (
              <Check className="h-3.5 w-3.5 text-emerald-600" />
            ) : isSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Bookmark className="h-3.5 w-3.5" />
            )}
          </button>
        </>
      )}

    </div>
  )
}
