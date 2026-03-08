import { useReactFlow } from "forks/xyflow/core/store";
import { useNavigate } from "react-router-dom";
import { applyPendingNameValidationErrors } from "state/actions/nameValidation";
import {
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
import { res200 } from "utils/endpointUtils";
import {
  route_create_project_config,
  route_get_latest_lsp_diagnostics,
  route_load_all_project_metadata,
  route_load_project_config,
} from "utils/generatedEndpoints";
import {
  ProjectStateSingleConfigSchema,
  type ProjectStateSingleConfig,
  type ProjectStateSingleConfigInput,
} from "utils/generatedTypes";
import { requestAIFollowSnapshot } from "../aiFollow";
import { fetchListenerCoverageSnapshot } from "../listenerCoverage";
import { processLspDiagnostics } from "../lspDiagnostics";
import {
  getPersistedProjectChatWindowingState,
  setPersistedProjectChatWindowingState,
} from "../projectChatWindowingPersistence";
import {
  createNodesMapFromProjectConfigChildren,
  mergeProjectChatWindowingFromCurrentState,
} from "../sectionInfos";
import { initializeServerMode } from "../serverMode";

export async function loadProjectConfig({ projectConfigName }) {
  const res = await route_load_project_config({ projectConfigName });
  if (res200(res)) {
    const normalizedProjectState = normalizeLoadedProjectState(res.data);
    const loaded = await loadProjectState(normalizedProjectState);
    if (loaded) {
      const diagnosticsRes = await route_get_latest_lsp_diagnostics({
        projectConfigId: normalizedProjectState.projectConfig.id,
      });
      if (res200(diagnosticsRes)) {
        processLspDiagnostics(diagnosticsRes.data);
      }
      await requestAIFollowSnapshot(normalizedProjectState.projectConfig.id);
      await fetchListenerCoverageSnapshot(
        normalizedProjectState.projectConfig.id,
      );
    }
    return loaded;
  } else {
    return false;
  }
}

function normalizeLoadedProjectState(
  projectState: ProjectStateSingleConfigInput | ProjectStateSingleConfig,
): ProjectStateSingleConfig {
  return ProjectStateSingleConfigSchema.parse(projectState);
}

export async function loadProjectState(
  projectState: ProjectStateSingleConfigInput | ProjectStateSingleConfig,
) {
  const normalizedProjectState = normalizeLoadedProjectState(projectState);
  const persistedProjectChatWindowing = getPersistedProjectChatWindowingState(
    normalizedProjectState.projectConfig.id,
  );
  if (persistedProjectChatWindowing) {
    mergeProjectChatWindowingFromCurrentState(normalizedProjectState, {
      projectChatWindowing: persistedProjectChatWindowing,
    });
  }
  const { viewport, viewportInitialized } =
    normalizedProjectState.projectConfig;
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
  useProjectState.setState({
    ...normalizedProjectState,
    previewSectionVariantMap: {},
  });
  setPersistedProjectChatWindowingState(
    normalizedProjectState.projectConfig.id,
    normalizedProjectState.projectChatWindowing,
  );
  applyPendingNameValidationErrors(normalizedProjectState.projectConfig.id);
  useNodeInternals.setState((state) => ({
    x: createNodesMapFromProjectConfigChildren(
      useProjectState.getState(),
      state.x,
    ),
  }));
  return true;
}

export function useCreateAndGoToProjectConfig() {
  const navigateToAnotherConfig = useNavigateToAnotherConfig();
  return async () => {
    const previewImgColor = getRandomProjectConfigPreviewImgColor();
    if (!previewImgColor) {
      throw new Error();
    }
    const res = await route_create_project_config({ previewImgColor });
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
  const res = await route_load_all_project_metadata();
  if (res200(res)) {
    useAllProjectMetadata.setState(res.data);
    return true;
  }
  return false;
}
