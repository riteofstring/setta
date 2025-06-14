import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import { useNavigate } from "react-router-dom";
import {
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
  route_load_project_config,
  route_load_settings_project,
} from "utils/generatedEndpoints";
import { maybeRunGuiToYamlOnAllSections } from "../guiToYaml";
import { createNodesMapFromProjectConfigChildren } from "../sectionInfos";
import { maybeIncrementProjectStateVersion } from "../undo";

export async function loadProjectConfig({ projectConfigName }) {
  const res = await route_load_project_config({ projectConfigName });
  if (res200(res)) {
    return await loadProjectState(res.data);
  } else {
    return false;
  }
}

export async function loadSettingsProjectConfig() {
  const res = await route_load_settings_project();
  if (res200(res)) {
    console.log(res.data);
    return await loadProjectState(res.data);
  } else {
    return false;
  }
}

export async function loadProjectState({
  projectConfig,
  codeInfo,
  codeInfoCols,
  sections,
  variants,
  // artifactGroups,
  uiTypes,
  uiTypeCols,
}) {
  if (!projectConfig.viewport) {
    useReactFlow.setState({ fitViewOnInit: true, fitViewOnInitDone: false });
  } else {
    const { x, y, zoom } = projectConfig.viewport;
    useReactFlow.setState({
      fitViewOnInit: false,
      fitViewOnInitDone: true,
      transform: [x, y, zoom],
    });
  }
  useProjectState.setState({
    projectConfig,
    sections,
    variants,
    uiTypes,
    uiTypeCols,
    codeInfo,
    codeInfoCols,
    // artifactGroups,
  });
  useSectionColumnWidth.setState(_.mapValues(sections, (x) => x.columnWidth));
  useNodeInternals.setState({
    x: createNodesMapFromProjectConfigChildren(projectConfig, sections),
  });
  await maybeRunGuiToYamlOnAllSections();
  maybeIncrementProjectStateVersion(true, false);
  return true;
}

export function useCreateAndGoToProjectConfig() {
  const navigateToAnotherConfig = useNavigateToAnotherConfig();
  return async () => {
    const previewImgColor = getRandomProjectConfigPreviewImgColor();
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
  return (projectConfigName) => {
    navigate(pathRelativeToProject(projectConfigName), {
      state: { pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG },
    });
  };
}
