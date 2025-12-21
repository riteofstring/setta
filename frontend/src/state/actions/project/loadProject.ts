import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import { useNavigate } from "react-router-dom";
import {
  useAllProjectMetadata,
  useNodeInternals,
  useProjectState,
  useSectionColumnWidth,
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
import { fetchListenerCoverageSnapshot } from "../listenerCoverage";
import { createNodesMapFromProjectConfigChildren } from "../sectionInfos";

export async function loadProjectConfig({ projectConfigName }) {
  const res = await route_load_project_config({ projectConfigName });
  if (res200(res)) {
    const loaded = await loadProjectState(res.data);
    if (loaded) {
      await fetchListenerCoverageSnapshot(res.data.projectConfig.id);
    }
    return loaded;
  } else {
    return false;
  }
}

async function loadProjectState(p: ProjectStateSingleConfig) {
  if (!p.projectConfig.viewport) {
    useReactFlow.setState({ fitViewOnInit: true, fitViewOnInitDone: false });
  } else {
    const { x, y, zoom } = p.projectConfig.viewport;
    useReactFlow.setState({
      fitViewOnInit: false,
      fitViewOnInitDone: true,
      transform: [x, y, zoom],
    });
  }
  useProjectState.setState(p);
  useSectionColumnWidth.setState(_.mapValues(p.sections, (x) => x.columnWidth));
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
  const res = await route_load_all_project_metadata();
  if (res200(res)) {
    useAllProjectMetadata.setState(res.data);
  }
}
