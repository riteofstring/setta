import { getRunLastUpdatedMs } from "state/actions/agentRunUtils";
import type { AppGenerationMode } from "state/types/appGenerationMode";
import { type AgentRun, type BaseChatMessageUnion } from "utils/generatedTypes";

export type ChatAppGenerationContext = {
  mode: AppGenerationMode;
  referenceImageUrl: string | null;
  referenceImageNotes: string | null;
};

export type ChatAppGenerationDetails = {
  activeAppGeneration: ChatAppGenerationContext | null;
  appGenerationByMessageId: Record<string, ChatAppGenerationContext>;
};

export function getDefaultChatAppGenerationDetails(): ChatAppGenerationDetails {
  return {
    activeAppGeneration: null,
    appGenerationByMessageId: {},
  };
}

export function normalizeChatAppGenerationContext(
  context:
    | {
        mode: AppGenerationMode | null;
        referenceImageUrl?: string | null;
        referenceImageNotes?: string | null;
      }
    | null
    | undefined,
): ChatAppGenerationContext | null {
  const mode = context?.mode;
  if (
    mode !== "json_render" &&
    mode !== "json_render_with_image" &&
    mode !== "prompt_builder" &&
    mode !== "mcp_server"
  ) {
    return null;
  }
  return {
    mode,
    referenceImageUrl: normalizeOptionalString(context.referenceImageUrl),
    referenceImageNotes: normalizeOptionalString(context.referenceImageNotes),
  };
}

export function recordChatAppGenerationForMessage(
  details: ChatAppGenerationDetails,
  messageId: string,
  context: ChatAppGenerationContext | null,
): ChatAppGenerationDetails {
  const normalizedMessageId = messageId.trim();
  const normalizedContext = normalizeChatAppGenerationContext(context);
  if (!normalizedMessageId || !normalizedContext) {
    return details;
  }
  return {
    activeAppGeneration: normalizedContext,
    appGenerationByMessageId: {
      ...details.appGenerationByMessageId,
      [normalizedMessageId]: normalizedContext,
    },
  };
}

export function removeChatAppGenerationForMessage(
  details: ChatAppGenerationDetails,
  messages: BaseChatMessageUnion[],
  messageId: string,
): ChatAppGenerationDetails {
  const normalizedMessageId = messageId.trim();
  if (
    !normalizedMessageId ||
    details.appGenerationByMessageId[normalizedMessageId] === undefined
  ) {
    return details;
  }
  const nextByMessageId = {
    ...details.appGenerationByMessageId,
  };
  delete nextByMessageId[normalizedMessageId];
  return {
    activeAppGeneration: resolveLatestChatAppGeneration(
      messages,
      nextByMessageId,
    ),
    appGenerationByMessageId: nextByMessageId,
  };
}

export function mergeChatAppGenerationDetails(
  existing: ChatAppGenerationDetails,
  incoming: ChatAppGenerationDetails,
): ChatAppGenerationDetails {
  return {
    activeAppGeneration:
      incoming.activeAppGeneration ?? existing.activeAppGeneration,
    appGenerationByMessageId: {
      ...existing.appGenerationByMessageId,
      ...incoming.appGenerationByMessageId,
    },
  };
}

export function mergeChatAppGenerationDetailsByChatId(
  existing: Record<string, ChatAppGenerationDetails>,
  incoming: Record<string, ChatAppGenerationDetails>,
): Record<string, ChatAppGenerationDetails> {
  if (Object.keys(incoming).length === 0) {
    return existing;
  }
  const nextByChatId = {
    ...existing,
  };
  for (const [chatId, incomingDetails] of Object.entries(incoming)) {
    nextByChatId[chatId] = mergeChatAppGenerationDetails(
      nextByChatId[chatId] ?? getDefaultChatAppGenerationDetails(),
      incomingDetails,
    );
  }
  return nextByChatId;
}

export function collectChatAppGenerationDetailsByChatId(
  runs: AgentRun[],
): Record<string, ChatAppGenerationDetails> {
  const detailsByChatId: Record<string, ChatAppGenerationDetails> = {};
  const orderedRuns = [...runs].sort(
    (left, right) => getRunLastUpdatedMs(left) - getRunLastUpdatedMs(right),
  );
  for (const run of orderedRuns) {
    const chatId = getRunInputString(run, "chatId");
    const messageId = getSubmittedMessageId(run);
    const appGeneration = getRunAppGenerationContext(run);
    if (!chatId || !messageId || !appGeneration) {
      continue;
    }
    detailsByChatId[chatId] = recordChatAppGenerationForMessage(
      detailsByChatId[chatId] ?? getDefaultChatAppGenerationDetails(),
      messageId,
      appGeneration,
    );
  }
  return detailsByChatId;
}

function normalizeOptionalString(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function resolveLatestChatAppGeneration(
  messages: BaseChatMessageUnion[],
  appGenerationByMessageId: Record<string, ChatAppGenerationContext>,
): ChatAppGenerationContext | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const messageId = messages[index]?.id;
    if (typeof messageId !== "string") {
      continue;
    }
    const context = appGenerationByMessageId[messageId];
    if (context) {
      return context;
    }
  }
  return null;
}

function getRunAppGenerationContext(
  run: AgentRun,
): ChatAppGenerationContext | null {
  const mode = getRunInputString(run, "appGenerationMode");
  if (
    mode !== "json_render" &&
    mode !== "json_render_with_image" &&
    mode !== "prompt_builder" &&
    mode !== "mcp_server"
  ) {
    return null;
  }
  return {
    mode,
    referenceImageUrl: getRunInputString(run, "appGenerationReferenceImageUrl"),
    referenceImageNotes: getRunInputString(
      run,
      "appGenerationReferenceImageNotes",
    ),
  };
}

function getSubmittedMessageId(run: AgentRun): string | null {
  const inputs = run.inputs;
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) {
    return null;
  }
  const rawMessages = (inputs as Record<string, unknown>).messages;
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return null;
  }
  const lastMessage = rawMessages[rawMessages.length - 1];
  if (
    !lastMessage ||
    typeof lastMessage !== "object" ||
    Array.isArray(lastMessage)
  ) {
    return null;
  }
  const rawId = (lastMessage as Record<string, unknown>).id;
  return typeof rawId === "string" && rawId.trim() ? rawId.trim() : null;
}

function getRunInputString(run: AgentRun, key: string): string | null {
  const inputs = run.inputs;
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) {
    return null;
  }
  const rawValue = (inputs as Record<string, unknown>)[key];
  return typeof rawValue === "string" && rawValue.trim()
    ? rawValue.trim()
    : null;
}
