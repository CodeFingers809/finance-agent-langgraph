import {
  Bookmark,
  Check,
  Copy,
  FileDown,
  GitBranch,
  Loader2,
  MoreHorizontal,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { ResearchReportsService } from "@/client/organizations"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import useAuth from "@/hooks/useAuth"
import { exportFormattedReportPdf } from "@/lib/exportPdf"

export interface MessageActionBarProps {
  readonly message: {
    id: string
    content: string
    sender: "user" | "agent"
    metadata_json?: string | null
    created_at?: string
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
      await exportFormattedReportPdf({
        title: deriveTitle(message.content, "Financial Research Note"),
        markdownReport: message.content,
        filename: `message-${message.id.slice(0, 8)}`,
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
      await ResearchReportsService.create({
        title: deriveTitle(message.content, "Research Report"),
        markdown_report: message.content,
        created_by_model: modelName ?? "",
        conversation_id: conversationId ?? null,
        message_id: message.id,
      })
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

  let saveLabel = "Save as research report"
  if (isSaved) saveLabel = "Saved"
  else if (!isOrgAdmin) saveLabel = "Save (admins only)"

  return (
    <div
      className={`sticky top-4 shrink-0 self-start opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 ${
        isUser ? "mr-1" : "ml-1"
      }`}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            aria-label="Message actions"
            className="h-7 w-7 border-2 border-[#27272A] bg-white text-[#27272A] shadow-[1.5px_1.5px_0px_#27272A] hover:bg-amber-100"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <MoreHorizontal className="h-3.5 w-3.5" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={isUser ? "start" : "end"} className="w-52">
          <DropdownMenuItem onClick={handleCopy}>
            {copied ? (
              <Check className="mr-2 h-4 w-4 text-emerald-600" />
            ) : (
              <Copy className="mr-2 h-4 w-4" />
            )}
            {copied ? "Copied" : "Copy text"}
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => onBranch(message.id)}>
            <GitBranch className="mr-2 h-4 w-4" />
            Branch from here
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem disabled={isExporting} onClick={handleExportPdf}>
            <FileDown className="mr-2 h-4 w-4" />
            {isExporting ? "Exporting..." : "Export as PDF"}
          </DropdownMenuItem>

          {/* Saving writes to the org's report library, so it's admin-only.
              Shown-but-disabled for analysts; the backend enforces it too. */}
          <DropdownMenuItem
            disabled={!isOrgAdmin || isSaving}
            onClick={handleSaveReport}
          >
            {isSaved ? (
              <Check className="mr-2 h-4 w-4 text-emerald-600" />
            ) : (
              <Bookmark className="mr-2 h-4 w-4" />
            )}
            {saveLabel}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
