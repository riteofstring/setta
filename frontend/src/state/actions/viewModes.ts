import {
  callOpenAPI,
  res200,
  type ResponseDataAndStatus,
} from "@setta/app-subsystem-frontend-sdk";
import {
  deleteViewMode as deleteViewModeRequest,
  setActiveViewMode,
  setViewModeSortOrder,
} from "openapi/http";
import { publishProjectConfigSnapshot } from "state/actions/projectConfigSnapshots";
import { dispatchOptimisticProjectStateUpdate } from "state/actions/sectionInfos";
import { useProjectState, type ZustandProjectState } from "state/definitions";
import { createProjectConfig } from "utils/generatedTypes";
type ProjectConfigMutationPayload = {
  projectConfig: ZustandProjectState["projectConfig"];
};
type ProjectConfigMutationRouteResponse =
  ResponseDataAndStatus<ProjectConfigMutationPayload>;
type ProjectTopLevelSectionLayouts =
  ZustandProjectState["projectConfig"]["topLevelSections"];
type ProjectViewport = ZustandProjectState["projectConfig"]["viewport"];
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
      callOpenAPI(
        setViewModeSortOrder({
          body: {
            projectConfigId: nextProjectConfigId,
            orderedViewModeIds,
            frontendOpId,
          },
        } as Parameters<typeof setViewModeSortOrder>[0]),
      ),
  });
}

export function persistActiveViewMode(
  projectConfigId: string,
  activeViewModeId: string,
): void {
  dispatchOptimisticViewModeMutation({
    apply: (state) => applyOptimisticActiveViewMode(state, activeViewModeId),
    projectConfigId,
    send: ({ frontendOpId, projectConfigId: nextProjectConfigId }) =>
      callOpenAPI(
        setActiveViewMode({
          body: {
            projectConfigId: nextProjectConfigId,
            activeViewModeId,
            frontendOpId,
          },
        } as Parameters<typeof setActiveViewMode>[0]),
      ),
  });
}

function applyOptimisticActiveViewMode(
  state: ZustandProjectState,
  activeViewModeId: string,
): void {
  const projectConfig = state.projectConfig;
  const currentViewModeId = projectConfig.activeViewModeId;
  const nextViewMode = projectConfig.viewModes[activeViewModeId];
  if (!nextViewMode) {
    throw new Error(`Active view mode ${activeViewModeId} not found.`);
  }
  if (currentViewModeId) {
    const currentViewMode = projectConfig.viewModes[currentViewModeId];
    if (currentViewMode) {
      currentViewMode.topLevelSections = cloneProjectTopLevelSectionLayouts(
        projectConfig.topLevelSections,
      );
      currentViewMode.viewport = cloneProjectViewport(projectConfig.viewport);
      currentViewMode.viewportInitialized = projectConfig.viewportInitialized;
    }
  }

  // Latency path for tab selection: mirror Go Project.SetActiveViewMode so the
  // backend acknowledgement usually does not force a second GPU scene rebuild.
  let nextLayouts = cloneProjectTopLevelSectionLayouts(
    nextViewMode.topLevelSections,
  );
  if (Object.keys(nextLayouts).length === 0) {
    nextLayouts = cloneProjectTopLevelSectionLayouts(
      projectConfig.topLevelSections,
    );
    nextViewMode.topLevelSections =
      cloneProjectTopLevelSectionLayouts(nextLayouts);
  }
  projectConfig.topLevelSections =
    cloneProjectTopLevelSectionLayouts(nextLayouts);
  projectConfig.viewport = cloneProjectViewport(nextViewMode.viewport ?? null);
  projectConfig.viewportInitialized = nextViewMode.viewportInitialized ?? false;
  projectConfig.activeViewModeId = activeViewModeId;
}

function cloneProjectTopLevelSectionLayouts(
  layouts: ProjectTopLevelSectionLayouts | undefined,
): ProjectTopLevelSectionLayouts {
  return Object.fromEntries(
    Object.entries(layouts ?? {}).map(([sectionId, layout]) => [
      sectionId,
      { ...layout },
    ]),
  );
}

function cloneProjectViewport(
  viewport: ProjectViewport | undefined,
): ProjectViewport {
  return viewport ? { ...viewport } : null;
}

export function deleteViewMode(
  projectConfigId: string,
  viewModeId: string,
): void {
  dispatchOptimisticViewModeMutation({
    apply: () => {},
    projectConfigId,
    send: ({ frontendOpId, projectConfigId: nextProjectConfigId }) =>
      callOpenAPI(
        deleteViewModeRequest({
          body: {
            projectConfigId: nextProjectConfigId,
            viewModeId,
            frontendOpId,
          },
        } as Parameters<typeof deleteViewModeRequest>[0]),
      ),
  });
}
