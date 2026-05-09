import {
  callOpenAPI,
  createNewId,
  res200,
} from "@setta/app-subsystem-frontend-sdk";

import { uploadBinary } from "openapi/http";

import { addTemporaryNotification } from "state/actions/notifications";

import { sendRealtimeDependencyValue } from "state/actions/realtimeDependencySend";

import { NULL_PROJECT_CONFIG_ID } from "state/definitions";

import { encodeBinaryFrame } from "utils/binaryWebsocket";

import { C } from "utils/c";

import {
  BinaryDependencyValue,
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  NotificationTypeEnum,
  SectionDependencyKey,
  UISettingRevealContent,
  UISettingRevealResultStatus,
  createCurrentAddressUpdateMessage,
} from "utils/generatedTypes";

import { dependencyKeyCovered } from "../listenerCoverage";

import { getCurrProjectConfigId } from "../sectionInfos";

import {
  BinaryUploadRouteResponse,
  FrontendOutboundMessage,
  activeWebsocketGeneration,
  wss,
  wssReady,
} from "./websocketConnection";

const REALTIME_BINARY_OVERSIZE_COOLDOWN_MS = 5000;

let lastRealtimeBinaryOversizeWarningAt = 0;

export function buildExecutionContextMismatchStatuses(
  reveals: Array<UISettingRevealContent["reveals"][number]>,
  errorMessage: string,
): UISettingRevealResultStatus[] {
  return reveals.map((target) => ({
    settingId: target.settingId,
    status: "failed",
    errorCode: "mutation_failed",
    errorMessage,
  }));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function sendCurrentAddress(currentAddress: string) {
  sendMessage(createCurrentAddressUpdateMessage({ content: currentAddress }));
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
    void sendRealtimeSectionBinaryViaUpload(sectionId, payload, mimeType);
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
  sendRealtimeDependencyValue({
    binaryPayload: payload,
    dependencyKey,
    projectConfigIdOverride,
    value: dependencyValue,
  });
}

function sendMessage(message: FrontendOutboundMessage) {
  if (wssReady(wss)) {
    wss.send(JSON.stringify(message));
  }
}

export function sendMessageForGeneration(
  message: FrontendOutboundMessage,
  socketGeneration: number,
): void {
  if (!isSocketGenerationCurrent(socketGeneration)) {
    return;
  }
  sendMessage(message);
}

export function isSocketGenerationCurrent(socketGeneration: number): boolean {
  return activeWebsocketGeneration === socketGeneration;
}

export function sendBinaryMessage(
  message: FrontendOutboundMessage,
  payload: ArrayBuffer,
) {
  if (wssReady(wss)) {
    const frame = encodeBinaryFrame(message, payload);
    wss.send(frame);
  }
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
  addTemporaryNotification(message, NotificationTypeEnum.warning);
}

async function uploadRealtimeBinaryPayload(
  payload: ArrayBuffer,
  mimeType: string,
) {
  const blob = new Blob([payload], { type: mimeType });
  const res = (await callOpenAPI(
    uploadBinary({
      body: {
        durable: false,
        file: blob,
      },
    } as Parameters<typeof uploadBinary>[0]),
  )) as BinaryUploadRouteResponse;
  if (!res200(res) || !res.data) {
    return null;
  }
  return res.data;
}

async function sendRealtimeSectionBinaryViaUpload(
  sectionId: string,
  payload: ArrayBuffer,
  mimeType: string,
) {
  const projectConfigId = getCurrProjectConfigId();
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
  sendRealtimeDependencyValue({
    dependencyKey,
    projectConfigIdOverride: projectConfigId,
    value: dependencyValue,
  });
}
