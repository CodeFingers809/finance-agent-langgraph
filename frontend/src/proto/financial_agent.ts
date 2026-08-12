import protobuf from "protobufjs/light"

const protoSchemaJSON = {
  nested: {
    financial_agent: {
      nested: {
        ChatRequest: {
          fields: {
            conversationId: { type: "string", id: 1 },
            message: { type: "string", id: 2 },
            modelName: { type: "string", id: 3 },
          },
        },
        ToolCallStart: {
          fields: {
            toolName: { type: "string", id: 1 },
            argumentsJson: { type: "string", id: 2 },
          },
        },
        ToolCallEnd: {
          fields: {
            toolName: { type: "string", id: 1 },
            outputJson: { type: "string", id: 2 },
            executionTimeMs: { type: "int64", id: 3 },
          },
        },
        TextChunk: {
          fields: {
            text: { type: "string", id: 1 },
            isFinalChunk: { type: "bool", id: 2 },
          },
        },
        HRPOptimizationResult: {
          fields: {
            symbols: { rule: "repeated", type: "string", id: 1 },
            weights: { rule: "repeated", type: "float", id: 2 },
            summaryNotes: { type: "string", id: 3 },
          },
        },
        PriceChartPoint: {
          fields: {
            date: { type: "string", id: 1 },
            open: { type: "double", id: 2 },
            high: { type: "double", id: 3 },
            low: { type: "double", id: 4 },
            close: { type: "double", id: 5 },
            volume: { type: "int64", id: 6 },
          },
        },
        PriceChartResult: {
          fields: {
            symbol: { type: "string", id: 1 },
            points: { rule: "repeated", type: "PriceChartPoint", id: 2 },
            period: { type: "string", id: 3 },
          },
        },
        QuarterlyGrowthResult: {
          fields: {
            symbol: { type: "string", id: 1 },
            quarters: { rule: "repeated", type: "string", id: 2 },
            revenue: { rule: "repeated", type: "double", id: 3 },
            netIncome: { rule: "repeated", type: "double", id: 4 },
            yoyGrowthPct: { rule: "repeated", type: "double", id: 5 },
            qoqGrowthPct: { rule: "repeated", type: "double", id: 6 },
          },
        },
        AnalystTargetResult: {
          fields: {
            symbol: { type: "string", id: 1 },
            dates: { rule: "repeated", type: "string", id: 2 },
            targetPrices: { rule: "repeated", type: "double", id: 3 },
            firms: { rule: "repeated", type: "string", id: 4 },
            currentPrice: { type: "double", id: 5 },
          },
        },
        FiiDiiFlowResult: {
          fields: {
            dates: { rule: "repeated", type: "string", id: 1 },
            fiiNetCr: { rule: "repeated", type: "double", id: 2 },
            diiNetCr: { rule: "repeated", type: "double", id: 3 },
          },
        },
        StreamEvent: {
          fields: {
            eventId: { type: "string", id: 1 },
            timestamp: { type: "string", id: 2 },
            textChunk: { type: "TextChunk", id: 3 },
            toolStart: { type: "ToolCallStart", id: 4 },
            toolEnd: { type: "ToolCallEnd", id: 5 },
            hrpResult: { type: "HRPOptimizationResult", id: 6 },
            errorMessage: { type: "string", id: 7 },
            isFinished: { type: "bool", id: 8 },
            priceChart: { type: "PriceChartResult", id: 11 },
            growthChart: { type: "QuarterlyGrowthResult", id: 12 },
            analystChart: { type: "AnalystTargetResult", id: 13 },
            fiiDiiChart: { type: "FiiDiiFlowResult", id: 14 },
          },
        },
      },
    },
  },
}

const root = protobuf.Root.fromJSON(protoSchemaJSON)
export const StreamEventType = root.lookupType("financial_agent.StreamEvent")

export interface ParsedStreamEvent {
  eventId?: string
  timestamp?: string
  textChunk?: { text: string; isFinalChunk?: boolean }
  toolStart?: { toolName: string; argumentsJson: string }
  toolEnd?: { toolName: string; outputJson: string; executionTimeMs: number }
  hrpResult?: { symbols: string[]; weights: number[]; summaryNotes: string }
  errorMessage?: string
  isFinished?: boolean
  priceChart?: {
    symbol: string
    points: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>
    period: string
  }
  growthChart?: {
    symbol: string
    quarters: string[]
    revenue: number[]
    netIncome: number[]
    yoyGrowthPct: number[]
    qoqGrowthPct: number[]
  }
  analystChart?: {
    symbol: string
    dates: string[]
    targetPrices: number[]
    firms: string[]
    currentPrice: number
  }
  fiiDiiChart?: {
    dates: string[]
    fiiNetCr: number[]
    diiNetCr: number[]
  }
}

export function decodeProtobufEvent(base64Data: string): ParsedStreamEvent {
  try {
    const buffer = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0))
    const decoded = StreamEventType.decode(buffer)
    return StreamEventType.toObject(decoded, {
      defaults: true,
      longs: Number,
      enums: String,
    }) as ParsedStreamEvent
  } catch (err) {
    console.error("Failed to decode Protobuf event:", err)
    return { errorMessage: "Protobuf decode error" }
  }
}

