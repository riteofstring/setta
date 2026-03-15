import { getViewport } from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import { getActiveSectionUIIds } from "state/activeSectionUI";
import { NULL_PROJECT_CONFIG_ID, useProjectState } from "state/definitions";
import {
  useAllProjectMetadata,
  useShareSession,
} from "state/stores/sessionStores";
import {
  route_delete_sections,
  route_group_sections,
  route_set_viewport,
  route_toggle_param_selected,
  route_ungroup_groups,
  route_unselect_all_params,
} from "utils/generatedEndpoints";
import {
  AllProjectMetadata,
  isBaseSectionWithParamsImpl,
  Viewport,
} from "utils/generatedTypes";
import { applyActiveSectionChange } from "./activeSectionController";
import { dispatchOptimisticProjectStateUpdate } from "./projectStateOptimisticUpdates";
import { setCurrEffectiveSectionImplValue } from "./sectionEffectiveImplMutations";
import {
  getCurrEffectiveSectionImpl,
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrProjectConfigId,
} from "./sectionEffectiveImplSelectors";

export function deleteAllActiveSections() {
  const shareSession = useShareSession.getState();
  if (shareSession.isDeploymentMode) {
    return;
  }
  route_delete_sections({
    projectConfigId: getCurrProjectConfigId(),
    sectionIds: getActiveSectionUIIds(),
  });
}

export async function groupActiveSections() {
  const shareSession = useShareSession.getState();
  if (shareSession.isDeploymentMode) {
    return;
  }
  const sectionIds = getActiveSectionUIIds();
  route_group_sections({
    projectConfigId: getCurrProjectConfigId(),
    sectionIds,
  });
  useReactFlow.setState({ nodesSelectionDims: null });
}

export async function ungroupActiveGroups() {
  const shareSession = useShareSession.getState();
  if (shareSession.isDeploymentMode) {
    return;
  }
  const groupIds = getActiveSectionUIIds();
  route_ungroup_groups({ projectConfigId: getCurrProjectConfigId(), groupIds });
}

export function toggleParamSelected(sectionId: string, paramInfoId: string) {
  const currentState = useProjectState.getState();
  const impl = getCurrEffectiveSectionImplWithTypeGuard(
    currentState,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
  const wasSelected = impl.selectedParams.includes(paramInfoId);
  const nextSelectedCount = wasSelected
    ? impl.selectedParams.length - 1
    : impl.selectedParams.length + 1;
  const hasSelectedParams = nextSelectedCount > 0;

  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      setCurrEffectiveSectionImplValue<"BaseSectionWithParams">(
        state,
        sectionId,
        {
          selectedParams: (curr) => {
            if (curr?.includes(paramInfoId)) {
              return curr.filter((id) => id !== paramInfoId);
            }
            return [...(curr ?? []), paramInfoId];
          },
        },
      );
    },
    send: (frontendOpId) =>
      route_toggle_param_selected({
        projectConfigId: getCurrProjectConfigId(),
        sectionId,
        paramInfoId,
        frontendOpId,
      }),
  });

  applyActiveSectionChange({
    interaction: wasSelected ? "param-unselect" : "param-select",
    sectionId,
    hasSelectedParams,
  });
}

export function unselectAllParams() {
  const currentState = useProjectState.getState();
  const sectionIds = Object.keys(currentState.sections);
  const hasSelectedParams = sectionIds.some((sectionId) => {
    const impl = getCurrEffectiveSectionImpl(currentState, sectionId);
    return (
      isBaseSectionWithParamsImpl(impl) &&
      (impl.selectedParams?.length ?? 0) > 0
    );
  });

  if (!hasSelectedParams) {
    return false;
  }

  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      for (const sectionId of Object.keys(state.sections)) {
        const impl = getCurrEffectiveSectionImpl(state, sectionId);
        if (
          isBaseSectionWithParamsImpl(impl) &&
          impl.selectedParams.length > 0
        ) {
          setCurrEffectiveSectionImplValue<"BaseSectionWithParams">(
            state,
            sectionId,
            { selectedParams: [] },
          );
        }
      }
    },
    send: (frontendOpId) =>
      route_unselect_all_params({
        projectConfigId: getCurrProjectConfigId(),
        frontendOpId,
      }),
  });

  return true;
}

export function updateAllProjectMetadata(metadata: AllProjectMetadata) {
  useAllProjectMetadata.setState(metadata);
}

function getCurrProjectConfigViewport() {
  return useReactFlow.getState().fitViewOnInit ? null : getViewport();
}

function dispatchViewportUpdate(viewport: Viewport | null) {
  const projectConfigId = getCurrProjectConfigId();
  if (projectConfigId === NULL_PROJECT_CONFIG_ID) {
    return;
  }
  if (_.isEqual(useProjectState.getState().projectConfig.viewport, viewport)) {
    return;
  }
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      state.projectConfig.viewport = viewport;
      state.projectConfig.viewportInitialized = viewport !== null;
    },
    send: (frontendOpId) =>
      route_set_viewport({
        projectConfigId,
        viewport,
        frontendOpId,
      }),
  });
}

export const debouncedDispatchViewportUpdate = _.debounce(
  () => dispatchViewportUpdate(getCurrProjectConfigViewport()),
  1000,
);
