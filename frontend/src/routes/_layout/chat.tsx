import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router"
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Square,
  User,
} from "lucide-react"


import { useEffect, useRef, useState, useCallback } from "react"
import { OpenAPI } from "@/client"
import { authFetch, authHeader } from "@/lib/authFetch"
import { MessageActionBar } from "@/components/Chat/MessageActionBar"
import { ChartArtifacts } from "@/components/Chat/ChartArtifacts"
import { CustomSpinner } from "@/components/Common/CustomSpinner"
import { MarkdownRenderer } from "@/components/Common/MarkdownRenderer"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  decodeProtobufEvent,
  type ParsedStreamEvent,
} from "@/proto/financial_agent"

const getApiUrl = (path: string) => {
  const base = OpenAPI.BASE || "http://localhost:8000/api/v1"
  const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base
  const hasApiV1 = cleanBase.includes("/api/v1")
  const prefix = hasApiV1 ? cleanBase : `${cleanBase}/api/v1`
  const cleanPath = path.startsWith("/") ? path : `/${path}`
  return `${prefix}${cleanPath}`
}

export const Route = createFileRoute("/_layout/chat")({
  component: ChatPage,
  validateSearch: (search: Record<string, unknown>): { convId?: string } => {
    return {
      convId: search.convId as string | undefined,
    }
  },
})

interface ChatMessageItem {
  id: string
  sender: "user" | "agent"
  content: string
  metadata_json?: string | null
  created_at?: string
  tool_events?: any[]
  hrp_table?: { symbols: string[]; weights: number[]; summaryNotes: string }
  priceChart?: any
  growthChart?: any
  analystChart?: any
  fiiDiiChart?: any
}


function formatSafeValue(val: any): string {
  if (val === null || val === undefined) return ""
  if (typeof val === "object") {
    if ("low" in val && typeof val.low === "number") {
      return String(val.low)
    }
    try {
      return JSON.stringify(val)
    } catch {
      return String(val)
    }
  }
  return String(val)
}



function renderFormattedText(rawText: string): string {
  if (!rawText) return ""

  let text = rawText
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

  text = text.replace(/\\n/g, "\n")
  return text
}

