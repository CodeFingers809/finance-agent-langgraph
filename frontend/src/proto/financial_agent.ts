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
