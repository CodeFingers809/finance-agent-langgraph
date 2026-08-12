import { createFileRoute } from "@tanstack/react-router"
import { useState, useEffect } from "react"
import {
  FileText,
  Search,
  FileDown,
  Eye,
  Bookmark,
  Trash2,
  MoreVertical,
  Edit2,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ChartArtifacts, type ChartArtifactsProps } from "@/components/Chat/ChartArtifacts"
import { MarkdownRenderer } from "@/components/Common/MarkdownRenderer"
import { exportFormattedReportPdf } from "@/lib/exportPdf.tsx"
import { CustomSpinner } from "@/components/Common/CustomSpinner"

import useAuth from "@/hooks/useAuth"
import { authFetch } from "@/lib/authFetch"
import { ResearchReportsService } from "@/client/organizations"

export const Route = createFileRoute("/_layout/research-reports")({
  component: SavedResearchReportsPage,
})

interface ResearchReport {
  id: string
  title: string
  markdown_report: string
  symbol?: string | null
  created_by_model?: string | null
  created_at: string
  conversation_id?: string | null
  charts?: ChartArtifactsProps | null
}

/** Extract plain text from stringified LangChain content blocks or raw markdown. */
function extractText(raw: string): string {
  if (!raw) return ""
  let text = raw.trim()

  // Detect Python-dict-style content blocks: [{'type': 'text', 'text': '...'}]
  if (text.includes("'type':") || text.includes('"type":')) {
    const parts: string[] = []
    // Capture everything between 'text': '...' including escaped quotes
    const re = /['"](text)['"]\s*:\s*'((?:[^'\\]|\\.)*)'/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      parts.push(m[2].replace(/\\'/g, "'"))
    }
    if (parts.length > 0) {
      text = parts.reduce((acc, part) => {
        if (!acc) return part
        if (/\w$/.test(acc) && /^\w/.test(part)) return acc + " " + part
        return acc + part
      }, "")
    }
  }


  // Unescape literal \n sequences
  return text.replace(/\\n/g, "\n").trim()
}

