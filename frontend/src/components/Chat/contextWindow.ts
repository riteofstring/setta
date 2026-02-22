import { BaseChatMessageUnion } from "utils/generatedTypes";

const CHARS_PER_TOKEN = 4;
const PER_MESSAGE_OVERHEAD_TOKENS = 6;
const PER_TOOL_CALL_OVERHEAD_TOKENS = 12;
const DEFAULT_ESTIMATED_CONTEXT_WINDOW_TOKENS = 200_000;

const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  "gpt-5-codex": DEFAULT_ESTIMATED_CONTEXT_WINDOW_TOKENS,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isLikelyCodexModel(model: string | null | undefined): boolean {
  if (typeof model !== "string") {
    return false;
  }
  const normalized = model.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized.includes("codex")) {
    return true;
  }
  return Object.keys(MODEL_CONTEXT_WINDOWS).some((prefix) =>
    normalized.startsWith(prefix),
  );
}

export function estimateTokenCountFromText(text: string): number {
  const normalized = text.trim();
  if (!normalized) {
    return 0;
  }
  return Math.ceil(normalized.length / CHARS_PER_TOKEN);
}

function estimateTokenCountFromUnknown(value: unknown): number {
  if (typeof value === "string") {
    return estimateTokenCountFromText(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return estimateTokenCountFromText(String(value));
  }
  if (!isRecord(value) && !Array.isArray(value)) {
    return 0;
  }
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== "string") {
      return 0;
    }
    return estimateTokenCountFromText(serialized);
  } catch {
    return 0;
  }
}

function estimateContentEntryTokens(entry: unknown): number {
  if (!isRecord(entry)) {
    return estimateTokenCountFromUnknown(entry);
  }
  let total = 0;
  total += estimateTokenCountFromUnknown(entry.text);
  total += estimateTokenCountFromUnknown(entry.thinking);
  total += estimateTokenCountFromUnknown(entry.summary);
  total += estimateTokenCountFromUnknown(entry.signature);
  total += estimateTokenCountFromUnknown(entry.tool_name);
  total += estimateTokenCountFromUnknown(entry.url);
  const imageUrl = entry.image_url;
  if (isRecord(imageUrl)) {
    total += estimateTokenCountFromUnknown(imageUrl.url);
  }
  if (total > 0) {
    return total;
  }
  return estimateTokenCountFromUnknown(entry);
}

export function estimateChatMessageTokens(
  message: BaseChatMessageUnion,
): number {
  let total = PER_MESSAGE_OVERHEAD_TOKENS;
  total += estimateTokenCountFromText(message.role);

  if (Array.isArray(message.content)) {
    for (const entry of message.content) {
      total += estimateContentEntryTokens(entry);
    }
  }

  if ("attachments" in message && Array.isArray(message.attachments)) {
    for (const attachment of message.attachments) {
      total += estimateTokenCountFromUnknown(attachment.name);
      total += estimateTokenCountFromUnknown(attachment.mimeType);
      total += estimateTokenCountFromUnknown(attachment.size);
    }
  }

  if ("tool_calls" in message && Array.isArray(message.tool_calls)) {
    for (const toolCall of message.tool_calls) {
      total += PER_TOOL_CALL_OVERHEAD_TOKENS;
      if (!isRecord(toolCall)) {
        total += estimateTokenCountFromUnknown(toolCall);
        continue;
      }
      const functionPayload = toolCall.function;
      if (isRecord(functionPayload)) {
        total += estimateTokenCountFromUnknown(functionPayload.name);
        total += estimateTokenCountFromUnknown(functionPayload.arguments);
      }
    }
  }

  if (message.role === "tool") {
    total += PER_TOOL_CALL_OVERHEAD_TOKENS;
    total += estimateTokenCountFromUnknown(message.tool_name);
    total += estimateTokenCountFromUnknown(message.tool_call_id);
    total += estimateTokenCountFromUnknown(message.arguments);
    total += estimateTokenCountFromUnknown(message.result);
  }

  return total;
}

export function estimateChatHistoryTokens(
  messages: Array<BaseChatMessageUnion>,
): number {
  return messages.reduce(
    (acc, message) => acc + estimateChatMessageTokens(message),
    0,
  );
}

export function resolveEstimatedContextWindowTokens(
  model: string | null | undefined,
): number {
  if (typeof model === "string") {
    const normalized = model.trim().toLowerCase();
    for (const [prefix, contextWindow] of Object.entries(
      MODEL_CONTEXT_WINDOWS,
    )) {
      if (normalized.startsWith(prefix)) {
        return contextWindow;
      }
    }
  }
  return DEFAULT_ESTIMATED_CONTEXT_WINDOW_TOKENS;
}

export function resolveCodexContextWindowTokens(
  model: string | null | undefined,
): number {
  return resolveEstimatedContextWindowTokens(model);
}
