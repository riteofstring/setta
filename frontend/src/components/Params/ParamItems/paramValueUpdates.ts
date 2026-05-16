import { callOpenAPI } from "@setta/app-subsystem-frontend-sdk";
import _ from "lodash";
import { setParamEnteredValue } from "openapi/http";
import {
  dispatchOptimisticProjectStateUpdateWithResult,
  getCurrCodeObjVariantIfPresent,
  getCurrEffectiveCodeObjImplWithTypeGuardIfPresent,
  getCurrProjectConfigId,
  getCurrSectionVariantId,
  setCodeObjVariantImplValue,
} from "state/actions/sectionInfos";
import { sendRealtimeSectionParamLiteral } from "state/actions/websocketReceive";
import type { ZustandProjectState } from "state/definitions";
import {
  BaseChildlessCodeObjImplUnion,
  CodeObjTypeEnum,
  isBaseChildlessCodeObjImpl,
} from "utils/generatedTypes";
import { shouldEmitRealtimeValue } from "utils/paramValue";
import type { ParamValueChangeOptions } from "../ParamUIs/ConfiguredParamInputs";

export type ParamInputPreviewState = {
  readonly baseValue: string;
  readonly codeObjType: CodeObjTypeEnum;
  readonly codeObjVariantId: string | null;
  readonly sectionVariantId: string | null;
};

type ParamBackendUpdate =
  | {
      readonly kind: "password";
      readonly sectionVariantId: string;
    }
  | {
      readonly codeObjVariantId: string;
      readonly kind: "standard";
      readonly sectionVariantId: string;
    };

type StandardParamPersistencePayload = {
  readonly codeObjVariantId: string;
  readonly paramInfoId: string;
  readonly projectConfigId: string;
  readonly sectionId: string;
  readonly sectionVariantId: string;
  readonly value: string;
};

type StandardParamPersistenceQueueEntry = {
  inflight: boolean;
  lastUpdatedAt: number;
  latest: StandardParamPersistencePayload;
  timer: ReturnType<typeof setTimeout> | null;
};

const PARAM_VALUE_PERSISTENCE_IDLE_MS = 250;
const standardParamPersistenceQueues = new Map<
  string,
  StandardParamPersistenceQueueEntry
>();

export function getParamInputPreviewState(
  projectState: ZustandProjectState,
  sectionId: string,
  paramInfoId: string,
): ParamInputPreviewState | null {
  const impl = getCurrEffectiveCodeObjImplWithTypeGuardIfPresent(
    projectState,
    sectionId,
    paramInfoId,
    isBaseChildlessCodeObjImpl,
    true,
  );
  if (!impl) {
    return null;
  }

  const codeObjVariant = getCurrCodeObjVariantIfPresent(
    projectState,
    sectionId,
    paramInfoId,
    true,
  );
  if (!codeObjVariant) {
    return null;
  }

  return {
    baseValue: impl.value,
    codeObjType: impl.type,
    codeObjVariantId: codeObjVariant.id,
    sectionVariantId: getCurrSectionVariantId(projectState, sectionId, true),
  };
}

export function commitParamInputValueChange({
  nextValue,
  options,
  paramInfoId,
  previousValue,
  previewState,
  sectionId,
}: {
  readonly nextValue: unknown;
  readonly options?: ParamValueChangeOptions | undefined;
  readonly paramInfoId: string;
  readonly previousValue: string;
  readonly previewState: ParamInputPreviewState;
  readonly sectionId: string;
}): string {
  const nextValueString = _.toString(nextValue);
  if (
    shouldEmitRealtimeValue({
      previousValue,
      nextValue: nextValueString,
      codeObjType: previewState.codeObjType,
    })
  ) {
    sendRealtimeSectionParamLiteral(sectionId, paramInfoId, nextValueString);
  }
  if (options?.skipBackendUpdate) {
    return nextValueString;
  }
  queueBackendParamUpdate({
    codeObjType: previewState.codeObjType,
    nextValue: nextValueString,
    paramInfoId,
    sectionId,
    update: resolveBackendUpdate({
      codeObjVariantId: previewState.codeObjVariantId,
      isPasswordParam:
        previewState.codeObjType === CodeObjTypeEnum.PasswordParam,
      sectionVariantId: previewState.sectionVariantId,
    }),
  });
  return nextValueString;
}

function resolveBackendUpdate({
  codeObjVariantId,
  isPasswordParam,
  sectionVariantId,
}: {
  readonly codeObjVariantId: string | null;
  readonly isPasswordParam: boolean;
  readonly sectionVariantId: string | null;
}): ParamBackendUpdate | null {
  if (!sectionVariantId) {
    return null;
  }
  if (isPasswordParam) {
    return {
      kind: "password",
      sectionVariantId,
    };
  }
  if (!codeObjVariantId) {
    return null;
  }
  return {
    codeObjVariantId,
    kind: "standard",
    sectionVariantId,
  };
}

