import { useState, useEffect, useRef } from "react"
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router"
import {
  ArrowUp,
  Square,
  Bot,
  User,
  CheckCircle2,
  BarChart3,
  AlertTriangle,
  ChevronRight,
  GitBranch,
  Copy,
  Check,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CustomSpinner } from "@/components/Common/CustomSpinner"
import { MarkdownRenderer } from "@/components/Common/MarkdownRenderer"
import { OpenAPI } from "@/client"
import { decodeProtobufEvent, ParsedStreamEvent } from "@/proto/financial_agent"

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

function formatFriendlyJson(raw: any): string {
  if (!raw) return ""
  let obj = raw
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw)
    } catch {
      return raw.length > 120 ? `${raw.slice(0, 120)}...` : raw
    }
  }

  if (typeof obj !== "object" || obj === null) return String(obj)

  const pairs: string[] = []
  for (const [key, val] of Object.entries(obj)) {
    if (val === null || val === undefined) continue
    const formattedKey = key
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .toLowerCase()
    let valStr = ""
    if (Array.isArray(val)) {
      valStr = val.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ")
    } else if (typeof val === "object") {
      valStr = JSON.stringify(val)
    } else {
      valStr = String(val)
    }
    if (valStr.length > 80) valStr = `${valStr.slice(0, 80)}...`
    pairs.push(`${formattedKey}: ${valStr}`)
  }
  return pairs.join(" • ")
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
    } catch (e) {
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

  const [activeConversationId, setActiveConversationId] = useState<string | null>(activeConvIdFromUrl || null)
  const [messages, setMessages] = useState<ChatMessageItem[]>([])
  const [inputMessage, setInputMessage] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isThinkingToolsActive, setIsThinkingToolsActive] = useState(false)
  const [isRateLimited, setIsRateLimited] = useState(false)
  const [rateLimitError, setRateLimitError] = useState<string | null>(null)
  const [activeToolEvents, setActiveToolEvents] = useState<any[]>([])
  const [isTimelineOpen, setIsTimelineOpen] = useState(false)
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem("selected_gemini_model") || "gemini-3.5-flash-lite"
  })

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const token = localStorage.getItem("access_token")

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, activeToolEvents, isTimelineOpen])

  useEffect(() => {
    fetchQuotaStatus()
  }, [])

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
  }, [activeConvIdFromUrl])

  const fetchQuotaStatus = async () => {
    try {
      const res = await fetch(`${OpenAPI.BASE}/api/v1/agent/quota`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.is_limited) {
          setIsRateLimited(true)
          setRateLimitError(`Quota limit reached (${data.standard_count}/10 used today).`)
        } else {
          setIsRateLimited(false)
          setRateLimitError(null)
        }
      }
    } catch (e) {
      console.error("Failed to fetch quota", e)
    }
  }

  const fetchMessages = async (convId: string) => {
    try {
      const res = await fetch(`${OpenAPI.BASE}/api/v1/agent/conversations/${convId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setMessages(
          data.map((m: any) => ({
            id: m.id,
            sender: m.sender,
            content: m.content,
            metadata_json: m.metadata_json,
            created_at: m.created_at,
          }))
        )
      }
    } catch (e) {
      console.error("Failed to fetch messages", e)
    }
  }

  const handleBranchChat = async (untilMsgId: string) => {
    if (!activeConversationId) return
    try {
      const res = await fetch(`${OpenAPI.BASE}/api/v1/agent/conversations/${activeConversationId}/branch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ until_message_id: untilMsgId }),
      })
      if (res.ok) {
        const data = await res.json()
        const newId = data.new_conversation_id
        if (newId) {
          setActiveConversationId(newId)
          fetchMessages(newId)
          navigate({ to: "/chat", search: { convId: newId } as any, replace: true })
        }
      }
    } catch (err) {
      console.error("Branch conversation error", err)
    }
  }


  const handleCopyMessage = (msgId: string, content: string) => {
    navigator.clipboard.writeText(content)
    setCopiedMsgId(msgId)
    setTimeout(() => setCopiedMsgId(null), 2000)
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

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const response = await fetch(`${OpenAPI.BASE}/api/v1/agent/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversation_id: activeConversationId || null,
          message: userText,
          model_name: selectedModel,
        }),
        signal: controller.signal,
      })

      if (response.status === 429) {
        setIsRateLimited(true)
        const errJson = await response.json().catch(() => ({}))
        const errMsg = errJson.detail || "Daily API rate limit exceeded. Chat disabled."
        setRateLimitError(errMsg)
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === agentMsgId ? { ...msg, content: `⚠️ ${errMsg}` } : msg
          )
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

      let accumulatedText = ""
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
                  if (chunk.startsWith("[CONVERSATION_ID:")) {
                    const newId = chunk.replace("[CONVERSATION_ID:", "").replace("]", "").trim()
                    if (newId && !activeConversationId) {
                      setActiveConversationId(newId)
                      navigate({ to: "/chat", search: { convId: newId } as any, replace: true })
                    }
                  } else {
                    accumulatedText += chunk
                    // As soon as text stream starts, deactivate running tools mode
                    setIsThinkingToolsActive(false)
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === agentMsgId ? { ...msg, content: accumulatedText } : msg
                      )
                    )
                  }
                }
              }

              if (currentEventType === "tool_event" || !currentEventType || evt.toolStart || evt.toolEnd || evt.hrpResult || evt.errorMessage) {
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

                  const existingIdx = toolLogs.findIndex((t) => t.toolName === safeName && t.status === "running")
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
                      msg.id === agentMsgId ? { ...msg, hrp_table: hrpData } : msg
                    )
                  )
                }

                if (evt.errorMessage) {
                  accumulatedText += `\n\n⚠️ ${evt.errorMessage}`
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === agentMsgId ? { ...msg, content: accumulatedText } : msg
                    )
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
              ? { ...msg, content: msg.content + " [Stopped]" }
              : msg
          )
        )
      } else {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === agentMsgId
              ? { ...msg, content: `Error: ${err?.message || "Stream interrupted"}` }
              : msg
          )
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

  const maxTimeMs = activeToolEvents.reduce((acc, t) => acc + (Number(t.executionTimeMs) || 1200), 0)
  const durationSec = Math.max(1, Math.round(maxTimeMs / 1000))

  return (
    <div className="relative h-full w-full bg-[#FAF6F0] text-[#27272A]">
      {/* Rate limit warning banner */}
      {isRateLimited && (
        <div className="bg-rose-100 border-b-2 border-[#27272A] px-4 py-2 text-center text-xs font-bold text-rose-800 flex items-center justify-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <span>{rateLimitError || "Rate limit reached. Chat is currently disabled."}</span>
        </div>
      )}

      {/* Scrollable Chat Area */}
      <div className="h-full overflow-y-auto px-4 md:px-8 pt-6 pb-64 space-y-6">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-3 pt-24">
            <div className="h-14 w-14 rounded-xl bg-amber-200 border-2 border-[#27272A] shadow-[2.5px_2.5px_0px_#27272A] flex items-center justify-center text-[#27272A]">
              <Bot className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <h2 className="font-display text-2xl font-extrabold text-[#27272A]">Finance Agent</h2>
              <p className="text-xs text-[#52525B]">
                Ask about stocks, understand financials, and get insights
              </p>
            </div>
          </div>
        )}

        {messages.map((m, mIdx) => {
          const formattedContent = renderFormattedText(m.content)
          const isLatestAgentMsg = m.sender === "agent" && mIdx === messages.length - 1

          // Divider rendering for branched chats
          if (m.content.startsWith("[BRANCHED_TO:")) {
            const parts = m.content.split(":")
            const targetId = parts[1]
            const targetTitle = parts[2]?.replace("]", "") || "New Chat"

            return (
              <div key={m.id} className="flex items-center justify-center my-4 max-w-4xl mx-auto">
                <div className="border-t-2 border-dashed border-[#27272A] flex-1" />
                <button
                  type="button"
                  onClick={() => targetId && navigate({ to: "/chat", search: { convId: targetId } as any })}
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
              <div key={m.id} className="flex items-center justify-center my-4 max-w-4xl mx-auto">
                <div className="border-t-2 border-dashed border-[#27272A] flex-1" />
                <button
                  type="button"
                  onClick={() => origId && navigate({ to: "/chat", search: { convId: origId } as any })}
                  className="px-4 py-1.5 rounded-full bg-blue-100 border-2 border-[#27272A] shadow-[1.5px_1.5px_0px_#27272A] text-xs font-bold text-[#27272A] flex items-center gap-2 hover:bg-blue-200 transition-colors mx-3"
                >
                  <GitBranch className="h-3.5 w-3.5 text-[#2563EB]" />
                  <span>↰ Branched from previous chat: {origTitle}</span>
                </button>
                <div className="border-t-2 border-dashed border-[#27272A] flex-1" />
              </div>
            )
          }

          return (
            <div
              key={m.id}
              className={`group relative flex gap-3 max-w-4xl mx-auto ${m.sender === "user" ? "justify-end" : "justify-start w-full"}`}
            >
              {m.sender === "agent" && (
                <div className="h-8 w-8 rounded bg-amber-200 border-2 border-[#27272A] shadow-[1.5px_1.5px_0px_#27272A] flex items-center justify-center text-[#27272A] shrink-0 mt-1">
                  <Bot className="h-4 w-4" />
                </div>
              )}

              <div className={`space-y-3 ${m.sender === "user" ? "max-w-[80%]" : "max-w-[calc(100%-2.75rem)] flex-1"}`}>
                {/* Render Tool Events ON TOP of AI response */}
                {m.sender === "agent" && isLatestAgentMsg && activeToolEvents.length > 0 && (
                  <div className="mb-2">
                    {isThinkingToolsActive ? (
                      /* Persistently active while tools are executing */
                      <div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setIsTimelineOpen((prev) => !prev)
                          }}
                          className="flex items-center gap-2 text-xs font-bold text-[#27272A] hover:text-black transition-colors py-1 px-2 rounded hover:bg-black/5"
                        >
                          <CustomSpinner size="sm" />
                          <span>Running tools • {formatSafeValue(activeToolEvents[activeToolEvents.length - 1]?.toolName)}</span>
                          <ChevronRight className={`h-4 w-4 text-[#27272A] transition-transform duration-200 ml-1 ${isTimelineOpen ? "rotate-90" : ""}`} />
                        </button>

                        {isTimelineOpen && (
                          <div className="mt-2 p-3 rounded-lg bg-[#FFFBEB] border-2 border-[#27272A] shadow-[2px_2px_0px_#27272A] space-y-2 text-xs">
                            {activeToolEvents.map((t, idx) => (
                              <div key={t.id || idx} className="p-2 rounded bg-white border border-[#27272A] space-y-1">
                                <div className="font-mono font-bold flex items-center justify-between">
                                  <span>{formatSafeValue(t.toolName)}</span>
                                  <span className="text-[10px] text-gray-500 font-normal">{formatSafeValue(t.executionTimeMs)}ms</span>
                                </div>
                                {t.argumentsJson && <div className="text-[11px] font-mono text-gray-700 bg-gray-50 p-1 rounded">{formatFriendlyJson(t.argumentsJson)}</div>}
                                {t.outputJson && <div className="text-[11px] font-mono text-gray-700 bg-gray-50 p-1 rounded">{formatFriendlyJson(t.outputJson)}</div>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Only after final text stream starts: non-expandable 'Thought for Xs' */
                      <div className="flex items-center gap-1.5 text-xs text-[#52525B] font-semibold py-1 px-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <span>Thought for {durationSec}s</span>
                      </div>
                    )}
                  </div>
                )}

                {(formattedContent || (isGenerating && m.sender === "agent")) && (
                  <div
                    className={`relative p-4 rounded-lg text-xs md:text-sm leading-relaxed ${
                      m.sender === "user"
                        ? "bg-[#2563EB] text-white border-2 border-[#27272A] shadow-[2.5px_2.5px_0px_#27272A] font-semibold whitespace-pre-wrap"
                        : "bg-white text-[#27272A] border-2 border-[#27272A] shadow-[2.5px_2.5px_0px_#27272A] w-full"
                    }`}
                  >
                    {m.sender === "user" ? (
                      formattedContent
                    ) : formattedContent ? (
                      <MarkdownRenderer content={formattedContent} />
                    ) : (
                      "Analyzing market data..."
                    )}

                    {/* Action Toolbar: Copy (User & Agent) & Branch Out (Agent only) - Vertical Stack */}
                    <div className={`opacity-0 group-hover:opacity-100 transition-opacity absolute flex flex-col gap-1.5 top-2 ${m.sender === "user" ? "-left-8" : "-right-8"}`}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopyMessage(m.id, m.content)}
                        title="Copy text"
                        className="h-6 w-6 text-gray-700 hover:text-black hover:bg-amber-200/90 rounded bg-white border border-[#27272A] shadow-[1px_1px_0px_#27272A]"
                      >
                        {copiedMsgId === m.id ? (
                          <Check className="h-3 w-3 text-emerald-600 stroke-[3]" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>

                      {m.sender === "agent" && activeConversationId && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleBranchChat(m.id)}
                          title="Branch out new chat from here"
                          className="h-6 w-6 text-gray-700 hover:text-black hover:bg-amber-200/90 rounded bg-white border border-[#27272A] shadow-[1px_1px_0px_#27272A]"
                        >
                          <GitBranch className="h-3 w-3 text-[#2563EB]" />
                        </Button>
                      )}
                    </div>
                  </div>
                )}


                {/* HRP Portfolio Allocation Table */}
                {m.hrp_table && m.hrp_table.symbols && (
                  <div className="bg-white border-2 border-[#27272A] shadow-[3px_3px_0px_#27272A] rounded-lg p-4 space-y-3 text-[#27272A] w-full">
                    <div className="flex items-center gap-2 border-b-2 border-[#27272A] pb-2">
                      <BarChart3 className="h-4 w-4 text-[#2563EB]" />
                      <span className="text-xs font-extrabold font-display">HRP Portfolio Weight Allocation</span>
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
              </div>

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

      {/* Floating Gemini Neubrutal Chatbox at Bottom Center */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-3xl bg-white border-2 border-[#27272A] shadow-[4px_4px_0px_#27272A] rounded-xl p-3.5 space-y-2.5 z-30">
        <textarea
          placeholder={isRateLimited ? "Chat disabled due to rate limit" : "Ask anything..."}
          value={inputMessage}
          disabled={isRateLimited}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInputMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          className="w-full resize-none text-xs md:text-sm font-medium border-0 focus-visible:ring-0 focus-visible:outline-none p-1 text-[#27272A] bg-transparent disabled:opacity-50"
        />

        <div className="flex items-center justify-between border-t border-[#27272A] pt-2">
          {/* Left: Model Selector inside Floating Chatbox */}
          <div className="flex items-center gap-2">
            <Select value={selectedModel} onValueChange={handleModelChange} disabled={isRateLimited}>
              <SelectTrigger className="h-8 text-[11px] font-bold bg-[#FAF6F0] border border-[#27272A] text-[#27272A] shadow-[1px_1px_0px_#27272A] w-[240px]">
                <SelectValue placeholder="Select Model" />
              </SelectTrigger>
              <SelectContent className="bg-white border-2 border-[#27272A]">
                <SelectItem value="gemini-3.5-flash-lite" className="text-xs font-semibold">
                  Gemini 3.5 Flash Lite (Standard - 10/day)
                </SelectItem>
                <SelectItem value="gemini-3.5-flash" className="text-xs font-semibold">
                  Gemini 3.5 Flash (Upgraded - 3/day)
                </SelectItem>
                <SelectItem value="gemini-2.5-pro" className="text-xs font-semibold">
                  Gemini 2.5 Pro (Pro - 1/day)
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
