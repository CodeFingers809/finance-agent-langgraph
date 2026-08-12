import React from "react"
import ReactMarkdown from "react-markdown"
import rehypeKatex from "rehype-katex"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import "katex/dist/katex.min.css"
import { visit } from "unist-util-visit"

interface MarkdownRendererProps {
  content: string
  className?: string
}

/** Rehype plugin to wrap block math ($$...$$) in a scrollable container. */
function rehypeWrapBlockMath() {
  return (tree: any) => {
    visit(tree, "element", (node: any) => {
      if (node.tagName === "div" && node.properties?.className?.includes("katex-display")) {
        node.properties.className = [...(node.properties.className || []), "katex-block-wrapper"]
        node.properties.style = {
          ...node.properties.style,
          overflowX: "auto",
          overflowY: "hidden",
          maxWidth: "100%",
          padding: "0.5rem",
          margin: "0.5rem 0",
        }
      }
    })
  }
}

/** Rehype plugin to add line-height to inline math for proper spacing without overlapping lines. */
function rehypeInlineMathLineHeight() {
  return (tree: any) => {
    visit(tree, "element", (node: any) => {
      if (
        node.tagName === "span" &&
        node.properties?.className?.includes("katex") &&
        !node.properties.className?.includes("katex-display")
      ) {
        node.properties.style = {
          ...node.properties.style,
          lineHeight: "2.4",
          display: "inline-block",
          verticalAlign: "middle",
          padding: "0.15rem 0.25rem",
        }
      }
    })
  }
}

function cleanMarkdownContent(rawText: string): string {
  if (!rawText) return ""

  let text = rawText

  // Unescape raw python dict/list string representations if present
  if (text.includes("[{'type':") || text.includes('[{"type":')) {
    const parts: string[] = []
    const re = /['"]text['"]:\s*'((?:[^'\\]|\\.)*)'/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      parts.push(m[1].replace(/\\'/g, "'"))
    }
    if (parts.length > 0) {
      text = parts.reduce((acc, part) => {
        if (!acc) return part
        if (/\w$/.test(acc) && /^\w/.test(part)) return acc + " " + part
        return acc + part
      }, "")
    }
  }


  // Replace escaped newlines
  text = text.replace(/\\n/g, "\n")

  // Clean up legacy doubled LaTeX text wrappers
  text = text.replace(/\\text\{\\text\{₹\}\}/g, "₹").replace(/\\text\{₹\}/g, "₹")

  // Fix bare % inside math mode to prevent TeX comment syntax breaking math mode
  text = text.replace(/\$\$([\s\S]*?)\$\$|\$([^$\n]+?)\$/g, (match) =>
    match.replace(/(?<!\\)%/g, "\\%")
  )

  return text
}

/** Helper to parse <br> / <br/> / <br /> tags inside table cell children and render them as actual line breaks. */
function renderCellWithBr(node: React.ReactNode): React.ReactNode {
  if (typeof node === "string") {
    if (/<br\s*\/?>/i.test(node)) {
      const parts = node.split(/<br\s*\/?>/gi)
      return parts.map((part, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && <br />}
          {part}
        </React.Fragment>
      ))
    }
    return node
  }
  if (Array.isArray(node)) {
    return node.map((child, idx) => (
      <React.Fragment key={idx}>{renderCellWithBr(child)}</React.Fragment>
    ))
  }
  if (React.isValidElement(node) && (node.props as any)?.children) {
    return React.cloneElement(node, {
      ...(node.props as any),
      children: renderCellWithBr((node.props as any).children),
    })
  }
  return node
}

/** Custom component to render table cells with <br> as line breaks within the cell. */
function TableCell({ children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className="px-3 py-2 text-[#27272A] font-medium whitespace-normal break-words align-top" {...props}>
      <div className="leading-relaxed whitespace-pre-wrap">{renderCellWithBr(children)}</div>
    </td>
  )
}

/** Custom component for table header cells. */
function TableHeaderCell({ children, ...props }: React.ThHTMLAttributes<HTMLTableHeaderCellElement>) {
  return (
    <th className="px-3 py-2 text-left font-extrabold text-[#27272A] align-top" {...props}>
      <div className="leading-relaxed whitespace-pre-wrap">{renderCellWithBr(children)}</div>
    </th>
  )
}

export function MarkdownRenderer({
  content,
  className = "",
}: MarkdownRendererProps) {
  const cleanedText = cleanMarkdownContent(content)

  return (
    <div
      className={`markdown-content space-y-3 leading-loose text-xs md:text-sm text-[#27272A] max-w-full overflow-hidden ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          [rehypeKatex, { strict: false, throwOnError: false }],
          rehypeWrapBlockMath,
          rehypeInlineMathLineHeight,
        ]}
        components={{
          h1: ({ children }) => (
            <h1 className="font-display font-extrabold text-base md:text-lg border-b-2 border-[#27272A] pb-1 mt-4 mb-2 text-[#27272A]">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="font-display font-bold text-sm md:text-base border-b border-[#27272A]/30 pb-0.5 mt-3.5 mb-1.5 text-[#27272A]">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="font-display font-bold text-xs md:text-sm mt-3 mb-1 text-[#27272A]">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="my-2 leading-loose break-words">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside space-y-1 my-2 pl-1">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-1 my-2 pl-1">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="my-0.5 leading-relaxed">{children}</li>
          ),
          strong: ({ children }) => (
            <strong className="font-extrabold text-[#27272A] bg-amber-200/60 px-1 py-0.5 rounded border border-[#27272A]/20">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-[#52525B]">{children}</em>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-[#2563EB] bg-[#FFFBEB] p-2.5 rounded-r my-2 text-xs text-[#27272A] italic">
              {children}
            </blockquote>
          ),
          pre: ({ children }) => (
            <div className="my-3 overflow-x-auto max-w-full rounded-lg bg-[#27272A] p-3 text-white border-2 border-[#27272A] shadow-[2.5px_2.5px_0px_#27272A]">
              <pre className="font-mono text-xs overflow-x-auto whitespace-pre max-w-full">
                {children}
              </pre>
            </div>
          ),
          code: ({ node, className, children, ...props }: any) => {
            const isInline = !className && !node?.position?.start?.line
            if (isInline) {
              return (
                <code className="font-mono text-[11px] bg-[#F3ECE1] border border-[#27272A]/30 px-1.5 py-0.5 rounded text-[#27272A] break-all">
                  {children}
                </code>
              )
            }
            return (
              <code className="font-mono text-xs whitespace-pre" {...props}>
                {children}
              </code>
            )
          },

          table: ({ children }) => (
            <div className="overflow-x-auto max-w-full my-3 border-2 border-[#27272A] rounded-lg shadow-[2px_2px_0px_#27272A]">
              <table className="min-w-full divide-y-2 divide-[#27272A] bg-white text-xs">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-amber-100 font-extrabold text-[#27272A]">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-[#27272A]/20">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-amber-50/50 transition-colors">
              {children}
            </tr>
          ),
          th: TableHeaderCell,
          td: TableCell,
        }}
      >
        {cleanedText}
      </ReactMarkdown>
    </div>
  )
}