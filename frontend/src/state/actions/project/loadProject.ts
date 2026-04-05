import { useReactFlow } from "forks/xyflow/core/store";
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
  OverviewTabNameEnum,
  PAGE_LOAD_TYPES,
  pathRelativeToProject,
  PROJECT_CONFIG_PREVIEW_IMG_COLORS,
} from "utils/constants";
import { res200, type ResponseDataAndStatus } from "utils/endpointUtils";
import {
  route_create_project_config,
  route_get_latest_lsp_diagnostics,
  route_load_all_project_metadata,
  route_load_project_config,
} from "utils/generatedEndpoints";
import {
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
  const res: LoadProjectConfigRouteResponse = await route_load_project_config({
    projectConfigName,
  });
  if (res200(res)) {
    const loadedProjectState = validateLoadedProjectState(res.data);
    const loaded = await loadProjectState(loadedProjectState);
    if (loaded) {
      const diagnosticsRes: LatestLspDiagnosticsRouteResponse =
        await route_get_latest_lsp_diagnostics({
          projectConfigId: loadedProjectState.projectConfig.id,
        });
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
  if (projectState.projectConfig.windowSpaces === undefined) {
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
    const res: CreateProjectConfigRouteResponse =
      await route_create_project_config({ previewImgColor });
    if (res200(res)) {
      useLocalStorage.setState({
        overviewTab: OverviewTabNameEnum.ProjectAIChat,
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
  const res: LoadAllProjectMetadataRouteResponse =
    await route_load_all_project_metadata();
  if (res200(res)) {
    useAllProjectMetadata.setState(res.data);
    return true;
  }
  return false;
}
