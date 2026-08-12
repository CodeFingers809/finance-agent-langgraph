import html2canvas from "html2canvas"
import jsPDF from "jspdf"
import { createRoot } from "react-dom/client"

import {
  ChartArtifacts,
  type ChartArtifactsProps,
} from "@/components/Chat/ChartArtifacts"
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
    scale: 3,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
    // Capture the full laid-out size; the element is off-screen, so
    // html2canvas would otherwise clip to the viewport.
    width: el.scrollWidth,
    height: el.scrollHeight,
    windowWidth: RENDER_WIDTH,
    onclone: (_doc, clonedEl) => {
      const node = clonedEl as HTMLElement
      node.style.position = "static"

      node.style.left = "0"
      node.style.top = "0"
      node.style.width = `${RENDER_WIDTH}px`
      node.style.overflow = "visible"
      node.style.maxHeight = "none"
      node.style.backgroundColor = "#ffffff"
      node.style.color = "#27272a"
      node.style.fontFamily = "Arial, Helvetica, sans-serif"

      // Tailwind v4 emits oklch() / oklab() — html2canvas cannot parse either.
      // Replace modern color functions safely: text/borders -> #27272a, backgrounds -> transparent/white.
      const MODERN_COLOR = /okl(?:ch|ab)\([^)]+\)/g

      for (const child of Array.from(node.querySelectorAll<HTMLElement>("*"))) {
        child.style.overflow = "visible"
        child.style.maxHeight = "none"
        child.style.fontFamily = "Arial, Helvetica, sans-serif"

        const tagName = child.tagName.toLowerCase()

        // Ensure inline emphasis tags (strong, b, em, i, mark) have NO background boxes and maintain proper adjacent word spacing
        if (tagName === "strong" || tagName === "mark" || tagName === "b" || tagName === "em" || tagName === "i") {
          child.style.backgroundColor = "transparent"
          child.style.border = "none"
          child.style.padding = "0"
          child.style.boxShadow = "none"
          child.style.display = "inline"
          child.style.marginRight = "0.2em"
          if (tagName === "em" || tagName === "i") {
            child.style.fontStyle = "italic"
          } else {
            child.style.fontWeight = "bold"
          }
          child.style.color = "#27272a"
        }

        if (tagName === "p" || tagName === "li" || tagName === "div" || tagName === "td" || tagName === "span") {
          child.style.lineHeight = "1.8"
          child.style.wordSpacing = "0.15em"
          child.style.letterSpacing = "normal"
        }

        // Sanitize inline style
        const inline = child.getAttribute("style")
        if (inline && MODERN_COLOR.test(inline)) {
          child.setAttribute("style", inline.replace(MODERN_COLOR, "#27272a"))
        }
        MODERN_COLOR.lastIndex = 0

        // Sanitize computed colors
        const computed = getComputedStyle(child)
        for (const prop of ["color", "borderColor", "outlineColor", "stroke"] as const) {
          const val = computed[prop]
          if (val && MODERN_COLOR.test(val)) {
            child.style[prop] = "#27272a"
            MODERN_COLOR.lastIndex = 0
          }
        }

        const bgVal = computed.backgroundColor
        if (bgVal && MODERN_COLOR.test(bgVal)) {
          if (tagName === "strong" || tagName === "mark" || tagName === "b" || tagName === "em" || tagName === "i") {
            child.style.backgroundColor = "transparent"
          } else if (tagName === "thead" || tagName === "th") {
            child.style.backgroundColor = "#fef3c7" // Soft amber table header
          } else if (tagName === "blockquote") {
            child.style.backgroundColor = "#fffbeb"
          } else if (child.classList.contains("katex-block-wrapper") || child.classList.contains("katex-display")) {
            child.style.backgroundColor = "#fafafa"
          } else {
            child.style.backgroundColor = "transparent"
          }
          MODERN_COLOR.lastIndex = 0
        }
      }



      // Fix KaTeX rendering: ensure math elements wrap/scale cleanly in PDF without scrollbars
      for (const katexEl of Array.from(node.querySelectorAll<HTMLElement>(".katex, .katex-display, .katex-block-wrapper"))) {
        katexEl.style.overflow = "visible"
        katexEl.style.maxHeight = "none"
        katexEl.style.maxWidth = "100%"
        katexEl.style.boxSizing = "border-box"

        if (katexEl.classList.contains("katex-display") || katexEl.classList.contains("katex-block-wrapper")) {
          katexEl.style.display = "block"
          katexEl.style.overflowX = "visible"
          katexEl.style.overflowY = "visible"
          katexEl.style.fontSize = "95%"
        }
      }

      // Fix table rendering: prevent tables from breaking ugly mid-row
      for (const tableEl of Array.from(node.querySelectorAll<HTMLElement>("table, tr, td, th"))) {
        tableEl.style.pageBreakInside = "avoid"
        tableEl.style.breakInside = "avoid"
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
  charts?: ChartArtifactsProps
}

/** Render a report to a styled, paginated PDF. */
export async function exportFormattedReportPdf(
  options: ExportReportOptions,
): Promise<void> {
  const { title, markdownReport, symbol, createdAt, modelName, filename, charts } =
    options

  const container = document.createElement("div")
  // Off-screen but laid out at print width so text wraps as it will on paper.
  container.style.position = "fixed"
  container.style.left = "-10000px"
  container.style.top = "0"
  container.style.width = `${RENDER_WIDTH}px`
  container.style.backgroundColor = "#ffffff"
  container.style.color = "#27272A"
  container.style.fontFamily = "Arial, Helvetica, sans-serif"
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

      {/* Charts first — visual artifacts before the report text */}
      {charts && (
        <div className="mb-8">
          <ChartArtifacts {...charts} />
        </div>
      )}

      <MarkdownRenderer content={markdownReport} />
    </div>,
  )


  try {
    // Wait for fonts, KaTeX, and layout before rasterizing -- capturing too
    // early yields a blank or half-styled page.
    await document.fonts?.ready
    // Wait for KaTeX to render (it renders asynchronously)
    await new Promise((resolve) => requestAnimationFrame(resolve))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    // Give KaTeX more time to render complex formulas
    await new Promise((resolve) => setTimeout(resolve, 1500))
    // Additional wait for any remaining async rendering
    await new Promise((resolve) => requestAnimationFrame(resolve))

    const target = (container.firstElementChild as HTMLElement) ?? container
    const safeSymbol = (symbol || "report").replace(/[^a-zA-Z0-9]/g, "")
    await exportElementToPdf(target, filename || `Report_${safeSymbol}`)
  } finally {
    root.unmount()
    container.remove()
  }
}