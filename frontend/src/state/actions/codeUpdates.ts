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

function applyCodeUpdate(sectionId: string, code: string) {
  pendingCodeUpdate = null;
  lastCodeUpdateSectionId = sectionId;
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      setCurrEffectiveSectionImplValue<"CodeSection">(state, sectionId, {
        code,
      });
    },
    send: (frontendOpId) => {
      const promise = route_set_code({
        projectConfigId: getCurrProjectConfigId(),
        sectionId,
        code,
        frontendOpId,
      });
      lastCodeUpdatePromise = promise;
      return promise;
    },
  });
}

function applyGenCodePrefixUpdate(value: string) {
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
      const promise = route_set_gen_code_prefix({
        projectConfigId: getCurrProjectConfigId(),
        genCodePrefix: value,
        frontendOpId,
      });
      lastGenCodePrefixPromise = promise;
      return promise;
    },
  });
}

function applyGenCodeSuffixUpdate(value: string) {
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
      const promise = route_set_gen_code_suffix({
        projectConfigId: getCurrProjectConfigId(),
        genCodeSuffix: value,
        frontendOpId,
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
  pendingCodeUpdate = { sectionId, code };
  debouncedSetCode(sectionId, code);
}

export function queueGenCodePrefixUpdate(value: string) {
  pendingGenCodePrefix = value;
  debouncedSetGenCodePrefix(value);
}

export function queueGenCodeSuffixUpdate(value: string) {
  pendingGenCodeSuffix = value;
  debouncedSetGenCodeSuffix(value);
}

export async function flushPendingCodeUpdate(sectionId: string): Promise<void> {
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
}

export async function flushPendingGenCodeUpdates(): Promise<void> {
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
}
