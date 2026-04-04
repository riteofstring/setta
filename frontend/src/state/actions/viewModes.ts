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
        state.projectConfig = acknowledgedProjectConfig;
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
        acknowledgedProjectConfig = response.data.projectConfig;
        publishProjectConfigSnapshot(
          projectConfigId,
          response.data.projectConfig,
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
