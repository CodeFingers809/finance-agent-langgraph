import html2canvas from "html2canvas"
import jsPDF from "jspdf"
import { createRoot } from "react-dom/client"

import { MarkdownRenderer } from "@/components/Common/MarkdownRenderer"

/** Rendered width in CSS px. ~A4 content width at 96dpi, so text wraps like print. */
const RENDER_WIDTH = 794
const PAGE_MARGIN_MM = 10

/**
 * Rasterize an element and lay it into a paginated A4 PDF.
 *
 * Pages are sliced from the source canvas (rather than re-offsetting one tall
 * image) so each page carries only its own strip -- otherwise every page holds
 * the full-height image and the file balloons.
 */
export async function exportElementToPdf(
  el: HTMLElement,
  filename: string,
): Promise<void> {
  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
    // Capture the full laid-out size; the element is off-screen, so
    // html2canvas would otherwise clip to the viewport.
    width: el.scrollWidth,
    height: el.scrollHeight,
    windowWidth: RENDER_WIDTH,
    onclone: (_doc, clonedEl) => {
      // The live element is positioned off-screen for capture; the clone must
      // sit at the origin and be fully visible or content gets clipped.
      const node = clonedEl as HTMLElement
      node.style.position = "static"
      node.style.left = "0"
      node.style.top = "0"
      node.style.width = `${RENDER_WIDTH}px`
      node.style.overflow = "visible"
      node.style.maxHeight = "none"
      // Tailwind v4 emits oklch(), which html2canvas cannot parse; anything
      // still using it would render black.
      for (const child of Array.from(node.querySelectorAll<HTMLElement>("*"))) {
        child.style.overflow = "visible"
        child.style.maxHeight = "none"
        const inline = child.getAttribute("style")
        if (inline?.includes("oklch")) {
          child.setAttribute(
            "style",
            inline.replace(/oklch\([^)]+\)/g, "#27272a"),
          )
        }
      }
    },
  })

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const contentWidth = pageWidth - PAGE_MARGIN_MM * 2
  const contentHeight = pageHeight - PAGE_MARGIN_MM * 2

  // px-per-mm at the captured scale, used to convert page height into source px.
  const pxPerMm = canvas.width / contentWidth
  const sliceHeightPx = Math.floor(contentHeight * pxPerMm)

  let offsetY = 0
  let pageIndex = 0

  while (offsetY < canvas.height) {
    const currentSliceHeight = Math.min(sliceHeightPx, canvas.height - offsetY)

    const slice = document.createElement("canvas")
    slice.width = canvas.width
    slice.height = currentSliceHeight
    const ctx = slice.getContext("2d")
    if (!ctx) throw new Error("Could not create canvas context for PDF export")
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, slice.width, slice.height)
    ctx.drawImage(
      canvas,
      0,
      offsetY,
      canvas.width,
      currentSliceHeight,
      0,
      0,
      canvas.width,
      currentSliceHeight,
    )

    if (pageIndex > 0) pdf.addPage()
    pdf.addImage(
      slice.toDataURL("image/png"),
      "PNG",
      PAGE_MARGIN_MM,
      PAGE_MARGIN_MM,
      contentWidth,
      currentSliceHeight / pxPerMm,
    )

    offsetY += currentSliceHeight
    pageIndex += 1
  }

  pdf.save(`${filename.replace(/[^a-zA-Z0-9\-_]/g, "_")}.pdf`)
}

interface ExportReportOptions {
  title: string
  markdownReport: string
  symbol?: string | null
  createdAt?: string
  modelName?: string | null
  filename?: string
}

/** Render a report to a styled, paginated PDF. */
export async function exportFormattedReportPdf(
  options: ExportReportOptions,
): Promise<void> {
  const { title, markdownReport, symbol, createdAt, modelName, filename } =
    options

  const container = document.createElement("div")
  // Off-screen but laid out at print width so text wraps as it will on paper.
  container.style.position = "fixed"
  container.style.left = "-10000px"
  container.style.top = "0"
  container.style.width = `${RENDER_WIDTH}px`
  container.style.backgroundColor = "#ffffff"
  container.style.color = "#27272A"
  container.style.fontFamily = "system-ui, -apple-system, sans-serif"
  document.body.appendChild(container)

  const root = createRoot(container)

  root.render(
    <div className="bg-white p-10 text-[#27272A]">
      <header className="mb-8 border-b-4 border-[#27272A] pb-5">
        <h1 className="mb-2 text-3xl font-extrabold leading-tight">{title}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#52525B]">
          {symbol && (
            <span className="rounded bg-[#2563EB] px-2 py-0.5 font-mono font-bold text-white">
              {symbol}
            </span>
          )}
          <span>
            {createdAt
              ? new Date(createdAt).toLocaleDateString()
              : new Date().toLocaleDateString()}
          </span>
          {modelName && <span>Generated by {modelName}</span>}
        </div>
      </header>

      <MarkdownRenderer content={markdownReport} />
    </div>,
  )

  try {
    // Wait for fonts, KaTeX, and layout before rasterizing -- capturing too
    // early yields a blank or half-styled page.
    await document.fonts?.ready
    await new Promise((resolve) => requestAnimationFrame(resolve))
    await new Promise((resolve) => setTimeout(resolve, 250))

    const target = (container.firstElementChild as HTMLElement) ?? container
    const safeSymbol = (symbol || "report").replace(/[^a-zA-Z0-9]/g, "")
    await exportElementToPdf(target, filename || `Report_${safeSymbol}`)
  } finally {
    root.unmount()
    container.remove()
  }
}
