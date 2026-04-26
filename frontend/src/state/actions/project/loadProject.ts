import {
  callOpenAPI,
  res200,
  type ResponseDataAndStatus,
} from "@setta/app-subsystem-frontend-sdk";
import { useReactFlow } from "forks/xyflow/core/store";
import { setViewport as setGpuViewport } from "gpuFlow/viewportActions";
import {
  createProjectConfig as createProjectConfigRequest,
  getLatestLspDiagnostics,
  loadAllProjectMetadata as loadAllProjectMetadataRequest,
  loadProjectConfig as loadProjectConfigRequest,
} from "openapi/http";
import { unstable_batchedUpdates } from "react-dom";
import { useNavigate } from "react-router-dom";
import { cancelPendingActiveSectionIdsSync } from "state/actions/activeSections";
import { applyPendingNameValidationErrors } from "state/actions/nameValidation";
import {
  getHydratedActiveSectionUIState,
  sanitizeProjectStateActiveIds,
  useActiveSectionUI,
} from "state/activeSectionUI";
import {
  runWithAtomicallyPublishedProjectStores,
  useAllProjectMetadata,
  useLocalStorage,
  useNodeInternals,
  useProjectState,
} from "state/definitions";
import {
  PAGE_LOAD_TYPES,
  pathRelativeToProject,
  PROJECT_CONFIG_PREVIEW_IMG_COLORS,
} from "utils/constants";
import {
  OverviewTabUIConfig,
  type AllProjectMetadata,
  type LSPDiagnosticsPayload,
  type SingleConfig,
} from "utils/generatedTypes";
import { requestAIFollowSnapshot } from "../aiFollow";
import { fetchListenerCoverageSnapshot } from "../listenerCoverage";
import { processLspDiagnostics } from "../lspDiagnostics";
import { recordAuthoritativeProjectChatWindowingState } from "../projectChatWindowingAuthoritative";
import {
  clearProjectChatGitGraphEmbeddedPaneVisibilityForOtherProjects,
  reconcileProjectChatWindowingEphemeralState,
} from "../projectChatWindowingEphemeral";
import { createNodesMapFromProjectConfigChildren } from "../sectionInfos";
import { initializeServerMode } from "../serverMode";
type LoadProjectConfigRouteResponse = ResponseDataAndStatus<SingleConfig>;
type LatestLspDiagnosticsRouteResponse =
  ResponseDataAndStatus<LSPDiagnosticsPayload>;
type LoadAllProjectMetadataRouteResponse =
  ResponseDataAndStatus<AllProjectMetadata>;
