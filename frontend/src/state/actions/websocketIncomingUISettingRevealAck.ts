import { NULL_PROJECT_CONFIG_ID } from "state/definitions";
import {
  WebsocketMsgTypeForBackendEnum,
  type WebsocketMsgUISettingRevealResult,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";

import type { UISettingRevealResultStatus } from "./uiSettingRevealShared";
import type { FrontendWebsocketMessageContext } from "./websocketIncomingTypes";

export function sendUISettingRevealResult({
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

export function resolveRevealProjectConfigId(
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

export function resolveRevealRequestId(content: unknown): string {
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

export function buildMalformedRevealStatuses(
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
  if (!isRecord(content) || !Array.isArray(content.reveals)) {
    return [];
  }
  const ids: Array<string> = [];
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
