import _ from "lodash";
import { getPythonCodegenTarget } from "utils/codegenTargets";
import {
  route_set_code,
  route_set_gen_code_prefix,
  route_set_gen_code_suffix,
} from "utils/generatedEndpoints";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "./sectionInfos";

type PendingCodeUpdate = {
  sectionId: string;
  code: string;
};

let pendingCodeUpdate: PendingCodeUpdate | null = null;
let pendingGenCodePrefix: string | null = null;
let pendingGenCodeSuffix: string | null = null;
let lastCodeUpdatePromise: Promise<unknown> | null = null;
let lastCodeUpdateSectionId: string | null = null;
let lastGenCodePrefixPromise: Promise<unknown> | null = null;
let lastGenCodeSuffixPromise: Promise<unknown> | null = null;

function logCodeUpdateEvent(event: string, payload: unknown): void {
  console.log(`[code-updates-debug] ${event} ${JSON.stringify(payload)}`);
}

function applyCodeUpdate(sectionId: string, code: string) {
  logCodeUpdateEvent("applyCodeUpdate.start", {
    sectionId,
    code,
  });
  pendingCodeUpdate = null;
  lastCodeUpdateSectionId = sectionId;
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      setCurrEffectiveSectionImplValue<"CodeSection">(state, sectionId, {
        code,
      });
    },
    send: (frontendOpId) => {
      const payload = {
        projectConfigId: getCurrProjectConfigId(),
        sectionId,
        code,
        frontendOpId,
      };
      logCodeUpdateEvent("applyCodeUpdate.send", payload);
      const promise = route_set_code(payload);
      void Promise.resolve(promise).then((response) => {
        logCodeUpdateEvent("applyCodeUpdate.response", {
          payload,
          response,
        });
      });
      lastCodeUpdatePromise = promise;
      return promise;
    },
  });
}

function applyGenCodePrefixUpdate(value: string) {
  logCodeUpdateEvent("applyGenCodePrefixUpdate.start", {
    value,
  });
  pendingGenCodePrefix = null;
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      const pythonTarget = getPythonCodegenTarget(state.projectConfig);
      if (!pythonTarget) {
        return;
      }
      pythonTarget.genCodePrefix = value;
    },
    send: (frontendOpId) => {
      const payload = {
        projectConfigId: getCurrProjectConfigId(),
        genCodePrefix: value,
        frontendOpId,
      };
      logCodeUpdateEvent("applyGenCodePrefixUpdate.send", payload);
      const promise = route_set_gen_code_prefix(payload);
      void Promise.resolve(promise).then((response) => {
        logCodeUpdateEvent("applyGenCodePrefixUpdate.response", {
          payload,
          response,
        });
      });
      lastGenCodePrefixPromise = promise;
      return promise;
    },
  });
}

function applyGenCodeSuffixUpdate(value: string) {
  logCodeUpdateEvent("applyGenCodeSuffixUpdate.start", {
    value,
  });
  pendingGenCodeSuffix = null;
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      const pythonTarget = getPythonCodegenTarget(state.projectConfig);
      if (!pythonTarget) {
        return;
      }
      pythonTarget.genCodeSuffix = value;
    },
    send: (frontendOpId) => {
      const payload = {
        projectConfigId: getCurrProjectConfigId(),
        genCodeSuffix: value,
        frontendOpId,
      };
      logCodeUpdateEvent("applyGenCodeSuffixUpdate.send", payload);
      const promise = route_set_gen_code_suffix(payload);
      void Promise.resolve(promise).then((response) => {
        logCodeUpdateEvent("applyGenCodeSuffixUpdate.response", {
          payload,
          response,
        });
      });
      lastGenCodeSuffixPromise = promise;
      return promise;
    },
  });
}

const debouncedSetCode = _.debounce(applyCodeUpdate, 200);
const debouncedSetGenCodePrefix = _.debounce(applyGenCodePrefixUpdate, 50);
const debouncedSetGenCodeSuffix = _.debounce(applyGenCodeSuffixUpdate, 50);

export function queueCodeUpdate(sectionId: string, code: string) {
  logCodeUpdateEvent("queueCodeUpdate", {
    sectionId,
    code,
  });
  pendingCodeUpdate = { sectionId, code };
  debouncedSetCode(sectionId, code);
}

export function queueGenCodePrefixUpdate(value: string) {
  logCodeUpdateEvent("queueGenCodePrefixUpdate", {
    value,
  });
  pendingGenCodePrefix = value;
  debouncedSetGenCodePrefix(value);
}

export function queueGenCodeSuffixUpdate(value: string) {
  logCodeUpdateEvent("queueGenCodeSuffixUpdate", {
    value,
  });
  pendingGenCodeSuffix = value;
  debouncedSetGenCodeSuffix(value);
}

export async function flushPendingCodeUpdate(sectionId: string): Promise<void> {
  logCodeUpdateEvent("flushPendingCodeUpdate.start", {
    sectionId,
    pendingCodeUpdate,
    lastCodeUpdateSectionId,
  });
  const hasPending =
    pendingCodeUpdate !== null && pendingCodeUpdate.sectionId === sectionId;
  if (hasPending) {
    debouncedSetCode.flush();
  }
  if (lastCodeUpdateSectionId !== sectionId) {
    return;
  }
  if (lastCodeUpdatePromise) {
    await lastCodeUpdatePromise;
  }
  logCodeUpdateEvent("flushPendingCodeUpdate.end", {
    sectionId,
    pendingCodeUpdate,
    lastCodeUpdateSectionId,
  });
}

export async function flushPendingGenCodeUpdates(): Promise<void> {
  logCodeUpdateEvent("flushPendingGenCodeUpdates.start", {
    pendingGenCodePrefix,
    pendingGenCodeSuffix,
    hasLastGenCodePrefixPromise: lastGenCodePrefixPromise !== null,
    hasLastGenCodeSuffixPromise: lastGenCodeSuffixPromise !== null,
  });
  const pendingPromises: Array<Promise<unknown>> = [];
  if (pendingGenCodePrefix !== null) {
    debouncedSetGenCodePrefix.flush();
  }
  if (lastGenCodePrefixPromise) {
    pendingPromises.push(lastGenCodePrefixPromise);
  }
  if (pendingGenCodeSuffix !== null) {
    debouncedSetGenCodeSuffix.flush();
  }
  if (lastGenCodeSuffixPromise) {
    pendingPromises.push(lastGenCodeSuffixPromise);
  }
  if (pendingPromises.length > 0) {
    await Promise.all(pendingPromises);
  }
  logCodeUpdateEvent("flushPendingGenCodeUpdates.end", {
    pendingGenCodePrefix,
    pendingGenCodeSuffix,
    hasLastGenCodePrefixPromise: lastGenCodePrefixPromise !== null,
    hasLastGenCodeSuffixPromise: lastGenCodeSuffixPromise !== null,
  });
}
