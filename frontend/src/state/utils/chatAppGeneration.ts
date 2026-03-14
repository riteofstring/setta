import { getRunLastUpdatedMs } from "state/actions/agentRunUtils";
import type { AppGenerationMode } from "state/types/appGenerationMode";
import {
  ChatRoleEnum,
  type AgentRun,
  type BaseChatMessageUnion,
} from "utils/generatedTypes";

export type ChatAppGenerationContext = {
  mode: AppGenerationMode;
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
  return { mode };
}

export function buildChatAppGenerationDetails(
  messages: BaseChatMessageUnion[],
  appGenerationByMessageId: Record<string, ChatAppGenerationContext>,
): ChatAppGenerationDetails {
  return {
    activeAppGeneration: resolveLatestChatAppGeneration(
      messages,
      appGenerationByMessageId,
    ),
    appGenerationByMessageId,
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

export function setChatAppGenerationForMessage(
  details: ChatAppGenerationDetails,
  messages: BaseChatMessageUnion[],
  messageId: string,
  context: ChatAppGenerationContext | null,
): ChatAppGenerationDetails {
  const normalizedMessageId = messageId.trim();
  if (!normalizedMessageId) {
    return details;
  }
  const normalizedContext = normalizeChatAppGenerationContext(context);
  const nextByMessageId = {
    ...details.appGenerationByMessageId,
  };
  if (normalizedContext) {
    nextByMessageId[normalizedMessageId] = normalizedContext;
  } else {
    delete nextByMessageId[normalizedMessageId];
  }
  return buildChatAppGenerationDetails(messages, nextByMessageId);
}

export function retainChatAppGenerationDetailsForMessages(
  details: ChatAppGenerationDetails,
  messages: BaseChatMessageUnion[],
): ChatAppGenerationDetails {
  const retainedMessageIds = new Set(
    messages
      .map((message) => message.id)
      .filter((id): id is string => Boolean(id)),
  );
  const nextByMessageId = Object.fromEntries(
    Object.entries(details.appGenerationByMessageId).filter(([messageId]) =>
      retainedMessageIds.has(messageId),
    ),
  );
  return buildChatAppGenerationDetails(messages, nextByMessageId);
}

export function removeChatAppGenerationForMessage(
  details: ChatAppGenerationDetails,
  messages: BaseChatMessageUnion[],
  messageId: string,
): ChatAppGenerationDetails {
  return setChatAppGenerationForMessage(details, messages, messageId, null);
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

export function serializeChatAppGenerationByMessageId(
  details: ChatAppGenerationDetails,
): Record<string, AppGenerationMode> {
  return Object.fromEntries(
    Object.entries(details.appGenerationByMessageId).map(
      ([messageId, context]) => [messageId, context.mode],
    ),
  );
}

export function deserializeChatAppGenerationByMessageId(
  serialized: unknown,
): Record<string, ChatAppGenerationContext> {
  if (
    !serialized ||
    typeof serialized !== "object" ||
    Array.isArray(serialized)
  ) {
    return {};
  }
  const nextByMessageId: Record<string, ChatAppGenerationContext> = {};
  for (const [messageId, rawMode] of Object.entries(
    serialized as Record<string, unknown>,
  )) {
    const normalizedMessageId = messageId.trim();
    const normalizedContext = normalizeChatAppGenerationContext(
      typeof rawMode === "string"
        ? { mode: rawMode as AppGenerationMode }
        : null,
    );
    if (!normalizedMessageId || !normalizedContext) {
      continue;
    }
    nextByMessageId[normalizedMessageId] = normalizedContext;
  }
  return nextByMessageId;
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
    const appGenerationDetails = getRunAppGenerationDetails(run);
    if (!chatId || !appGenerationDetails) {
      continue;
    }
    detailsByChatId[chatId] = mergeChatAppGenerationDetails(
      detailsByChatId[chatId] ?? getDefaultChatAppGenerationDetails(),
      appGenerationDetails,
    );
  }
  return detailsByChatId;
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

function getRunAppGenerationDetails(
  run: AgentRun,
): ChatAppGenerationDetails | null {
  const inputMessages = getRunInputMessages(run);
  const serializedByMessageId = getRunInputObject(
    run,
    "appGenerationByMessageId",
  );
  const hydratedByMessageId = deserializeChatAppGenerationByMessageId(
    serializedByMessageId,
  );
  if (Object.keys(hydratedByMessageId).length > 0) {
    return buildChatAppGenerationDetails(inputMessages, hydratedByMessageId);
  }
  const messageId = getSubmittedMessageId(run);
  const appGeneration = getLegacyRunAppGenerationContext(run);
  if (!messageId || !appGeneration) {
    return null;
  }
  return buildChatAppGenerationDetails(
    inputMessages,
    recordChatAppGenerationForMessage(
      getDefaultChatAppGenerationDetails(),
      messageId,
      appGeneration,
    ).appGenerationByMessageId,
  );
}

function getLegacyRunAppGenerationContext(
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
  return { mode };
}

function getRunInputMessages(run: AgentRun): BaseChatMessageUnion[] {
  const rawMessages = getRunInputObject(run, "messages");
  return Array.isArray(rawMessages)
    ? rawMessages.filter(isBaseChatMessageUnion)
    : [];
}

function getSubmittedMessageId(run: AgentRun): string | null {
  const inputMessages = getRunInputMessages(run);
  if (inputMessages.length === 0) {
    return null;
  }
  const lastMessage = inputMessages[inputMessages.length - 1];
  return typeof lastMessage?.id === "string" && lastMessage.id.trim()
    ? lastMessage.id.trim()
    : null;
}

function getRunInputString(run: AgentRun, key: string): string | null {
  const rawValue = getRunInputObject(run, key);
  return typeof rawValue === "string" && rawValue.trim()
    ? rawValue.trim()
    : null;
}

function getRunInputObject(run: AgentRun, key: string): unknown {
  const inputs = run.inputs;
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) {
    return null;
  }
  return (inputs as Record<string, unknown>)[key];
}

function isBaseChatMessageUnion(value: unknown): value is BaseChatMessageUnion {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return (
    typeof (value as BaseChatMessageUnion).id === "string" &&
    (((value as BaseChatMessageUnion).role as string | undefined) ===
      ChatRoleEnum.user ||
      ((value as BaseChatMessageUnion).role as string | undefined) ===
        ChatRoleEnum.assistant ||
      ((value as BaseChatMessageUnion).role as string | undefined) ===
        ChatRoleEnum.tool)
  );
}
