import ReactMarkdown from "react-markdown"
import rehypeKatex from "rehype-katex"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import "katex/dist/katex.min.css"

interface MarkdownRendererProps {
  content: string
  className?: string
}

function cleanMarkdownContent(rawText: string): string {
  if (!rawText) return ""

  let text = rawText

  // Unescape raw python dict/list string representations if present
  if (text.includes("[{'type':") || text.includes('[{"type":')) {
    try {
      const matches = [...text.matchAll(/['"]text['"]:\s*['"](.*?)['"]/g)]
      if (matches.length > 0) {
        text = matches.map((m) => m[1]).join("")
      }
    } catch (_e) {
      // Fallback
    }
  }

  // Replace escaped newlines
  text = text.replace(/\\n/g, "\n")
  
  // Fix LaTeX compatibility for KaTeX:
  // 1. Escape rupee symbol (₹) with \text{} to use text font
  text = text.replace(/₹/g, "\\text{₹}")
  
  // 2. Fix division overlaps by replacing / with proper fractions
  // Convert "a / b" patterns in math mode to use \frac or \dfrac
  // Look for patterns like: number / number or symbol / number
  text = text.replace(/\$([^$]*\/[^$]*)\$/g, (_match, content) => {
    const fixed = content.replace(/\s*([^\s]+)\s*\/\s*([^\s]+)\s*/g, "\\dfrac{$1}{$2}")
    return `$${fixed}$`
  })
  
  return text
}

export function MarkdownRenderer({
  content,
  className = "",
}: MarkdownRendererProps) {
  const cleanedText = cleanMarkdownContent(content)

  return (
    <div
      className={`markdown-content space-y-2 leading-relaxed text-xs md:text-sm text-[#27272A] ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          h1: ({ children }) => (
            <h1 className="font-display font-extrabold text-base md:text-lg border-b-2 border-[#27272A] pb-1 mt-3 mb-2 text-[#27272A]">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="font-display font-bold text-sm md:text-base border-b border-[#27272A]/30 pb-0.5 mt-3 mb-1.5 text-[#27272A]">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="font-display font-bold text-xs md:text-sm mt-2.5 mb-1 text-[#27272A]">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="my-1.5 leading-relaxed">{children}</p>
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
          code: ({ children }) => (
            <code className="font-mono text-[11px] bg-[#F3ECE1] border border-[#27272A]/30 px-1.5 py-0.5 rounded text-[#27272A]">
              {children}
            </code>
          ),

          table: ({ children }) => (
            <div className="overflow-x-auto my-3 border-2 border-[#27272A] rounded-lg shadow-[2px_2px_0px_#27272A]">
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
          th: ({ children }) => (
            <th className="px-3 py-2 text-left font-extrabold text-[#27272A]">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-[#27272A] font-medium">{children}</td>
          ),
        }}
      >
        {cleanedText}
      </ReactMarkdown>
    </div>
  )
}