function ChatPage() {
  const navigate = useNavigate()
  const search = useSearch({ from: "/_layout/chat" })
  const activeConvIdFromUrl = search?.convId

  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    activeConvIdFromUrl || null,
  )
  const [messages, setMessages] = useState<ChatMessageItem[]>([])

  const [inputMessage, setInputMessage] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isThinkingToolsActive, setIsThinkingToolsActive] = useState(false)
  const [isRateLimited, setIsRateLimited] = useState(false)
  const [activeToolEvents, setActiveToolEvents] = useState<any[]>([])



  const [isTimelineOpen, setIsTimelineOpen] = useState(false)
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return (
      localStorage.getItem("selected_gemini_model") || "gemini-3.5-flash-lite"
    )
  })
  const [isResearchMode, setIsResearchMode] = useState(false)
  const [researchStage, setResearchStage] = useState<string | null>(null)
  const [isResearchLogOpen, setIsResearchLogOpen] = useState(false)
  const [researchLogHistory, setResearchLogHistory] = useState<string[]>([])



  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const isUserScrolledUpRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  const scrollToBottom = useCallback((smooth = true) => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      })
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" })
    }
  }, [])

  const handleScroll = useCallback(() => {
    const el = chatContainerRef.current
    if (!el) return
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight

    // Re-engage auto-scroll lock if user scrolls back down near the bottom (<= 40px)
    if (distanceToBottom <= 40) {
      isUserScrolledUpRef.current = false
      setShowScrollBottomBtn(false)
    } else if (distanceToBottom > 80) {
      // Break auto-scroll lock if user scrolls up (> 80px from bottom)
      isUserScrolledUpRef.current = true
      setShowScrollBottomBtn(true)
    }
  }, [])

  // Auto-scroll when messages or tool execution events stream in, unless user manually scrolled up
  useEffect(() => {
    if (messages.length > 0 && !isUserScrolledUpRef.current) {
      scrollToBottom(false)
    }
  }, [messages, activeToolEvents, researchLogHistory, scrollToBottom])


  // Fetch quota status — only once on mount, then every 5 minutes (cached)
  const fetchQuotaStatus = useCallback(async () => {
    try {
      const res = await authFetch("/agent/quota")
      if (res.ok) {
        const data = await res.json()
        if (data.is_limited) {
          setIsRateLimited(true)
        } else {
          setIsRateLimited(false)
        }
      }
    } catch (e) {
      console.error("Failed to fetch quota", e)
    }
  }, [])

  // Fetch messages for active conversation
  const fetchMessages = useCallback(async (convId: string) => {
    try {
      const res = await authFetch(`/agent/conversations/${convId}/messages`)
      if (res.ok) {
        const data = await res.json()
        setMessages(
          data.map((m: any) => {
            let priceChart: any = null
            let growthChart: any = null
            let analystChart: any = null
            let fiiDiiChart: any = null
            let hrp_table: any = null

            if (m.metadata_json) {
              try {
                const meta: any =
                  typeof m.metadata_json === "string"
                    ? JSON.parse(m.metadata_json)
                    : m.metadata_json

                if (Array.isArray(meta)) {
                  // Stored as tool_events_log: [{type:"price_chart", ...}, ...]
                  for (const evt of meta) {
                    if (evt.type === "price_chart") {
                      priceChart = {
                        symbol: evt.symbol,
                        points: evt.points,
                        period: evt.period,
                      }
                    } else if (evt.type === "growth_chart") {
                      growthChart = {
                        symbol: evt.symbol,
                        quarters: evt.quarters,
                        revenue: evt.revenue,
                        netIncome: evt.net_income,
                        yoyGrowthPct: evt.yoy_growth_pct,
                        qoqGrowthPct: evt.qoq_growth_pct,
                      }
                    } else if (evt.type === "analyst_chart") {
                      analystChart = {
                        symbol: evt.symbol,
                        dates: evt.dates,
                        targetPrices: evt.target_prices,
                        firms: evt.firms,
                        currentPrice: evt.current_price,
                      }
                    } else if (evt.type === "fii_dii_chart") {
                      fiiDiiChart = {
                        symbol: evt.symbol || undefined,
                        dates: evt.dates,
                        fiiNetCr: evt.fii_net_cr,
                        diiNetCr: evt.dii_net_cr,
                      }
                    } else if (evt.type === "hrp_result") {
                      hrp_table = {
                        symbols: evt.symbols,
                        weights: evt.weights,
                        summaryNotes: evt.summary_notes,
                      }
                    }
                  }
                } else {
                  // Fallback: already shaped as camelCase object
                  priceChart = meta?.priceChart
                  growthChart = meta?.growthChart
                  analystChart = meta?.analystChart
                  fiiDiiChart = meta?.fiiDiiChart
                  hrp_table = meta?.hrp_table
                }
              } catch (_e) {
                // ignore parse errors
              }
            }

            return {
              id: m.id,
              sender: m.sender,
              content: m.content,
              metadata_json: m.metadata_json,
              created_at: m.created_at,
              priceChart,
              growthChart,
              analystChart,
              fiiDiiChart,
              hrp_table,
            }
          }),
        )

        // Reset scroll position to bottom on conversation load
        isUserScrolledUpRef.current = false
        setTimeout(() => scrollToBottom(false), 50)
      }
    } catch (e) {
      console.error("Failed to fetch messages", e)
    }
  }, [scrollToBottom])

  // Fetch quota on mount only; refetch every 5 min
  useEffect(() => {
    fetchQuotaStatus()
    const quotaTimer = setInterval(fetchQuotaStatus, 5 * 60 * 1000)
    return () => clearInterval(quotaTimer)
  }, [fetchQuotaStatus])

  // Fetch messages when conversation changes
  useEffect(() => {
    if (isGenerating) return

    if (activeConvIdFromUrl) {
      setActiveConversationId(activeConvIdFromUrl)
      fetchMessages(activeConvIdFromUrl)
    } else {
      setActiveConversationId(null)
      setMessages([])
      setActiveToolEvents([])
      setIsTimelineOpen(false)
      setIsThinkingToolsActive(false)
    }
  }, [activeConvIdFromUrl, isGenerating, fetchMessages])

  const handleBranchChat = async (untilMsgId: string) => {
    if (!activeConversationId) return
    try {
      const res = await authFetch(
        `/agent/conversations/${activeConversationId}/branch`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ until_message_id: untilMsgId }),
        },
      )
      if (res.ok) {
        const data = await res.json()
        const newId = data.new_conversation_id
        if (newId) {
          setActiveConversationId(newId)
          fetchMessages(newId)
          navigate({
            to: "/chat",
            search: { convId: newId } as any,
            replace: true,
          })
        }
      }
    } catch (err) {
      console.error("Branch conversation error", err)
    }
  }

  const handleModelChange = (value: string) => {
    setSelectedModel(value)
    localStorage.setItem("selected_gemini_model", value)
  }

  const handleStopStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setIsGenerating(false)
      setIsThinkingToolsActive(false)
    }
  }

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isGenerating || isRateLimited) return

    const userText = inputMessage.trim()
    setInputMessage("")

    const userMsgId = `user-${Date.now()}`
    const agentMsgId = `agent-${Date.now()}`

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, sender: "user", content: userText },
      { id: agentMsgId, sender: "agent", content: "" },
    ])

    setIsGenerating(true)
    setIsThinkingToolsActive(true)
    setActiveToolEvents([])
    setIsTimelineOpen(false)
    setResearchStage(null)
    setResearchLogHistory([])

    isUserScrolledUpRef.current = false
    setShowScrollBottomBtn(false)
    setTimeout(() => scrollToBottom(true), 50)


    const controller = new AbortController()
    abortControllerRef.current = controller

    const streamUrl = isResearchMode
      ? getApiUrl("/agent/research/stream")
      : getApiUrl("/agent/chat/stream")

    const streamBody = isResearchMode
      ? {
          query: userText,
          model_name: selectedModel,
          conversation_id: activeConversationId || null,
        }
      : {
          conversation_id: activeConversationId || null,
          message: userText,
          model_name: selectedModel,
        }


    let accumulatedText = ""

    try {

      const response = await fetch(streamUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeader()),
        },
        body: JSON.stringify(streamBody),
        signal: controller.signal,
      })

      if (response.status === 429) {
        setIsRateLimited(true)
        const errJson = await response.json().catch(() => ({}))
        const errMsg =
          errJson.detail || "Daily API rate limit exceeded. Chat disabled."
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === agentMsgId ? { ...msg, content: `⚠️ ${errMsg}` } : msg,
          ),
        )

        setIsGenerating(false)
        setIsThinkingToolsActive(false)
        return
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to reach agent`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      const toolLogs: any[] = []
      let hrpData: any = null



      if (reader) {
        let buffer = ""
        let currentEventType = ""
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEventType = line.slice(7).trim()
            } else if (line.startsWith("data: ")) {
              const b64Data = line.slice(6).trim()
              if (!b64Data) continue

              const evt: ParsedStreamEvent = decodeProtobufEvent(b64Data)

              if (currentEventType === "text_stream" || evt.textChunk?.text) {
                if (evt.textChunk?.text) {
                  const chunk = evt.textChunk.text
                  if (
                    chunk.startsWith("[CONVERSATION_ID:") ||
                    chunk.startsWith("[RESEARCH_CONVERSATION_ID:")
                  ) {
                    const tag = chunk.startsWith("[RESEARCH_CONVERSATION_ID:")
                      ? "[RESEARCH_CONVERSATION_ID:"
                      : "[CONVERSATION_ID:"
                    const newId = chunk.replace(tag, "").replace("]", "").trim()
                    if (newId && !activeConversationId) {
                      setActiveConversationId(newId)
                      navigate({
                        to: "/chat",
                        search: { convId: newId } as any,
                        replace: true,
                      })
                    }
                  } else if (chunk.startsWith("[RESEARCH_STAGE:")) {
                    const stageStr = chunk
                      .replace("[RESEARCH_STAGE:", "")
                      .replace("]", "")
                    const parts = stageStr.split(":")
                    const stage = parts[0]
                    const status = parts[1]
                    const detail = parts.slice(2).join(":")

                    let logText = ""
                    if (detail && detail.trim()) {
                      logText = detail.trim()
                    } else {
                      const stageLabels: Record<string, string> = {
                        data_gathering: "Phase 1: Iterative Data Gathering",
                        synthesis: "Phase 2: Synthesizing Final Research Report",
                      }
                      const label = stageLabels[stage] || stage
                      logText = `${label} (${status === "running" || status === "planning" || status === "executing" ? "In Progress..." : "Complete"})`
                    }

                    setResearchStage(logText)
                    setResearchLogHistory((prev) =>
                      prev.includes(logText) ? prev : [...prev, logText],
                    )
                  } else {
                    let cleanChunk = chunk
                    if (cleanChunk.includes("[{'type':") || cleanChunk.includes('[{"type":')) {
                      cleanChunk = cleanChunk
                        .replace(/\[\{'type':\s*'text',\s*'text':\s*'(.*?)'(?:,\s*'index':\s*\d+)?\}\]/g, "$1")
                        .replace(/\[\{"type":\s*"text",\s*"text":\s*"(.*?)"(?:,\s*"index":\s*\d+)?\}\]/g, "$1")
                    }
                    accumulatedText += cleanChunk
                    setIsThinkingToolsActive(false)
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === agentMsgId
                          ? { ...msg, content: accumulatedText }
                          : msg,
                      ),
                    )
                  }
                }
              }


              if (
                currentEventType === "tool_event" ||
                !currentEventType ||
                evt.toolStart ||
                evt.toolEnd ||
                evt.hrpResult ||
                evt.errorMessage
              ) {
                if (evt.toolStart) {
                  toolLogs.push({
                    id: `tool-${Date.now()}-${toolLogs.length}`,
                    status: "running",
                    toolName: formatSafeValue(evt.toolStart.toolName),
                    argumentsJson: formatSafeValue(evt.toolStart.argumentsJson),
                  })
                  setActiveToolEvents([...toolLogs])
                }

                if (evt.toolEnd) {
                  const safeName = formatSafeValue(evt.toolEnd.toolName)
                  const safeOutput = formatSafeValue(evt.toolEnd.outputJson)
                  const safeTime = formatSafeValue(evt.toolEnd.executionTimeMs)

                  const existingIdx = toolLogs.findIndex(
                    (t) => t.toolName === safeName && t.status === "running",
                  )
                  if (existingIdx !== -1) {
                    toolLogs[existingIdx] = {
                      ...toolLogs[existingIdx],
                      status: "completed",
                      outputJson: safeOutput,
                      executionTimeMs: safeTime,
                    }
                  } else {
                    toolLogs.push({
                      id: `tool-${Date.now()}-${toolLogs.length}`,
                      status: "completed",
                      toolName: safeName,
                      outputJson: safeOutput,
                      executionTimeMs: safeTime,
                    })
                  }
                  setActiveToolEvents([...toolLogs])
                }

                if (evt.hrpResult) {
                  hrpData = evt.hrpResult
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === agentMsgId
                        ? { ...msg, hrp_table: hrpData }
                        : msg,
                    ),
                  )
                }

                if (evt.priceChart?.points && evt.priceChart.points.length > 0) {
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === agentMsgId
                        ? { ...msg, priceChart: evt.priceChart }
                        : msg,
                    ),
                  )
                }
                if (evt.growthChart?.quarters && evt.growthChart.quarters.length > 0) {
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === agentMsgId
                        ? { ...msg, growthChart: evt.growthChart }
                        : msg,
                    ),
                  )
                }
                if (evt.analystChart?.targetPrices && evt.analystChart.targetPrices.length > 0) {
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === agentMsgId
                        ? { ...msg, analystChart: evt.analystChart }
                        : msg,
                    ),
                  )
                }
                if (evt.fiiDiiChart?.dates && evt.fiiDiiChart.dates.length > 0) {
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === agentMsgId
                        ? { ...msg, fiiDiiChart: evt.fiiDiiChart }
                        : msg,
                    ),
                  )
                }


                if (evt.errorMessage) {
                  accumulatedText += `\n\n⚠️ ${evt.errorMessage}`
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === agentMsgId
                        ? { ...msg, content: accumulatedText }
                        : msg,
                    ),
                  )
                }
              }
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === agentMsgId
              ? { ...msg, content: `${msg.content} [Stopped]` }
              : msg,
          ),
        )
      } else {
        const errorDetail = err?.message || "Stream connection failed"
        const friendlyMsg = accumulatedText
          ? `${accumulatedText}\n\n⚠️ Error: ${errorDetail}. Please wait a few seconds and try again.`
          : `⚠️ Error: ${errorDetail}. Please wait a few seconds and try again.`

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === agentMsgId
              ? {
                  ...msg,
                  content: friendlyMsg,
                }
              : msg,
          ),
        )
      }
    } finally {
      setIsGenerating(false)
      setIsThinkingToolsActive(false)
      abortControllerRef.current = null
      fetchQuotaStatus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const maxTimeMs = activeToolEvents.reduce(
    (max, event) => Math.max(max, event.executionTimeMs || 0),
    0,
  )

  return (
    <div className="relative h-[calc(100vh-4rem)] flex flex-col bg-[#FAF6F0] overflow-hidden font-sans">
      {/* Main Chat Messages Stream Container */}
      <div
        ref={chatContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 md:px-8 pt-4 pb-32 space-y-6"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full max-w-lg mx-auto text-center space-y-4 py-12">
            <div className="h-16 w-16 rounded-2xl bg-amber-200 border-2 border-[#27272A] shadow-[3px_3px_0px_#27272A] flex items-center justify-center text-[#27272A]">
              <Bot className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <h2 className="font-display font-extrabold text-xl text-[#27272A]">
                Financial Intelligence Terminal
              </h2>
              <p className="text-xs text-[#52525B] font-medium leading-relaxed">
                Ask about Indian stock prices, fundamental financials, technical indicators, news, portfolio HRP optimization, or enable Research Mode for deep multi-sector analysis.
              </p>
            </div>
          </div>
        )}

        {messages.map((m, mIdx) => {
          const formattedContent = renderFormattedText(m.content)
          const isLatestAgentMsg =
            m.sender === "agent" && mIdx === messages.length - 1

          // Divider rendering for branched chats
          if (m.content.startsWith("[BRANCHED_TO:")) {
            const parts = m.content.split(":")
            const targetId = parts[1]
            const targetTitle = parts[2]?.replace("]", "") || "New Chat"

            return (
              <div
                key={m.id}
                className="flex items-center justify-center my-4 max-w-4xl mx-auto"
              >
                <div className="border-t-2 border-dashed border-[#27272A] flex-1" />
                <button
                  type="button"
                  onClick={() =>
                    targetId &&
                    navigate({
                      to: "/chat",
                      search: { convId: targetId } as any,
                    })
                  }
                  className="px-4 py-1.5 rounded-full bg-amber-100 border-2 border-[#27272A] shadow-[1.5px_1.5px_0px_#27272A] text-xs font-bold text-[#27272A] flex items-center gap-2 hover:bg-amber-200 transition-colors mx-3"
                >
                  <GitBranch className="h-3.5 w-3.5 text-[#2563EB]" />
                  <span>↳ Branched into new chat: {targetTitle}</span>
                </button>
                <div className="border-t-2 border-dashed border-[#27272A] flex-1" />
              </div>
            )
          }

          if (m.content.startsWith("[BRANCHED_FROM:")) {
            const parts = m.content.split(":")
            const origId = parts[1]
            const origTitle = parts[2]?.replace("]", "") || "Previous Chat"

            return (
              <div
                key={m.id}
                className="flex items-center justify-center my-4 max-w-4xl mx-auto"
              >
                <div className="border-t-2 border-dashed border-[#27272A] flex-1" />
                <button
                  type="button"
                  onClick={() =>
                    origId &&
                    navigate({
                      to: "/chat",
                      search: { convId: origId } as any,
                    })
                  }
                  className="px-4 py-1.5 rounded-full bg-[#F3ECE1] border-2 border-[#27272A] shadow-[1.5px_1.5px_0px_#27272A] text-xs font-bold text-[#27272A] flex items-center gap-2 hover:bg-amber-100 transition-colors mx-3"
                >
                  <GitBranch className="h-3.5 w-3.5 text-[#2563EB]" />
                  <span>↳ Continuation of: {origTitle}</span>
                </button>
                <div className="border-t-2 border-dashed border-[#27272A] flex-1" />
              </div>
            )
          }

          return (
            <div
              key={m.id}
              id={`message-bubble-${m.id}`}
              className={`relative flex items-start gap-2 max-w-4xl mx-auto group ${
                m.sender === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {/* User Message Action Buttons (Sticky Left Side: Copy only) */}
              {m.sender === "user" && (
                <MessageActionBar
                  message={m}
                  conversationId={activeConversationId}
                  onBranch={handleBranchChat}
                />
              )}

              {m.sender === "agent" && (
                <div className="h-8 w-8 rounded bg-amber-200 border-2 border-[#27272A] shadow-[1.5px_1.5px_0px_#27272A] flex items-center justify-center text-[#27272A] shrink-0 mt-1">
                  <Bot className="h-4 w-4" />
                </div>
              )}

              <div
                className={`space-y-3 ${m.sender === "user" ? "max-w-[80%]" : "max-w-[calc(100%-5rem)] flex-1"}`}
              >
                {/* Expandable Neubrutalist Research Mode Stage Progress ON TOP of AI response */}
                {m.sender === "agent" &&
                  isLatestAgentMsg &&
                  isResearchMode &&
                  (isGenerating || researchStage) && (
                    <div className="mb-2.5 rounded-lg bg-amber-100 border-2 border-[#27272A] shadow-[2.5px_2.5px_0px_#27272A] overflow-hidden">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setIsResearchLogOpen((prev) => !prev)
                        }}
                        className="w-full p-2.5 text-xs font-bold text-[#27272A] flex items-center justify-between hover:bg-amber-200/70 transition-colors"
                      >
                        <div className="flex items-center gap-2 text-left">
                          {isGenerating && <CustomSpinner size="sm" />}
                          <span>
                            🔍 Research Mode: {researchStage || "Running research engine..."}
                          </span>
                        </div>
                        <ChevronRight
                          className={`h-4 w-4 text-[#27272A] shrink-0 transition-transform duration-200 ${isResearchLogOpen ? "rotate-90" : ""}`}
                        />
                      </button>

                      {isResearchLogOpen && researchLogHistory.length > 0 && (
                        <div className="p-3 bg-white border-t-2 border-[#27272A] space-y-1.5 text-[11px] font-mono max-h-48 overflow-y-auto">
                          {researchLogHistory.map((log, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-gray-800">
                              <span className="text-amber-700 font-bold shrink-0">•</span>
                              <span>{log}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                {/* Render Tool Events ON TOP of AI response */}
                {m.sender === "agent" &&
                  isLatestAgentMsg &&
                  activeToolEvents.length > 0 && (
                    <div className="mb-2">
                      {isThinkingToolsActive ? (
                        /* Persistently active while tools are executing */
                        <div className="rounded-lg bg-amber-100 border-2 border-[#27272A] shadow-[2px_2px_0px_#27272A] p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <CustomSpinner size="sm" />
                              <span className="text-xs font-extrabold text-[#27272A] font-display">
                                Analyzing Market Data & Executing Tools...
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setIsTimelineOpen(!isTimelineOpen)}
                              className="text-[11px] font-bold text-[#2563EB] hover:underline flex items-center gap-1"
                            >
                              <span>
                                {isTimelineOpen ? "Hide Tools" : "Show Tools"}
                              </span>
                              <ChevronDown
                                className={`h-3.5 w-3.5 transition-transform duration-200 ${
                                  isTimelineOpen ? "rotate-180" : ""
                                }`}
                              />
                            </button>
                          </div>

                          {/* Smooth expandable drawer showing running tools */}
                          {isTimelineOpen && (
                            <div className="pt-2 border-t border-[#27272A]/20 space-y-1.5">
                              {activeToolEvents.map((t) => (
                                <div
                                  key={t.id}
                                  className="text-[11px] font-mono flex items-center justify-between bg-white/80 px-2 py-1 rounded border border-[#27272A]/30"
                                >
                                  <div className="flex items-center gap-1.5 truncate max-w-[75%]">
                                    {t.status === "running" ? (
                                      <CustomSpinner size="sm" />
                                    ) : (
                                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                    )}
                                    <span className="font-bold text-[#27272A] truncate">
                                      {t.toolName}
                                    </span>
                                  </div>
                                  <span className="text-gray-500 font-bold shrink-0">
                                    {t.status === "running"
                                      ? "Executing..."
                                      : `${t.executionTimeMs}ms`}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Clean summary once all tool execution completes */
                        <div className="rounded-md bg-[#FAF6F0] border border-[#27272A]/30 px-3 py-1.5 flex items-center justify-between text-[11px] font-mono text-[#27272A]">
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            <span className="font-bold">
                              Executed {activeToolEvents.length} market analysis tool{activeToolEvents.length > 1 ? "s" : ""} ({maxTimeMs}ms)
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setIsTimelineOpen(!isTimelineOpen)}
                            className="font-bold text-[#2563EB] hover:underline flex items-center gap-1"
                          >
                            <span>{isTimelineOpen ? "Hide" : "Details"}</span>
                            <ChevronDown
                              className={`h-3 w-3 transition-transform duration-200 ${
                                isTimelineOpen ? "rotate-180" : ""
                              }`}
                            />
                          </button>
                        </div>
                      )}

                      {/* Tool Detail Output Drawer */}
                      {!isThinkingToolsActive && isTimelineOpen && (
                        <div className="mt-1.5 p-2.5 bg-white border border-[#27272A] rounded-md space-y-2 text-[11px] font-mono max-h-60 overflow-y-auto shadow-sm">
                          {activeToolEvents.map((t) => (
                            <div key={t.id} className="border-b border-gray-200 pb-2 last:border-0 last:pb-0">
                              <div className="flex justify-between font-bold text-[#27272A] mb-1">
                                <span>🔧 {t.toolName}</span>
                                <span className="text-gray-400">{t.executionTimeMs}ms</span>
                              </div>
                              {t.argumentsJson && (
                                <div className="text-gray-600 truncate mb-1">
                                  Args: {t.argumentsJson}
                                </div>
                              )}
                              {t.outputJson && (
                                <div className="bg-[#FAF6F0] p-1.5 rounded text-gray-800 overflow-x-auto max-h-24">
                                  {t.outputJson.slice(0, 300)}
                                  {t.outputJson.length > 300 ? "..." : ""}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                {/* Main Message Text Card */}
                <div
                  className={`relative group rounded-xl p-4 border-2 border-[#27272A] ${
                    m.sender === "user"
                      ? "bg-[#2563EB] text-white font-medium shadow-[2.5px_2.5px_0px_#27272A]"
                      : "bg-white text-[#27272A] shadow-[3px_3px_0px_#27272A]"
                  }`}
                >
                  {m.sender === "user" ? (
                    <div className="whitespace-pre-wrap leading-relaxed text-xs md:text-sm font-medium">
                      {m.content}
                    </div>
                  ) : (
                    <MarkdownRenderer content={formattedContent} />
                  )}
                </div>

                {/* HRP Portfolio Allocation Table */}
                {m.hrp_table?.symbols && (
                  <div className="bg-white border-2 border-[#27272A] shadow-[3px_3px_0px_#27272A] rounded-lg p-4 space-y-3 text-[#27272A] w-full">
                    <div className="flex items-center gap-2 border-b-2 border-[#27272A] pb-2">
                      <BarChart3 className="h-4 w-4 text-[#2563EB]" />
                      <span className="text-xs font-extrabold font-display">
                        HRP Portfolio Weight Allocation
                      </span>
                    </div>
                    <div className="space-y-2">
                      {m.hrp_table.symbols.map((sym, idx) => {
                        const weight = m.hrp_table?.weights[idx] || 0
                        const pct = (weight * 100).toFixed(2)
                        return (
                          <div key={sym} className="space-y-1">
                            <div className="flex justify-between text-xs font-mono font-bold">
                              <span>{formatSafeValue(sym)}</span>
                              <span className="text-[#2563EB]">{pct}%</span>
                            </div>
                            <div className="h-2.5 w-full bg-[#F3ECE1] border border-[#27272A] rounded-sm overflow-hidden">
                              <div
                                className="h-full bg-[#2563EB]"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {m.hrp_table.summaryNotes && (
                      <p className="text-[11px] text-[#52525B] italic border-t border-dashed border-[#27272A] pt-2">
                        {formatSafeValue(m.hrp_table.summaryNotes)}
                      </p>
                    )}
                  </div>
                )}

                {/* Render Chart Artifacts when message metadata contains priceChart, growthChart, analystChart, or fiiDiiChart */}
                <ChartArtifacts
                  priceChart={m.priceChart}
                  growthChart={m.growthChart}
                  analystChart={m.analystChart}
                  fiiDiiChart={m.fiiDiiChart}
                />
              </div>

              {/* Agent Message Action Buttons (Sticky Right Side: 4 vertical stacked buttons) */}
              {m.sender === "agent" && (
                <MessageActionBar
                  message={m}
                  conversationId={activeConversationId}
                  onBranch={handleBranchChat}
                />
              )}

              {m.sender === "user" && (
                <div className="h-8 w-8 rounded bg-[#F3ECE1] border-2 border-[#27272A] shadow-[1.5px_1.5px_0px_#27272A] flex items-center justify-center text-[#27272A] shrink-0 mt-1">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          )
        })}


        <div className="h-20" />
        <div ref={messagesEndRef} />
      </div>

      {/* Floating Downward Arrow Scroll-to-Bottom Button (Bottom Left) */}
      {showScrollBottomBtn && (
        <button
          type="button"
          onClick={() => {
            isUserScrolledUpRef.current = false
            setShowScrollBottomBtn(false)
            scrollToBottom(true)
          }}
          className="absolute bottom-28 left-6 md:left-8 z-40 bg-white hover:bg-amber-100 text-[#27272A] border-2 border-[#27272A] shadow-[3px_3px_0px_#27272A] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] rounded-full p-2.5 flex items-center gap-1.5 text-xs font-bold font-mono transition-all cursor-pointer animate-bounce"
          title="Scroll to bottom"
        >
          <ArrowDown className="h-4 w-4 text-[#2563EB]" />
          <span className="hidden sm:inline">Latest</span>
        </button>
      )}

      {/* Floating Gemini Neubrutal Chatbox at Bottom Center */}

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-3xl bg-white border-2 border-[#27272A] shadow-[4px_4px_0px_#27272A] rounded-xl p-3.5 space-y-2.5 z-30">
        <textarea
          placeholder={
            isRateLimited
              ? "Chat disabled due to rate limit"
              : "Ask anything..."
          }
          value={inputMessage}
          disabled={isRateLimited}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
            setInputMessage(e.target.value)
          }
          onKeyDown={handleKeyDown}
          rows={2}
          className="w-full resize-none text-xs md:text-sm font-medium border-0 focus-visible:ring-0 focus-visible:outline-none p-1 text-[#27272A] bg-transparent disabled:opacity-50"
        />

        <div className="flex items-center justify-between border-t border-[#27272A] pt-2">
          {/* Left: Model Selector & Research Mode Dropdown grouped together */}
          <div className="flex items-center gap-2">
            {/* Model Selector */}
            <Select
              value={selectedModel}
              onValueChange={handleModelChange}
              disabled={isRateLimited}
            >
              <SelectTrigger className="h-8 text-[11px] font-bold bg-[#FAF6F0] border border-[#27272A] text-[#27272A] shadow-[1px_1px_0px_#27272A] w-[170px]">
                <SelectValue>
                  {selectedModel === "claude-haiku-4-5-20251001" && "Claude 4.5 Haiku"}
                  {selectedModel === "gemini-3.5-flash-lite" && "Gemini 3.5 Flash Lite"}
                  {selectedModel === "gemini-3.5-flash" && "Gemini 3.5 Flash"}
                  {selectedModel === "gemini-2.5-pro" && "Gemini 2.5 Pro"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-white border-2 border-[#27272A]">
                <SelectItem
                  value="claude-haiku-4-5-20251001"
                  className="text-xs font-semibold"
                >
                  Claude 4.5 Haiku (1/day)
                </SelectItem>
                <SelectItem
                  value="gemini-3.5-flash-lite"
                  className="text-xs font-semibold"
                >
                  Gemini 3.5 Flash Lite (Standard - 10/day)
                </SelectItem>

                <SelectItem
                  value="gemini-3.5-flash"
                  className="text-xs font-semibold"
                >
                  Gemini 3.5 Flash (Upgraded - 3/day)
                </SelectItem>
                <SelectItem
                  value="gemini-2.5-pro"
                  className="text-xs font-semibold"
                >
                  Gemini 2.5 Pro (Pro - 1/day)
                </SelectItem>
              </SelectContent>

            </Select>

            {/* Research Mode Dropdown */}
            <Select
              value={isResearchMode ? "enabled" : "disabled"}
              onValueChange={(val) => setIsResearchMode(val === "enabled")}
              disabled={isRateLimited}
            >
              <SelectTrigger className="h-8 text-[11px] font-bold bg-[#FAF6F0] border border-[#27272A] text-[#27272A] shadow-[1px_1px_0px_#27272A] w-[130px]">
                <SelectValue>
                  {isResearchMode ? "Research Mode" : "Research Off"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-white border-2 border-[#27272A]">
                <SelectItem value="disabled" className="text-xs font-semibold">
                  Research Off
                </SelectItem>
                <SelectItem value="enabled" className="text-xs font-semibold">
                  Research Mode
                </SelectItem>
              </SelectContent>
            </Select>
          </div>



          {/* Right: Action Buttons */}
          <div className="flex items-center gap-2">
            {isGenerating ? (
              <Button
                type="button"
                onClick={handleStopStream}
                size="sm"
                className="h-8 px-3 text-xs font-bold bg-[#FAF6F0] hover:bg-[#F3ECE1] text-[#27272A] border border-[#27272A] shadow-[1.5px_1.5px_0px_#27272A] flex items-center gap-1.5"
              >
                <Square className="h-3.5 w-3.5 fill-[#27272A]" />
                <span>Stop</span>
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSendMessage}
                disabled={!inputMessage.trim() || isRateLimited}
                size="sm"
                className="h-8 w-8 p-0 rounded-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white border border-[#27272A] shadow-[1.5px_1.5px_0px_#27272A] disabled:opacity-40 flex items-center justify-center"
              >
                <ArrowUp className="h-4 w-4 stroke-[2.5]" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
