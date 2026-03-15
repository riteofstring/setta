import { addTemporaryNotification } from "state/actions/notifications";
import { NULL_PROJECT_CONFIG_ID } from "state/definitions";
import { C } from "utils/c";
import { res200 } from "utils/endpointUtils";
import { route_binary_upload } from "utils/generatedEndpoints";
import {
  BinaryDependencyValue,
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  SectionDependencyKey,
  SettaNotificationTypeEnum,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";

import { dependencyKeyCovered } from "./listenerCoverage";
import { getCurrProjectConfigId } from "./sectionEffectiveImplSelectors";
import { emitRealtimeDependencyValue } from "./websocketRealtimeDispatch";

const REALTIME_BINARY_OVERSIZE_COOLDOWN_MS = 5000;
let lastRealtimeBinaryOversizeWarningAt = 0;

export function sendRealtimeSectionBinary(
  sectionId: string,
  payload: ArrayBuffer,
  mimeType = "image/png",
  projectConfigIdOverride?: string | null,
): void {
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

function maybeWarnRealtimeOversize(message: string): void {
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
): Promise<void> {
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
