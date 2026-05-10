import {
  callOpenAPI,
  type ResponseDataAndStatus,
} from "@setta/app-subsystem-frontend-sdk";
import _ from "lodash";
import { setCode, setGenCodePrefix, setGenCodeSuffix } from "openapi/http";
import { getPythonCodegenTarget } from "utils/codegenTargets";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "./sectionInfos";
type PendingCodeUpdate = {
  sectionId: string;
  code: string;
};
type ProjectCodeMutationRouteResponse = ResponseDataAndStatus<null>;
let pendingCodeUpdate: PendingCodeUpdate | null = null;
let pendingGenCodePrefix: string | null = null;
let pendingGenCodeSuffix: string | null = null;
let lastCodeUpdatePromise: Promise<ProjectCodeMutationRouteResponse> | null =
  null;
let lastCodeUpdateSectionId: string | null = null;
let lastGenCodePrefixPromise: Promise<ProjectCodeMutationRouteResponse> | null =
  null;
let lastGenCodeSuffixPromise: Promise<ProjectCodeMutationRouteResponse> | null =
  null;
function applyCodeUpdate(sectionId: string, code: string) {
  pendingCodeUpdate = null;
  lastCodeUpdateSectionId = sectionId;
  const projectConfigId = getCurrProjectConfigId();
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      setCurrEffectiveSectionImplValue<"CodeSection">(state, sectionId, {
        code,
      });
    },
    send: (frontendOpId) => {
      const promise = callOpenAPI(
        setCode({
          body: {
            projectConfigId,
            sectionId,
            code,
            frontendOpId,
          },
        } as Parameters<typeof setCode>[0]),
      );
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
      const promise = callOpenAPI(
        setGenCodePrefix({
          body: {
            projectConfigId: getCurrProjectConfigId(),
            genCodePrefix: value,
            frontendOpId,
          },
        } as Parameters<typeof setGenCodePrefix>[0]),
      ) as Promise<ProjectCodeMutationRouteResponse>;
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
      const promise = callOpenAPI(
        setGenCodeSuffix({
          body: {
            projectConfigId: getCurrProjectConfigId(),
            genCodeSuffix: value,
            frontendOpId,
          },
        } as Parameters<typeof setGenCodeSuffix>[0]),
      ) as Promise<ProjectCodeMutationRouteResponse>;
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
