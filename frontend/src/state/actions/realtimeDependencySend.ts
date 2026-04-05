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

function emitRealtimeDependencyValue(
  dependencyKey: BaseDependencyKeyUnion,
  value: BaseDependencyValueUnion,
  binaryPayload?: ArrayBuffer,
  projectConfigIdOverride?: string | null,
): void {
  const projectConfigId = projectConfigIdOverride ?? getCurrProjectConfigId();
  if (projectConfigId === NULL_PROJECT_CONFIG_ID) {
    return;
  }
  const coverage = getListenerCoverageRecord(projectConfigId);
  if (!coverage || !dependencyKeyCovered(projectConfigId, dependencyKey)) {
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
  if (value.type === DependencyValueTypeEnum.Binary && binaryPayload) {
    realtimeDependencySenders.sendBinaryMessage(message, binaryPayload);
    return;
  }
  realtimeDependencySenders.sendMessage(message);
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
  const projectConfigId = projectConfigIdOverride ?? getCurrProjectConfigId();
  if (projectConfigId === NULL_PROJECT_CONFIG_ID) {
    return;
  }
  const coverage = getListenerCoverageRecord(projectConfigId);
  if (coverage && !dependencyKeyCovered(projectConfigId, event.dependencyKey)) {
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
  if (
    dependencyEvent.payload?.type === DependencyValueTypeEnum.Binary &&
    event.binaryPayload
  ) {
    realtimeDependencySenders.sendBinaryMessage(message, event.binaryPayload);
    return;
  }
  realtimeDependencySenders.sendMessage(message);
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
  emitRealtimeDependencyValue(
    dependencyKey,
    {
      payload,
      type: DependencyValueTypeEnum.Literal,
    },
    undefined,
    projectConfigIdOverride,
  );
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
  emitRealtimeDependencyValue(
    dependencyKey,
    {
      payload,
      type: DependencyValueTypeEnum.Literal,
    },
    undefined,
    projectConfigIdOverride,
  );
}
