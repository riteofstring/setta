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
  source: string;
};

type PendingTextValueUpdate = {
  value: string;
  source: string;
};

let pendingCodeUpdate: PendingCodeUpdate | null = null;
let pendingGenCodePrefix: PendingTextValueUpdate | null = null;
let pendingGenCodeSuffix: PendingTextValueUpdate | null = null;
let lastCodeUpdatePromise: Promise<unknown> | null = null;
let lastCodeUpdateSectionId: string | null = null;
let lastGenCodePrefixPromise: Promise<unknown> | null = null;
let lastGenCodeSuffixPromise: Promise<unknown> | null = null;

function logCodeUpdateEvent(event: string, payload: unknown): void {
  console.log(`[code-updates-debug] ${event} ${JSON.stringify(payload)}`);
}

function applyCodeUpdate(sectionId: string, code: string, source: string) {
  logCodeUpdateEvent("applyCodeUpdate.start", {
    sectionId,
    code,
    source,
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
    debugSource: `code-updates:${source}:debounce_flush`,
  });
}

function applyGenCodePrefixUpdate(value: string, source: string) {
  logCodeUpdateEvent("applyGenCodePrefixUpdate.start", {
    value,
    source,
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
    debugSource: `gen-code-prefix:${source}:debounce_flush`,
  });
}

function applyGenCodeSuffixUpdate(value: string, source: string) {
  logCodeUpdateEvent("applyGenCodeSuffixUpdate.start", {
    value,
    source,
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
    debugSource: `gen-code-suffix:${source}:debounce_flush`,
  });
}

const debouncedSetCode = _.debounce(applyCodeUpdate, 200);
const debouncedSetGenCodePrefix = _.debounce(applyGenCodePrefixUpdate, 50);
const debouncedSetGenCodeSuffix = _.debounce(applyGenCodeSuffixUpdate, 50);

export function queueCodeUpdate(
  sectionId: string,
  code: string,
  source = "unknown",
) {
  logCodeUpdateEvent("queueCodeUpdate", {
    sectionId,
    code,
    source,
  });
  pendingCodeUpdate = { sectionId, code, source };
  debouncedSetCode(sectionId, code, source);
}

export function queueGenCodePrefixUpdate(value: string, source = "unknown") {
  logCodeUpdateEvent("queueGenCodePrefixUpdate", {
    value,
    source,
  });
  pendingGenCodePrefix = {
    value,
    source,
  };
  debouncedSetGenCodePrefix(value, source);
}

export function queueGenCodeSuffixUpdate(value: string, source = "unknown") {
  logCodeUpdateEvent("queueGenCodeSuffixUpdate", {
    value,
    source,
  });
  pendingGenCodeSuffix = {
    value,
    source,
  };
  debouncedSetGenCodeSuffix(value, source);
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
    logCodeUpdateEvent("flushPendingGenCodeUpdates.flushPrefixDebounce", {
      pendingGenCodePrefix,
    });
    debouncedSetGenCodePrefix.flush();
  }
  if (lastGenCodePrefixPromise) {
    pendingPromises.push(lastGenCodePrefixPromise);
  }
  if (pendingGenCodeSuffix !== null) {
    logCodeUpdateEvent("flushPendingGenCodeUpdates.flushSuffixDebounce", {
      pendingGenCodeSuffix,
    });
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
