import { getRunLastUpdatedMs } from "state/actions/agentRunUtils";
import {
  parseAppGenerationMode,
  type AppGenerationMode,
} from "state/types/appGenerationMode";
import {
  ChatRoleEnum,
  type AgentRun,
  type BaseChatMessageUnion,
} from "utils/generatedTypes";

const PLAIN_CHAT_MESSAGE_MODE = "plain_chat";

export type ChatAppGenerationContext = {
  mode: AppGenerationMode;
};

type SerializedChatAppGenerationMessageMode =
  | AppGenerationMode
  | typeof PLAIN_CHAT_MESSAGE_MODE;

export type ChatAppGenerationMessageState = {
  mode: AppGenerationMode | null;
};

export type ChatAppGenerationDetails = {
  activeAppGeneration: ChatAppGenerationContext | null;
  appGenerationByMessageId: Record<string, ChatAppGenerationMessageState>;
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
  const mode = parseAppGenerationMode(context?.mode);
  if (mode === null) {
    return null;
  }
  return { mode };
}

export function buildChatAppGenerationDetails(
  messages: BaseChatMessageUnion[],
  appGenerationByMessageId: Record<string, ChatAppGenerationMessageState>,
): ChatAppGenerationDetails {
  return {
    activeAppGeneration: resolveLatestChatAppGeneration(
      messages,
      appGenerationByMessageId,
    ),
    appGenerationByMessageId,
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
  const hasRetainedMessage = messages.some(
    (message) => message.id === normalizedMessageId,
  );
  const nextByMessageId = {
    ...details.appGenerationByMessageId,
  };
  if (!hasRetainedMessage) {
    delete nextByMessageId[normalizedMessageId];
    return buildChatAppGenerationDetails(messages, nextByMessageId);
  }
  nextByMessageId[normalizedMessageId] =
    createChatAppGenerationMessageState(context);
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

export function mergeChatAppGenerationDetails(
  existing: ChatAppGenerationDetails,
  incoming: ChatAppGenerationDetails,
): ChatAppGenerationDetails {
  const hasIncomingMessageStates =
    Object.keys(incoming.appGenerationByMessageId).length > 0;
  return {
    activeAppGeneration: hasIncomingMessageStates
      ? incoming.activeAppGeneration
      : existing.activeAppGeneration,
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
): Record<string, SerializedChatAppGenerationMessageMode> {
  return Object.fromEntries(
    Object.entries(details.appGenerationByMessageId).map(
      ([messageId, messageState]) => [
        messageId,
        messageState.mode ?? PLAIN_CHAT_MESSAGE_MODE,
      ],
    ),
  );
}

export function deserializeChatAppGenerationByMessageId(
  serialized: unknown,
): Record<string, ChatAppGenerationMessageState> {
  if (
    !serialized ||
    typeof serialized !== "object" ||
    Array.isArray(serialized)
  ) {
    return {};
  }
  const nextByMessageId: Record<string, ChatAppGenerationMessageState> = {};
  for (const [messageId, rawMode] of Object.entries(
    serialized as Record<string, unknown>,
  )) {
    const normalizedMessageId = messageId.trim();
    const messageState =
      typeof rawMode === "string"
        ? parseChatAppGenerationMessageState(rawMode)
        : null;
    if (!normalizedMessageId || !messageState) {
      continue;
    }
    nextByMessageId[normalizedMessageId] = messageState;
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
  appGenerationByMessageId: Record<string, ChatAppGenerationMessageState>,
): ChatAppGenerationContext | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const messageId = messages[index]?.id;
    if (typeof messageId !== "string") {
      continue;
    }
    const messageState = appGenerationByMessageId[messageId];
    if (messageState) {
      return resolveChatAppGenerationContextFromMessageState(messageState);
    }
  }
  return null;
}

function createChatAppGenerationMessageState(
  context:
    | {
        mode: AppGenerationMode | null;
      }
    | null
    | undefined,
): ChatAppGenerationMessageState {
  return {
    mode: parseAppGenerationMode(context?.mode),
  };
}

function parseChatAppGenerationMessageState(
  rawMode: string,
): ChatAppGenerationMessageState | null {
  if (rawMode === PLAIN_CHAT_MESSAGE_MODE) {
    return {
      mode: null,
    };
  }
  const mode = parseAppGenerationMode(rawMode);
  if (mode === null) {
    return null;
  }
  return {
    mode,
  };
}

export function resolveChatAppGenerationContextFromMessageState(
  messageState: ChatAppGenerationMessageState | null | undefined,
): ChatAppGenerationContext | null {
  if (!messageState) {
    return null;
  }
  const mode = parseAppGenerationMode(messageState.mode);
  if (mode === null) {
    return null;
  }
  return {
    mode,
  };
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
  if (Object.keys(hydratedByMessageId).length === 0) {
    return null;
  }
  return buildChatAppGenerationDetails(inputMessages, hydratedByMessageId);
}

function getRunInputMessages(run: AgentRun): BaseChatMessageUnion[] {
  const rawMessages = getRunInputObject(run, "messages");
  return Array.isArray(rawMessages)
    ? rawMessages.filter(isBaseChatMessageUnion)
    : [];
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
