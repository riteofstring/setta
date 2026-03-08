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
import { res200 } from "utils/endpointUtils";
import {
  route_create_project_config,
  route_get_latest_lsp_diagnostics,
  route_load_all_project_metadata,
  route_load_project_config,
} from "utils/generatedEndpoints";
import { ProjectStateSingleConfig } from "utils/generatedTypes";
import { requestAIFollowSnapshot } from "../aiFollow";
import { fetchListenerCoverageSnapshot } from "../listenerCoverage";
import { processLspDiagnostics } from "../lspDiagnostics";
import { createNodesMapFromProjectConfigChildren } from "../sectionInfos";
import { initializeServerMode } from "../serverMode";

export async function loadProjectConfig({ projectConfigName }) {
  const res = await route_load_project_config({ projectConfigName });
  if (res200(res)) {
    const loaded = await loadProjectState(res.data);
    if (loaded) {
      const diagnosticsRes = await route_get_latest_lsp_diagnostics({
        projectConfigId: res.data.projectConfig.id,
      });
      if (res200(diagnosticsRes)) {
        processLspDiagnostics(diagnosticsRes.data);
      }
      await requestAIFollowSnapshot(res.data.projectConfig.id);
      await fetchListenerCoverageSnapshot(res.data.projectConfig.id);
    }
    return loaded;
  } else {
    return false;
  }
}

export async function loadProjectState(p: ProjectStateSingleConfig) {
  const { viewport, viewportInitialized } = p.projectConfig;
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
    ...sanitizeProjectStateActiveIds(p),
    previewSectionVariantMap: {},
  };
  const nextActiveSectionUIState = getHydratedActiveSectionUIState(
    p.projectConfig.activeIds,
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
  applyPendingNameValidationErrors(p.projectConfig.id);
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