type CreateProjectConfigRouteResponse = ResponseDataAndStatus<string>;
type LoadProjectStateInput = SingleConfig | Partial<SingleConfig>;
export async function loadProjectConfig({ projectConfigName }) {
  const res = (await callOpenAPI(
    loadProjectConfigRequest({
      body: {
        projectConfigName,
      },
    } as Parameters<typeof loadProjectConfigRequest>[0]),
  )) as LoadProjectConfigRouteResponse;
  if (res200(res)) {
    const loadedProjectState = validateLoadedProjectState(res.data);
    const loaded = await loadProjectState(loadedProjectState);
    if (loaded) {
      const diagnosticsRes = (await callOpenAPI(
        getLatestLspDiagnostics({
          body: {
            projectConfigId: loadedProjectState.projectConfig.id,
          },
        } as Parameters<typeof getLatestLspDiagnostics>[0]),
      )) as LatestLspDiagnosticsRouteResponse;
      if (res200(diagnosticsRes)) {
        processLspDiagnostics(diagnosticsRes.data);
      }
      await requestAIFollowSnapshot(loadedProjectState.projectConfig.id);
      await fetchListenerCoverageSnapshot(loadedProjectState.projectConfig.id);
    }
    return loaded;
  } else {
    return false;
  }
}
function validateLoadedProjectState(
  projectState: LoadProjectStateInput,
): SingleConfig {
  const projectConfig = projectState.projectConfig;
  if (!projectConfig) {
    throw new Error("Loaded project state is missing projectConfig.");
  }
  if (projectConfig.windowSpaces === undefined) {
    throw new Error(
      "Loaded project state is missing projectConfig.windowSpaces.",
    );
  }
  if (projectState.projectChatWindowing === undefined) {
    throw new Error("Loaded project state is missing projectChatWindowing.");
  }
  return projectState as SingleConfig;
}
export async function loadProjectState(projectState: LoadProjectStateInput) {
  const normalizedProjectState = validateLoadedProjectState(projectState);
  const { viewport, viewportInitialized } =
    normalizedProjectState.projectConfig;
  cancelPendingActiveSectionIdsSync();
  if (!viewport || !viewportInitialized) {
    useReactFlow.setState({ fitViewOnInit: true, fitViewOnInitDone: false });
  } else {
    const { x, y, zoom } = viewport;
    setGpuViewport({ x, y, zoom });
    useReactFlow.setState({
      fitViewOnInit: false,
      fitViewOnInitDone: true,
      transform: [x, y, zoom],
    });
  }
  const nextProjectState = {
    ...sanitizeProjectStateActiveIds(normalizedProjectState),
    previewSectionVariantMap: {},
  };
  clearProjectChatGitGraphEmbeddedPaneVisibilityForOtherProjects(
    nextProjectState.projectConfig.id,
  );
  recordAuthoritativeProjectChatWindowingState(
    nextProjectState.projectConfig.id,
    nextProjectState.projectChatWindowing,
  );
  reconcileProjectChatWindowingEphemeralState(
    nextProjectState.projectChatWindowing,
    nextProjectState.projectConfig.id,
  );
  const nextActiveSectionUIState = getHydratedActiveSectionUIState(
    normalizedProjectState.projectConfig.activeIds,
  );
  const nextNodesMap = createNodesMapFromProjectConfigChildren(
    nextProjectState,
    useNodeInternals.getState().x,
  );
  runWithAtomicallyPublishedProjectStores(
    {
      projectState: nextProjectState,
      nodeInternals: { x: nextNodesMap },
      activeSectionUI: nextActiveSectionUIState,
    },
    () => {
      unstable_batchedUpdates(() => {
        useProjectState.setState(nextProjectState);
        useNodeInternals.setState({ x: nextNodesMap });
        if (nextActiveSectionUIState !== null) {
          useActiveSectionUI.setState(nextActiveSectionUIState);
        }
      });
    },
  );
  applyPendingNameValidationErrors(normalizedProjectState.projectConfig.id);
  return true;
}
export function useCreateAndGoToProjectConfig() {
  const navigateToAnotherConfig = useNavigateToAnotherConfig();
  return async () => {
    const previewImgColor = getRandomProjectConfigPreviewImgColor();
    if (!previewImgColor) {
      throw new Error();
    }
    const res = (await callOpenAPI(
      createProjectConfigRequest({
        body: {
          previewImgColor,
        },
      } as Parameters<typeof createProjectConfigRequest>[0]),
    )) as CreateProjectConfigRouteResponse;
    if (res200(res)) {
      useLocalStorage.setState({
        overviewTab: OverviewTabUIConfig.names.ProjectAIChat,
      });
      navigateToAnotherConfig(res.data);
    }
  };
}
function getRandomProjectConfigPreviewImgColor() {
  const randomIndex = Math.floor(
    Math.random() * PROJECT_CONFIG_PREVIEW_IMG_COLORS.length,
  );
  return PROJECT_CONFIG_PREVIEW_IMG_COLORS[randomIndex];
}
export function useNavigateToAnotherConfig() {
  const navigate = useNavigate();
  return (projectConfigName: string) => {
    navigate(pathRelativeToProject(projectConfigName), {
      state: { pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG },
    });
  };
}
export async function loadAllProjectMetadata(): Promise<boolean> {
  const mode = await initializeServerMode();
  if (mode !== "ide") {
    return false;
  }
  const res = (await callOpenAPI(
    loadAllProjectMetadataRequest(),
  )) as LoadAllProjectMetadataRouteResponse;
  if (res200(res)) {
    useAllProjectMetadata.setState({
      defaultProjectConfigId: res.data.defaultProjectConfigId,
      projectMetadata: res.data.projectMetadata ?? [],
    });
    return true;
  }
  return false;
}
