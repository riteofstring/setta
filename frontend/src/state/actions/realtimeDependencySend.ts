import { NULL_PROJECT_CONFIG_ID } from "state/definitions";
import {
  BaseDependencyKeyUnion,
  BaseDependencyValueUnion,
  DependencyEvent,
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  MessageTypeEnum,
  RealtimeDependencyEventMessage,
  RealtimeUIChangeMessage,
  SectionDependencyKey,
} from "utils/generatedTypes";
import {
  dependencyKeyCovered,
  getListenerCoverageRecord,
} from "./listenerCoverage";
import { getCurrProjectConfigId } from "./sectionInfos";

type FrontendOutboundMessage =
  | RealtimeUIChangeMessage
  | RealtimeDependencyEventMessage;

type CoverageRequirement = "optional" | "required";

type RealtimeDependencySenders = {
  sendBinaryMessage: (
    message: FrontendOutboundMessage,
    payload: ArrayBuffer,
  ) => void;
  sendMessage: (message: FrontendOutboundMessage) => void;
};

const NOOP_SENDERS: RealtimeDependencySenders = {
  sendBinaryMessage: () => undefined,
  sendMessage: () => undefined,
};

let realtimeDependencySenders = NOOP_SENDERS;

export function registerRealtimeDependencySenders(
  senders: RealtimeDependencySenders,
): void {
  realtimeDependencySenders = senders;
}

function resolveProjectConfigId(
  projectConfigIdOverride?: string | null,
): string | null {
  const projectConfigId = projectConfigIdOverride ?? getCurrProjectConfigId();
  if (projectConfigId === NULL_PROJECT_CONFIG_ID) {
    return null;
  }
  return projectConfigId;
}

function dependencyKeyIsSendable(
  projectConfigId: string,
  dependencyKey: BaseDependencyKeyUnion,
  coverageRequirement: CoverageRequirement,
): boolean {
  const coverage = getListenerCoverageRecord(projectConfigId);
  if (!coverage) {
    return coverageRequirement === "optional";
  }
  return dependencyKeyCovered(projectConfigId, dependencyKey);
}

function dispatchRealtimeMessage(
  message: FrontendOutboundMessage,
  payloadType: DependencyValueTypeEnum | undefined,
  binaryPayload?: ArrayBuffer,
): void {
  if (payloadType === DependencyValueTypeEnum.Binary && binaryPayload) {
    realtimeDependencySenders.sendBinaryMessage(message, binaryPayload);
    return;
  }
  realtimeDependencySenders.sendMessage(message);
}

type RealtimeDependencyValueInput = {
  binaryPayload?: ArrayBuffer;
  dependencyKey: BaseDependencyKeyUnion;
  projectConfigIdOverride?: string | null;
  value: BaseDependencyValueUnion;
};

export function sendRealtimeDependencyValue({
  dependencyKey,
  value,
  binaryPayload,
  projectConfigIdOverride,
}: RealtimeDependencyValueInput): void {
  const projectConfigId = resolveProjectConfigId(projectConfigIdOverride);
  if (
    !projectConfigId ||
    !dependencyKeyIsSendable(projectConfigId, dependencyKey, "required")
  ) {
    return;
  }
  const message: RealtimeUIChangeMessage = {
    id: null,
    messageType: MessageTypeEnum.RealtimeUIChange,
    content: {
      projectConfigId,
      dependencyKey,
      value,
    },
  };
  dispatchRealtimeMessage(message, value.type, binaryPayload);
}

type DependencyEventInput = {
  binaryPayload?: ArrayBuffer;
  dependencyKey: BaseDependencyKeyUnion;
  payload?: BaseDependencyValueUnion | null;
  timestampMs?: number;
};

export function sendRealtimeDependencyEvent(
  event: DependencyEventInput,
  projectConfigIdOverride?: string | null,
): void {
  const projectConfigId = resolveProjectConfigId(projectConfigIdOverride);
  if (
    !projectConfigId ||
    !dependencyKeyIsSendable(projectConfigId, event.dependencyKey, "optional")
  ) {
    return;
  }

  const dependencyEvent: DependencyEvent = {
    dependencyKey: event.dependencyKey,
    payload: event.payload ?? null,
    timestampMs: event.timestampMs ?? Date.now(),
  };
  const message: RealtimeDependencyEventMessage = {
    id: null,
    messageType: MessageTypeEnum.RealtimeDependencyEvent,
    content: {
      projectConfigId,
      dependencyEvent,
    },
  };
  dispatchRealtimeMessage(
    message,
    dependencyEvent.payload?.type,
    event.binaryPayload,
  );
}

export function sendRealtimeSectionParamLiteral(
  sectionId: string,
  codeObjId: string,
  payload: string,
  projectConfigIdOverride?: string | null,
): void {
  const dependencyKey = {
    codeObjId,
    sectionId,
    type: DependencyKeyTypeEnum.SectionParam,
  };
  sendRealtimeDependencyValue({
    dependencyKey,
    value: {
      payload,
      type: DependencyValueTypeEnum.Literal,
    },
    projectConfigIdOverride,
  });
}

export function sendRealtimeSectionLiteral(
  sectionId: string,
  payload: string,
  projectConfigIdOverride?: string | null,
): void {
  const dependencyKey: SectionDependencyKey = {
    sectionId,
    type: DependencyKeyTypeEnum.Section,
  };
  sendRealtimeDependencyValue({
    dependencyKey,
    value: {
      payload,
      type: DependencyValueTypeEnum.Literal,
    },
    projectConfigIdOverride,
  });
}
