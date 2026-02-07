import { useReactFlow } from "forks/xyflow/core/store";
import { useNavigate } from "react-router-dom";
import { applyPendingNameValidationErrors } from "state/actions/nameValidation";
import {
  useAllProjectMetadata,
  useNodeInternals,
  useProjectState,
} from "state/definitions";
import {
  PAGE_LOAD_TYPES,
  pathRelativeToProject,
  PROJECT_CONFIG_PREVIEW_IMG_COLORS,
} from "utils/constants";
import { res200 } from "utils/endpointUtils";
import {
  route_create_project_config,
  route_load_all_project_metadata,
  route_load_project_config,
} from "utils/generatedEndpoints";
import { ProjectStateSingleConfig } from "utils/generatedTypes";
import { requestAIFollowSnapshot } from "../aiFollow";
import { fetchListenerCoverageSnapshot } from "../listenerCoverage";
import { createNodesMapFromProjectConfigChildren } from "../sectionInfos";
import { initializeServerMode } from "../serverMode";

export async function loadProjectConfig({ projectConfigName }) {
  const res = await route_load_project_config({ projectConfigName });
  if (res200(res)) {
    const loaded = await loadProjectState(res.data);
    if (loaded) {
      await requestAIFollowSnapshot(res.data.projectConfig.id);
      await fetchListenerCoverageSnapshot(res.data.projectConfig.id);
    }
    return loaded;
  } else {
    return false;
  }
}

export async function loadProjectState(
  p: ProjectStateSingleConfig,
  options: { appSpec?: unknown | null } = {},
) {
  const { viewport, viewportInitialized } = p.projectConfig;
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
  useProjectState.setState({ ...p, appSpec: options.appSpec ?? null });
  applyPendingNameValidationErrors(p.projectConfig.id);
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

export async function loadAllProjectMetadata() {
  const mode = await initializeServerMode();
  if (mode !== "ide") {
    return;
  }
  const res = await route_load_all_project_metadata();
  if (res200(res)) {
    useAllProjectMetadata.setState(res.data);
  }
}
