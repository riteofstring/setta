import { getRunLastUpdatedMs } from "state/actions/agentRunUtils";
import {
  ChatRoleEnum,
  type AgentRun,
  type BaseChatMessageUnion,
} from "utils/generatedTypes";
import {
  buildChatAppGenerationDetails,
  deserializeChatAppGenerationByMessageId,
  getDefaultChatAppGenerationDetails,
  mergeChatAppGenerationDetails,
  type ChatAppGenerationDetails,
} from "./chatAppGenerationDetails";

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
