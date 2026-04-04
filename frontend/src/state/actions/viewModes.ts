import { publishProjectConfigSnapshot } from "state/actions/projectConfigSnapshots";
import { dispatchOptimisticProjectStateUpdate } from "state/actions/sectionInfos";
import { useProjectState, type ZustandProjectState } from "state/definitions";
import { res200, type ResponseDataAndStatus } from "utils/endpointUtils";
import {
  route_delete_view_mode,
  route_set_view_mode_sort_order,
} from "utils/generatedEndpoints";
import { createProjectConfig } from "utils/generatedTypes";

type ProjectConfigMutationPayload = {
  projectConfig: ZustandProjectState["projectConfig"];
};

type ProjectConfigMutationRouteResponse =
  ResponseDataAndStatus<ProjectConfigMutationPayload>;

function applyAcknowledgedViewModeProjectConfig(
  state: ZustandProjectState,
  acknowledgedProjectConfig: ZustandProjectState["projectConfig"],
): void {
  const snapshot = createProjectConfig(acknowledgedProjectConfig);
  state.projectConfig.viewModes = snapshot.viewModes;
  state.projectConfig.activeViewModeId = snapshot.activeViewModeId;
  state.projectConfig.isEditingViewMode = snapshot.isEditingViewMode;
  state.projectConfig.topLevelSections = snapshot.topLevelSections;
  state.projectConfig.viewport = snapshot.viewport;
  state.projectConfig.viewportInitialized = snapshot.viewportInitialized;
}

function dispatchOptimisticViewModeMutation({
  apply,
  projectConfigId,
  send,
}: {
  apply: (state: ZustandProjectState) => void;
  projectConfigId: string;
  send: (args: {
    frontendOpId: string;
    projectConfigId: string;
  }) =>
    | ProjectConfigMutationRouteResponse
    | Promise<ProjectConfigMutationRouteResponse>;
}) {
  const previousProjectConfig = createProjectConfig(
    useProjectState.getState().projectConfig,
  );
  let acknowledgedProjectConfig: ZustandProjectState["projectConfig"] | null =
    null;
  dispatchOptimisticProjectStateUpdate({
    projectConfigId,
    apply,
    reapply: (state) => {
      if (acknowledgedProjectConfig) {
        applyAcknowledgedViewModeProjectConfig(
          state,
          acknowledgedProjectConfig,
        );
        return;
      }
      apply(state);
    },
    rollback: (state) => {
      state.projectConfig = createProjectConfig(previousProjectConfig);
    },
    send: async (frontendOpId) => {
      const response = await send({
        frontendOpId,
        projectConfigId,
      });
      if (res200(response)) {
        acknowledgedProjectConfig = createProjectConfig(
          response.data.projectConfig,
        );
        publishProjectConfigSnapshot(
          projectConfigId,
          createProjectConfig(acknowledgedProjectConfig),
        );
      }
      return response;
    },
  });
}

export function persistViewModeSortOrder(
  projectConfigId: string,
  orderedViewModeIds: Array<string>,
): void {
  dispatchOptimisticViewModeMutation({
    apply: () => {},
    projectConfigId,
    send: ({ frontendOpId, projectConfigId: nextProjectConfigId }) =>
      route_set_view_mode_sort_order({
        projectConfigId: nextProjectConfigId,
        orderedViewModeIds,
        frontendOpId,
      }),
  });
}

export function deleteViewMode(
  projectConfigId: string,
  viewModeId: string,
): void {
  dispatchOptimisticViewModeMutation({
    apply: () => {},
    projectConfigId,
    send: ({ frontendOpId, projectConfigId: nextProjectConfigId }) =>
      route_delete_view_mode({
        projectConfigId: nextProjectConfigId,
        viewModeId,
        frontendOpId,
      }),
  });
}