function queueBackendParamUpdate({
  codeObjType,
  nextValue,
  paramInfoId,
  sectionId,
  update,
}: {
  readonly codeObjType: CodeObjTypeEnum;
  readonly nextValue: string;
  readonly paramInfoId: string;
  readonly sectionId: string;
  readonly update: ParamBackendUpdate | null;
}) {
  if (!update) {
    return;
  }
  if (update.kind === "password") {
    debouncedSetPasswordParamValue(
      sectionId,
      update.sectionVariantId,
      paramInfoId,
      nextValue,
    );
    return;
  }
  const payload = {
    codeObjVariantId: update.codeObjVariantId,
    paramInfoId,
    projectConfigId: getCurrProjectConfigId(),
    sectionId,
    sectionVariantId: update.sectionVariantId,
    value: nextValue,
  };
  if (isTextLikeParamPersistenceCoalesced(codeObjType)) {
    debouncedSetParamEnteredValue(payload);
    return;
  }
  void dispatchParamEnteredValuePersistence(payload);
}

function isTextLikeParamPersistenceCoalesced(
  codeObjType: CodeObjTypeEnum,
): boolean {
  return (
    codeObjType === CodeObjTypeEnum.CodeParam ||
    codeObjType === CodeObjTypeEnum.TextAreaParam ||
    codeObjType === CodeObjTypeEnum.TextParam
  );
}

function debouncedSetParamEnteredValue(
  latest: StandardParamPersistencePayload,
) {
  const key = getStandardParamPersistenceKey(latest);
  const existing = standardParamPersistenceQueues.get(key);
  if (existing) {
    existing.latest = latest;
    existing.lastUpdatedAt = Date.now();
    scheduleStandardParamPersistenceFlush(key, existing);
    return;
  }
  const entry: StandardParamPersistenceQueueEntry = {
    inflight: false,
    lastUpdatedAt: Date.now(),
    latest,
    timer: null,
  };
  standardParamPersistenceQueues.set(key, entry);
  scheduleStandardParamPersistenceFlush(key, entry);
}

export function flushPendingParamInputValueChange({
  codeObjVariantId,
  paramInfoId,
  projectConfigId,
  sectionId,
  sectionVariantId,
}: {
  readonly codeObjVariantId: string | null;
  readonly paramInfoId: string;
  readonly projectConfigId: string;
  readonly sectionId: string;
  readonly sectionVariantId: string | null;
}) {
  if (!codeObjVariantId || !sectionVariantId) {
    return;
  }
  const key = getStandardParamPersistenceKey({
    codeObjVariantId,
    paramInfoId,
    projectConfigId,
    sectionId,
    sectionVariantId,
    value: "",
  });
  const entry = standardParamPersistenceQueues.get(key);
  if (!entry || entry.inflight) {
    return;
  }
  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
  flushStandardParamPersistenceQueue(key, entry);
}

function getStandardParamPersistenceKey({
  codeObjVariantId,
  paramInfoId,
  projectConfigId,
  sectionId,
  sectionVariantId,
}: StandardParamPersistencePayload): string {
  return [
    projectConfigId,
    sectionId,
    sectionVariantId,
    paramInfoId,
    codeObjVariantId,
  ].join("\u0000");
}

function scheduleStandardParamPersistenceFlush(
  key: string,
  entry: StandardParamPersistenceQueueEntry,
) {
  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
  if (entry.inflight) {
    return;
  }
  const elapsedMs = Date.now() - entry.lastUpdatedAt;
  const waitMs = Math.max(0, PARAM_VALUE_PERSISTENCE_IDLE_MS - elapsedMs);
  entry.timer = setTimeout(() => {
    entry.timer = null;
    flushStandardParamPersistenceQueue(key, entry);
  }, waitMs);
}

function flushStandardParamPersistenceQueue(
  key: string,
  entry: StandardParamPersistenceQueueEntry,
) {
  if (entry.inflight) {
    return;
  }
  entry.inflight = true;
  const payload = entry.latest;
  void dispatchParamEnteredValuePersistence(payload).finally(() => {
    entry.inflight = false;
    if (entry.latest !== payload) {
      scheduleStandardParamPersistenceFlush(key, entry);
      return;
    }
    standardParamPersistenceQueues.delete(key);
  });
}

function dispatchParamEnteredValuePersistence(
  payload: StandardParamPersistencePayload,
): Promise<unknown> {
  return dispatchOptimisticProjectStateUpdateWithResult({
    projectConfigId: payload.projectConfigId,
    apply: (state) => {
      setCodeObjVariantImplValue<BaseChildlessCodeObjImplUnion>(
        state,
        payload.paramInfoId,
        payload.codeObjVariantId,
        {
          value: payload.value,
        },
      );
    },
    send: (frontendOpId) => {
      return callOpenAPI(
        setParamEnteredValue({
          body: {
            projectConfigId: payload.projectConfigId,
            sectionId: payload.sectionId,
            sectionVariantId: payload.sectionVariantId,
            paramInfoId: payload.paramInfoId,
            value: payload.value,
            frontendOpId,
          },
        } as Parameters<typeof setParamEnteredValue>[0]),
      );
    },
  }).result;
}

const debouncedSetPasswordParamValue = _.debounce(
  (
    sectionId: string,
    sectionVariantId: string,
    paramInfoId: string,
    value: string,
  ) => {
    callOpenAPI(
      setParamEnteredValue({
        body: {
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          sectionVariantId,
          paramInfoId,
          value,
        },
      } as Parameters<typeof setParamEnteredValue>[0]),
    );
  },
  50,
);
