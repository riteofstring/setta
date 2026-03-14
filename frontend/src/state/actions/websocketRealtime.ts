import { addTemporaryNotification } from "state/actions/notifications";
import { NULL_PROJECT_CONFIG_ID } from "state/definitions";
import { C } from "utils/c";
import { res200 } from "utils/endpointUtils";
import { route_binary_upload } from "utils/generatedEndpoints";
import {
  BaseDependencyKeyUnion,
  BaseDependencyValueUnion,
  BinaryDependencyValue,
  DependencyEvent,
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  LiteralDependencyValue,
  SectionDependencyKey,
  SectionParamDependencyKey,
  SettaNotificationTypeEnum,
  WebsocketMsgRealtimeDependencyEvent,
  WebsocketMsgRealtimeUIChange,
  WebsocketMsgTypeForBackendEnum,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import {
  dependencyKeyCovered,
  getListenerCoverageRecord,
} from "./listenerCoverage";
import { getCurrProjectConfigId } from "./sectionEffectiveImpls";
import { sendBinaryMessage, sendMessage } from "./websocketRuntime";

const REALTIME_BINARY_OVERSIZE_COOLDOWN_MS = 5000;
let lastRealtimeBinaryOversizeWarningAt = 0;

function emitRealtimeDependencyValue(
  dependencyKey: BaseDependencyKeyUnion,
  value: BaseDependencyValueUnion,
  binaryPayload?: ArrayBuffer,
  projectConfigIdOverride?: string | null,
) {
  const projectConfigId = projectConfigIdOverride ?? getCurrProjectConfigId();
  if (projectConfigId === NULL_PROJECT_CONFIG_ID) {
    return;
  }
  const coverage = getListenerCoverageRecord(projectConfigId);
  if (!coverage || !dependencyKeyCovered(projectConfigId, dependencyKey)) {
    return;
  }

  const message: WebsocketMsgRealtimeUIChange = {
    id: null,
    messageType: WebsocketMsgTypeForBackendEnum.RealtimeUIChange,
    content: {
      projectConfigId,
      dependencyKey,
      value,
    },
  };
  if (value.type === DependencyValueTypeEnum.Binary && binaryPayload) {
    sendBinaryMessage(message, binaryPayload);
    return;
  }
  sendMessage(message);
}

type DependencyEventInput = {
  dependencyKey: BaseDependencyKeyUnion;
  payload?: BaseDependencyValueUnion | null;
  binaryPayload?: ArrayBuffer;
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
  const message: WebsocketMsgRealtimeDependencyEvent = {
    id: null,
    messageType: WebsocketMsgTypeForBackendEnum.RealtimeDependencyEvent,
    content: {
      projectConfigId,
      dependencyEvent,
    },
  };
  if (
    dependencyEvent.payload?.type === DependencyValueTypeEnum.Binary &&
    event.binaryPayload
  ) {
    sendBinaryMessage(message, event.binaryPayload);
    return;
  }
  sendMessage(message);
}

export function sendRealtimeSectionParamLiteral(
  sectionId: string,
  codeObjId: string,
  value: string,
  projectConfigIdOverride?: string | null,
) {
  const dependencyKey: SectionParamDependencyKey = {
    type: DependencyKeyTypeEnum.SectionParam,
    sectionId,
    codeObjId,
  };
  const dependencyValue: LiteralDependencyValue = {
    payload: value,
    type: DependencyValueTypeEnum.Literal,
  };
  emitRealtimeDependencyValue(
    dependencyKey,
    dependencyValue,
    undefined,
    projectConfigIdOverride,
  );
}

export function sendRealtimeSectionLiteral(
  sectionId: string,
  value: string,
  projectConfigIdOverride?: string | null,
) {
  const dependencyKey: SectionDependencyKey = {
    type: DependencyKeyTypeEnum.Section,
    sectionId,
  };
  const dependencyValue: LiteralDependencyValue = {
    payload: value,
    type: DependencyValueTypeEnum.Literal,
  };
  emitRealtimeDependencyValue(
    dependencyKey,
    dependencyValue,
    undefined,
    projectConfigIdOverride,
  );
}

export function sendRealtimeSectionBinary(
  sectionId: string,
  payload: ArrayBuffer,
  mimeType = "image/png",
  projectConfigIdOverride?: string | null,
) {
  if (
    C.REALTIME_BINARY_MAX_BYTES > 0 &&
    payload.byteLength > C.REALTIME_BINARY_MAX_BYTES
  ) {
    void sendRealtimeSectionBinaryViaUpload(
      sectionId,
      payload,
      mimeType,
      projectConfigIdOverride,
    );
    return;
  }
  const dependencyKey: SectionDependencyKey = {
    type: DependencyKeyTypeEnum.Section,
    sectionId,
  };
  const dependencyValue: BinaryDependencyValue = {
    payload: {
      contentId: createNewId(),
      byteLength: payload.byteLength,
      mimeType,
    },
    type: DependencyValueTypeEnum.Binary,
  };
  emitRealtimeDependencyValue(
    dependencyKey,
    dependencyValue,
    payload,
    projectConfigIdOverride,
  );
}

function maybeWarnRealtimeOversize(message: string) {
  const now = Date.now();
  if (
    now - lastRealtimeBinaryOversizeWarningAt <
    REALTIME_BINARY_OVERSIZE_COOLDOWN_MS
  ) {
    return;
  }
  lastRealtimeBinaryOversizeWarningAt = now;
  addTemporaryNotification(message, SettaNotificationTypeEnum.warning);
}

async function uploadRealtimeBinaryPayload(
  payload: ArrayBuffer,
  mimeType: string,
) {
  const blob = new Blob([payload], { type: mimeType });
  const form = new FormData();
  form.append("file", blob, "realtime.bin");
  form.append("durable", "false");
  const res = await route_binary_upload(form);
  if (!res200(res)) {
    return null;
  }
  return res.data;
}

async function sendRealtimeSectionBinaryViaUpload(
  sectionId: string,
  payload: ArrayBuffer,
  mimeType: string,
  projectConfigIdOverride?: string | null,
) {
  const projectConfigId = projectConfigIdOverride ?? getCurrProjectConfigId();
  if (projectConfigId === NULL_PROJECT_CONFIG_ID) {
    return;
  }
  const dependencyKey: SectionDependencyKey = {
    type: DependencyKeyTypeEnum.Section,
    sectionId,
  };
  if (!dependencyKeyCovered(projectConfigId, dependencyKey)) {
    return;
  }
  const ref = await uploadRealtimeBinaryPayload(payload, mimeType);
  if (!ref) {
    maybeWarnRealtimeOversize(
      "Realtime snapshot too large to send. Upload failed.",
    );
    return;
  }
  const dependencyValue: BinaryDependencyValue = {
    payload: ref,
    type: DependencyValueTypeEnum.Binary,
  };
  emitRealtimeDependencyValue(
    dependencyKey,
    dependencyValue,
    undefined,
    projectConfigId,
  );
}
