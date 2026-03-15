import { NULL_PROJECT_CONFIG_ID } from "state/definitions";
import {
  UISettingRevealContent,
  UISettingRevealContentSchema,
  WebsocketMsgTypeForBackendEnum,
  type WebsocketMsgUISettingRevealResult,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";

import { getCurrProjectConfigId } from "./sectionEffectiveImplSelectors";
import {
  receiveUISettingReveal,
  type UISettingRevealExecutionContext,
} from "./uiSettingRevealRequests";
import {
  buildExecutionContextMismatchStatuses,
  type UISettingRevealResultStatus,
} from "./uiSettingRevealShared";
import type { FrontendWebsocketMessageContext } from "./websocketIncomingTypes";

export async function handleIncomingUISettingRevealMessage(
  content: unknown,
  context: FrontendWebsocketMessageContext,
): Promise<void> {
  const fallbackProjectConfigId = getCurrProjectConfigId();
  const projectConfigId = resolveRevealProjectConfigId(
    content,
    fallbackProjectConfigId,
  );
  const requestId = resolveRevealRequestId(content);
  let statuses: UISettingRevealResultStatus[] = [];
  const parsedRevealContent = UISettingRevealContentSchema.safeParse(content);
  if (!parsedRevealContent.success) {
    statuses = buildMalformedRevealStatuses(
      content,
      "Invalid UISettingReveal payload.",
    );
    sendUISettingRevealResult({
      projectConfigId,
      requestId,
      statuses,
      context,
    });
    return;
  }
  const revealContent: UISettingRevealContent = parsedRevealContent.data;
  const revealExecutionContext: UISettingRevealExecutionContext = {
    requestId: revealContent.requestId,
    requestedProjectConfigId: revealContent.projectConfigId.trim(),
    socketGeneration: context.socketGeneration,
    isSocketGenerationActive: () =>
      context.isSocketGenerationCurrent(context.socketGeneration) &&
      context.isSocketOpen(),
  };
  try {
    const revealStatuses = await receiveUISettingReveal(
      revealContent,
      revealExecutionContext,
    );
    statuses = Array.isArray(revealStatuses) ? revealStatuses : [];
  } catch (error) {
    const rawMessage =
      error instanceof Error && error.message.trim() !== ""
        ? error.message
        : String(error);
    const normalizedMessage = `Failed to process UI setting reveal: ${rawMessage}`;
    statuses = revealContent.reveals.map((target) => ({
      settingId: target.settingId,
      status: "failed",
      errorCode: "mutation_failed",
      errorMessage: normalizedMessage,
    }));
  }
  const ackContextMismatchStatuses = resolveAckContextMismatchStatuses({
    content: revealContent,
    executionContext: revealExecutionContext,
  });
  if (ackContextMismatchStatuses !== null) {
    statuses = ackContextMismatchStatuses;
  }
  sendUISettingRevealResult({
    projectConfigId: revealContent.projectConfigId,
    requestId: revealContent.requestId,
    statuses,
    context,
  });
}

function sendUISettingRevealResult({
  projectConfigId,
  requestId,
  statuses,
  context,
}: {
  projectConfigId: string;
  requestId: string;
  statuses: Array<UISettingRevealResultStatus>;
  context: FrontendWebsocketMessageContext;
}): void {
  const revealResultMessage: WebsocketMsgUISettingRevealResult = {
    id: null,
    messageType: WebsocketMsgTypeForBackendEnum.UISettingRevealResult,
    content: {
      projectConfigId,
      requestId,
      statuses,
    },
  };
  context.sendMessageForGeneration(
    revealResultMessage,
    context.socketGeneration,
  );
}

function resolveRevealProjectConfigId(
  content: unknown,
  fallbackProjectConfigId: string,
): string {
  const fallbackNormalizedId =
    typeof fallbackProjectConfigId === "string" &&
    fallbackProjectConfigId.trim() !== ""
      ? fallbackProjectConfigId
      : NULL_PROJECT_CONFIG_ID;
  if (!isRecord(content)) {
    return fallbackNormalizedId;
  }
  const candidateProjectConfigId = content.projectConfigId;
  if (
    typeof candidateProjectConfigId === "string" &&
    candidateProjectConfigId.trim() !== ""
  ) {
    return candidateProjectConfigId;
  }
  return fallbackNormalizedId;
}

function resolveRevealRequestId(content: unknown): string {
  if (isRecord(content)) {
    const candidateRequestId = content.requestId;
    if (
      typeof candidateRequestId === "string" &&
      candidateRequestId.trim() !== ""
    ) {
      return candidateRequestId;
    }
  }
  return createNewId();
}

function buildMalformedRevealStatuses(
  content: unknown,
  errorMessage: string,
): Array<UISettingRevealResultStatus> {
  const settingIds = extractRevealSettingIds(content);
  return settingIds.map((settingId) => ({
    settingId,
    status: "failed",
    errorCode: "mutation_failed",
    errorMessage,
  }));
}

function extractRevealSettingIds(content: unknown): string[] {
  if (!isRecord(content)) {
    return [];
  }
  if (!Array.isArray(content.reveals)) {
    return [];
  }
  const ids: string[] = [];
  for (const reveal of content.reveals) {
    if (!isRecord(reveal)) {
      continue;
    }
    if (
      typeof reveal.settingId !== "string" ||
      reveal.settingId.trim() === ""
    ) {
      continue;
    }
    ids.push(reveal.settingId);
  }
  return ids;
}

function resolveAckContextMismatchStatuses({
  content,
  executionContext,
}: {
  content: UISettingRevealContent;
  executionContext: UISettingRevealExecutionContext;
}): Array<UISettingRevealResultStatus> | null {
  if (!executionContext.isSocketGenerationActive()) {
    return buildExecutionContextMismatchStatuses({
      reveals: content.reveals,
      errorMessage:
        "UI setting reveal execution context mismatch: websocket generation changed " +
        `before request ${executionContext.requestId} completed.`,
    });
  }
  const activeProjectConfigId = getCurrProjectConfigId().trim();
  const requestedProjectConfigId = executionContext.requestedProjectConfigId;
  if (activeProjectConfigId === requestedProjectConfigId) {
    return null;
  }
  return buildExecutionContextMismatchStatuses({
    reveals: content.reveals,
    errorMessage:
      "UI setting reveal execution context mismatch: requested project " +
      `${requestedProjectConfigId} but active project is ${activeProjectConfigId}.`,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
