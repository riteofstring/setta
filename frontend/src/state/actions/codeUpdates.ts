import _ from "lodash";
import { useProjectState } from "state/definitions";
import { getPythonCodegenTarget } from "utils/codegenTargets";
import { res200, type ResponseDataAndStatus } from "utils/endpointUtils";
import {
  route_get_latest_project_state,
  route_set_code,
  route_set_gen_code_prefix,
  route_set_gen_code_suffix,
} from "utils/generatedEndpoints";
import {
  CodeLanguageEnum,
  type ProjectStateSingleConfigWithCompletedOpIds,
  SectionTypeEnum,
} from "utils/generatedTypes";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplIfPresent,
  getCurrProjectConfigId,
  processProjectStateUpdateFromBackend,
  setCurrEffectiveSectionImplValue,
} from "./sectionInfos";

type PendingCodeUpdate = {
  sectionId: string;
  code: string;
};

type LatestProjectStateRouteResponse =
  ResponseDataAndStatus<ProjectStateSingleConfigWithCompletedOpIds>;
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
  const shouldRefreshProjectState =
    shouldRefreshProjectStateAfterCodeUpdate(sectionId);
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      setCurrEffectiveSectionImplValue<"CodeSection">(state, sectionId, {
        code,
      });
    },
    send: (frontendOpId) => {
      const promise = route_set_code({
        projectConfigId,
        sectionId,
        code,
        frontendOpId,
      }).then(async (response: ProjectCodeMutationRouteResponse) => {
        if (!shouldRefreshProjectState || !res200(response)) {
          return response;
        }

        const latestProjectStateResponse: LatestProjectStateRouteResponse =
          await route_get_latest_project_state({
            projectConfigId,
          });
        if (res200(latestProjectStateResponse)) {
          processProjectStateUpdateFromBackend(latestProjectStateResponse.data);
        }
        return response;
      });
      lastCodeUpdatePromise = promise;
      return promise;
    },
  });
}

function shouldRefreshProjectStateAfterCodeUpdate(sectionId: string): boolean {
  const state = useProjectState.getState();
  if (!state.projectConfig.watchCodeEnabled) {
    return false;
  }
  if (!getPythonCodegenTarget(state.projectConfig)) {
    return false;
  }

  const sectionImpl = getCurrEffectiveSectionImplIfPresent(state, sectionId);
  if (!sectionImpl || sectionImpl.type !== SectionTypeEnum.Code) {
    return false;
  }
  if (sectionImpl.codeLanguage !== CodeLanguageEnum.python) {
    return false;
  }
  return sectionImpl.codeFileBinding !== null;
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
      const promise: Promise<ProjectCodeMutationRouteResponse> =
        route_set_gen_code_prefix({
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
      const promise: Promise<ProjectCodeMutationRouteResponse> =
        route_set_gen_code_suffix({
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
