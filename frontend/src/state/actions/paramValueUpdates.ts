import _ from "lodash";
import type { ResponseDataAndStatus } from "utils/endpointUtils";
import { route_set_param_entered_value } from "utils/generatedEndpoints";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
  setCurrEffectiveCodeObjImplValueIfPresent,
} from "./sectionInfos";

type ParamUpdateMode = "optimistic" | "direct";

type PendingParamEnteredValueUpdate = {
  mode: ParamUpdateMode;
  projectConfigId: string;
  sectionId: string;
  paramInfoId: string;
  value: string;
  source: string;
  onResponse?: (response: ResponseDataAndStatus<null>) => void;
};

type ParamUpdatePromise = Promise<ResponseDataAndStatus<null>>;
type DebouncedParamUpdate = _.DebouncedFunc<() => void>;

const pendingUpdateByKey = new Map<string, PendingParamEnteredValueUpdate>();
const debouncerByKey = new Map<string, DebouncedParamUpdate>();
const inFlightPromiseByKey = new Map<string, ParamUpdatePromise>();

function logParamValueUpdateEvent(event: string, payload: unknown): void {
  console.log(
    `[param-value-updates-debug] ${event} ${JSON.stringify(payload)}`,
  );
}

function buildPendingUpdateKey(update: PendingParamEnteredValueUpdate): string {
  return `${update.mode}:${update.projectConfigId}:${update.sectionId}:${update.paramInfoId}`;
}

function applyPendingParamUpdate(key: string): void {
  const pendingUpdate = pendingUpdateByKey.get(key);
  if (!pendingUpdate) {
    return;
  }
  pendingUpdateByKey.delete(key);
  logParamValueUpdateEvent("apply.start", {
    key,
    mode: pendingUpdate.mode,
    projectConfigId: pendingUpdate.projectConfigId,
    sectionId: pendingUpdate.sectionId,
    paramInfoId: pendingUpdate.paramInfoId,
    source: pendingUpdate.source,
    value: pendingUpdate.value,
  });

  let updatePromise: ParamUpdatePromise | null = null;
  if (pendingUpdate.mode === "optimistic") {
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveCodeObjImplValueIfPresent<"BaseChildlessCodeObj">(
          state,
          pendingUpdate.sectionId,
          pendingUpdate.paramInfoId,
          {
            value: pendingUpdate.value,
          },
        );
      },
      send: (frontendOpId) => {
        const payload = {
          projectConfigId: pendingUpdate.projectConfigId,
          sectionId: pendingUpdate.sectionId,
          paramInfoId: pendingUpdate.paramInfoId,
          value: pendingUpdate.value,
          frontendOpId,
        };
        logParamValueUpdateEvent("apply.send.optimistic", {
          key,
          payload,
          source: pendingUpdate.source,
        });
        const promise = route_set_param_entered_value(payload);
        updatePromise = promise;
        return promise;
      },
      debugSource: `param-value:${pendingUpdate.source}:debounce_flush`,
    });
  } else {
    const payload = {
      projectConfigId: pendingUpdate.projectConfigId,
      sectionId: pendingUpdate.sectionId,
      paramInfoId: pendingUpdate.paramInfoId,
      value: pendingUpdate.value,
    };
    logParamValueUpdateEvent("apply.send.direct", {
      key,
      payload,
      source: pendingUpdate.source,
    });
    updatePromise = route_set_param_entered_value(payload);
  }

  if (updatePromise === null) {
    return;
  }
  const settledPromise = updatePromise.then((response) => {
    logParamValueUpdateEvent("apply.response", {
      key,
      status: response.status,
      hasResponse: response.hasResponse,
    });
    if (pendingUpdate.onResponse) {
      pendingUpdate.onResponse(response);
    }
    return response;
  });
  inFlightPromiseByKey.set(key, settledPromise);
  void settledPromise.finally(() => {
    if (inFlightPromiseByKey.get(key) === settledPromise) {
      inFlightPromiseByKey.delete(key);
    }
  });
}

function getOrCreateDebouncer(key: string): DebouncedParamUpdate {
  const existingDebouncer = debouncerByKey.get(key);
  if (existingDebouncer) {
    return existingDebouncer;
  }
  const debouncer = _.debounce(() => {
    applyPendingParamUpdate(key);
  }, 50);
  debouncerByKey.set(key, debouncer);
  return debouncer;
}

function queuePendingParamUpdate(update: PendingParamEnteredValueUpdate): void {
  const key = buildPendingUpdateKey(update);
  pendingUpdateByKey.set(key, update);
  logParamValueUpdateEvent("queue", {
    key,
    mode: update.mode,
    projectConfigId: update.projectConfigId,
    sectionId: update.sectionId,
    paramInfoId: update.paramInfoId,
    source: update.source,
    value: update.value,
  });
  getOrCreateDebouncer(key)();
}

export function queueOptimisticParamEnteredValueUpdate(
  sectionId: string,
  paramInfoId: string,
  value: string,
  source = "unknown",
): void {
  queuePendingParamUpdate({
    mode: "optimistic",
    projectConfigId: getCurrProjectConfigId(),
    sectionId,
    paramInfoId,
    value,
    source,
  });
}

export function queueDirectParamEnteredValueUpdate(
  projectConfigId: string,
  sectionId: string,
  paramInfoId: string,
  value: string,
  source = "unknown",
  onResponse?: (response: ResponseDataAndStatus<null>) => void,
): void {
  queuePendingParamUpdate({
    mode: "direct",
    projectConfigId,
    sectionId,
    paramInfoId,
    value,
    source,
    onResponse,
  });
}

export async function flushPendingParamEnteredValueUpdates(): Promise<void> {
  logParamValueUpdateEvent("flush.start", {
    pendingCount: pendingUpdateByKey.size,
    inFlightCount: inFlightPromiseByKey.size,
  });
  while (pendingUpdateByKey.size > 0 || inFlightPromiseByKey.size > 0) {
    for (const debouncer of debouncerByKey.values()) {
      debouncer.flush();
    }
    const pendingPromises = [...inFlightPromiseByKey.values()];
    if (pendingPromises.length === 0) {
      break;
    }
    await Promise.all(pendingPromises);
  }
  logParamValueUpdateEvent("flush.end", {
    pendingCount: pendingUpdateByKey.size,
    inFlightCount: inFlightPromiseByKey.size,
  });
}

export function resetParamEnteredValueUpdatesForTests(): void {
  for (const debouncer of debouncerByKey.values()) {
    debouncer.cancel();
  }
  pendingUpdateByKey.clear();
  debouncerByKey.clear();
  inFlightPromiseByKey.clear();
}