/** Strip markdown heading markers and inline markup from a title string. */
function stripMarkdown(s: string): string {
  return s
    .replace(/^#+\s*/gm, "")   // headings
    .replace(/[*_`~]/g, "")    // bold/italic/code/strikethrough
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0) ?? s.trim()
}

function SavedResearchReportsPage() {
  const { user } = useAuth()
  const [reports, setReports] = useState<ResearchReport[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedReport, setSelectedReport] = useState<ResearchReport | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameTitle, setRenameTitle] = useState("")

  const canViewReports = (user as any)?.can_view_reports !== false

  const fetchReports = async () => {
    setLoading(true)
    try {
      const res = await authFetch(`/research-reports`, {})
      if (res.ok) {
        const data = await res.json()
        setReports(
          data.map((r: any) => {
            const body = extractText(r.markdown_report)
            const rawTitle = extractText(r.title)
            let charts: ChartArtifactsProps | null = null
            if (r.chart_data) {
              try {
                charts = typeof r.chart_data === "string"
                  ? JSON.parse(r.chart_data)
                  : r.chart_data
              } catch { /* ignore */ }
            }
            return {
              ...r,
              title: stripMarkdown(rawTitle) || "Research Report",
              markdown_report: body,
              charts,
            }
          })
        )
      }
    } catch (err) {
      console.error("Fetch research reports error:", err)
    } finally {
      setLoading(false)
    }
  }


  useEffect(() => {
    fetchReports()
  }, [user])

  const filteredReports = reports.filter((r) => {
    const q = searchQuery.toLowerCase()
    return (
      r.title.toLowerCase().includes(q) ||
      (r.symbol && r.symbol.toLowerCase().includes(q)) ||
      r.markdown_report.toLowerCase().includes(q)
    )
  })

  const handleExportPdf = async (report: ResearchReport) => {
    setIsExporting(true)
    try {
      await exportFormattedReportPdf({
        title: report.title,
        markdownReport: report.markdown_report,
        symbol: report.symbol,
        createdAt: report.created_at,
        modelName: report.created_by_model,
        charts: report.charts ?? undefined,
      })
      toast.success(`Exported "${report.title}" as formatted PDF`)
    } catch (err) {
      console.error("Export PDF error:", err)
      toast.error("Failed to export PDF")
    } finally {
      setIsExporting(false)
    }
  }

  const handleDeleteReport = async (reportId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (!confirm("Are you sure you want to delete this research report?")) return

    setDeletingId(reportId)
    try {
      const res = await authFetch(`/research-reports/${reportId}`, {
        method: "DELETE",
      })
      if (res.ok) {
        setReports((prev) => prev.filter((r) => r.id !== reportId))
        if (selectedReport?.id === reportId) {
          setSelectedReport(null)
        }
        toast.success("Research report deleted successfully")
      } else {
        toast.error("Failed to delete research report")
      }
    } catch (err) {
      console.error("Delete report error:", err)
      toast.error("Error deleting research report")
    } finally {
      setDeletingId(null)
    }
  }

  const handleRenameReport = async (reportId: string, newTitle: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    try {
      await ResearchReportsService.update(reportId, newTitle)
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, title: newTitle } : r))
      )
      if (selectedReport?.id === reportId) {
        setSelectedReport((prev) => (prev ? { ...prev, title: newTitle } : null))
      }
      toast.success("Report renamed successfully")
    } catch (err) {
      console.error("Rename report error:", err)
      toast.error("Failed to rename report")
    } finally {
      setRenamingId(null)
      setRenameTitle("")
    }
  }

  return (
    <div className="flex-1 p-6 md:p-8 max-w-7xl mx-auto space-y-8 text-[#27272A] bg-[#FAF6F0] min-h-screen">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b-2 border-[#27272A] pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-amber-200 border-1.5 border-[#27272A] rounded font-bold text-xs shadow-[2px_2px_0px_#27272A] mb-2">
            <Bookmark className="h-3.5 w-3.5 text-amber-700" /> Saved Intelligence
          </div>
          <h1 className="text-3xl font-display font-extrabold text-[#27272A]">
            Saved Research Reports
          </h1>
          <p className="text-sm text-[#52525B] font-medium mt-1">
            Access, view, export formatted PDFs, or manage saved CFA equity analyses and portfolio notes.
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#52525B]" />
          <Input
            placeholder="Search reports or symbol..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-white border-2 border-[#27272A] shadow-[2px_2px_0px_#27272A] font-bold text-xs text-[#27272A] h-10"
          />
        </div>
      </div>

      {/* Loading & Permission State Handler */}
      {!canViewReports ? (
        <div className="neubrutal-card bg-white border-2 border-[#27272A] shadow-[4px_4px_0px_#27272A] rounded-xl p-12 text-center space-y-4 max-w-lg mx-auto">
          <div className="h-14 w-14 rounded-full bg-rose-100 border-2 border-[#27272A] shadow-[2px_2px_0px_#27272A] flex items-center justify-center mx-auto text-rose-700 font-bold text-xl">
            🔒
          </div>
          <h3 className="text-lg font-bold text-[#27272A]">Access Restricted</h3>
          <p className="text-xs text-[#52525B] leading-relaxed">
            You do not have permission to view organization research reports. Contact your organization administrator to request report viewing access.
          </p>
        </div>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3 text-center">
          <CustomSpinner size="lg" />
          <p className="text-xs font-bold text-[#52525B]">Loading saved research reports...</p>
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="neubrutal-card bg-white border-2 border-[#27272A] shadow-[4px_4px_0px_#27272A] rounded-xl p-12 text-center space-y-4 max-w-lg mx-auto">
          <div className="h-14 w-14 rounded-full bg-amber-100 border-2 border-[#27272A] shadow-[2px_2px_0px_#27272A] flex items-center justify-center mx-auto text-amber-700">
            <FileText className="h-7 w-7" />
          </div>
          <h3 className="text-lg font-bold text-[#27272A]">No Research Reports Found</h3>
          <p className="text-xs text-[#52525B] leading-relaxed">
            {searchQuery
              ? `No saved reports match "${searchQuery}". Try a different symbol or title.`
              : "Save any AI response in chat using the Save Report button to index it into your organization's research vault."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredReports.map((report) => (
            <div
              key={report.id}
              className="group relative neubrutal-card bg-white border-2 border-[#27272A] shadow-[4px_4px_0px_#27272A] rounded-xl p-5 flex flex-col space-y-3 hover:translate-y-[-2px] transition-all cursor-pointer"
              onClick={() => setSelectedReport(report)}
            >
              {/* 3-dots — top-right, only visible on hover */}
              <div
                className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 border-2 border-[#27272A] bg-white shadow-[1.5px_1.5px_0px_#27272A] hover:bg-amber-100"
                      aria-label="Report actions"
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => setSelectedReport(report)}>
                      <Eye className="mr-2 h-4 w-4" />
                      View
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={isExporting}
                      onClick={() => handleExportPdf(report)}
                    >
                      <FileDown className="mr-2 h-4 w-4" />
                      Export PDF
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={deletingId === report.id}
                      onClick={(e) => handleDeleteReport(report.id, e as any)}
                      className="text-rose-700 focus:text-rose-700 focus:bg-rose-50"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
{deletingId === report.id ? "Deleting…" : "Delete"}
                      </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        setRenamingId(report.id)
                        setRenameTitle(report.title)
                      }}
                    >
                      <Edit2 className="mr-2 h-4 w-4" />
                      Rename
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Title + optional symbol badge */}
              <div className="flex items-start gap-2 pr-8">
                <h3 className="font-extrabold text-base text-[#27272A] line-clamp-2 leading-snug flex-1">
                  {report.title}
                </h3>
                {report.symbol && (
                  <span className="px-2 py-0.5 text-[11px] font-extrabold bg-indigo-100 text-indigo-900 border border-[#27272A] rounded shadow-[1px_1px_0px_#27272A] shrink-0 font-mono">
                    {report.symbol}
                  </span>
                )}
              </div>

              {/* Preview */}
              <p className="text-xs text-[#52525B] line-clamp-4 leading-relaxed">
                {extractText(report.markdown_report).slice(0, 240)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Full Report Reader Modal */}
      <Dialog open={!!selectedReport} onOpenChange={() => setSelectedReport(null)}>
        <DialogContent className="bg-white border-2 border-[#27272A] shadow-[6px_6px_0px_#27272A] rounded-xl p-6 sm:max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader className="border-b-2 border-[#27272A] pb-4 shrink-0">
            <div className="flex items-center justify-between gap-4">
              <DialogTitle className="text-xl font-extrabold text-[#27272A]">
                {selectedReport?.title}
              </DialogTitle>
              {selectedReport?.symbol && (
                <span className="px-2.5 py-0.5 text-xs font-extrabold bg-indigo-100 text-indigo-900 border border-[#27272A] rounded font-mono">
                  {selectedReport.symbol}
                </span>
              )}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4 bg-[#FAF6F0] border-2 border-[#27272A] rounded-lg my-4 space-y-4">
            {selectedReport && (
              <>
                {selectedReport.charts && (
                  <ChartArtifacts {...selectedReport.charts} />
                )}
                <MarkdownRenderer content={selectedReport.markdown_report} />
              </>
            )}
          </div>

          <div className="flex justify-between items-center shrink-0 pt-2 border-t border-[#27272A]">
            {selectedReport && (
              <Button
                onClick={() => handleDeleteReport(selectedReport.id)}
                disabled={deletingId === selectedReport.id}
                className="neubrutal-btn bg-rose-100 hover:bg-rose-200 text-rose-900 font-bold text-xs h-9 px-4 border-2 border-[#27272A] flex items-center gap-1.5 shadow-[2px_2px_0px_#27272A]"
              >
                <Trash2 className="h-4 w-4 text-rose-600" /> Delete Report
              </Button>
            )}

            <div className="flex gap-3">
              <Button
                onClick={() => setSelectedReport(null)}
                variant="outline"
                className="neubrutal-btn border-2 border-[#27272A] font-bold text-xs h-9 px-4"
              >
                Close
              </Button>
              {selectedReport && (
                <Button
                  onClick={() => handleExportPdf(selectedReport)}
                  disabled={isExporting}
                  className="neubrutal-btn-primary border-2 border-[#27272A] font-bold text-xs h-9 px-4 flex items-center gap-2"
                >
                  <FileDown className="h-4 w-4" /> Export Formatted PDF
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename Report Dialog */}
      <Dialog open={!!renamingId} onOpenChange={() => { setRenamingId(null); setRenameTitle("") }}>
        <DialogContent className="bg-white border-2 border-[#27272A] shadow-[6px_6px_0px_#27272A] rounded-xl p-6 max-w-md">
          <DialogHeader className="border-b-2 border-[#27272A] pb-4 shrink-0">
            <DialogTitle className="text-xl font-extrabold text-[#27272A]">Rename Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              placeholder="Enter new title"
              className="border-2 border-[#27272A] font-bold text-xs text-[#27272A] h-10"
              autoFocus
            />
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => { setRenamingId(null); setRenameTitle("") }}
                className="neubrutal-btn border-2 border-[#27272A] font-bold text-xs h-9 px-4"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  const report = reports.find((r) => r.id === renamingId)
                  if (report) handleRenameReport(report.id, renameTitle)
                }}
                className="neubrutal-btn-primary border-2 border-[#27272A] font-bold text-xs h-9 px-4"
              >
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
