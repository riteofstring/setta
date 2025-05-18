import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import { useNavigate } from "react-router-dom";
import { dbCreateProjectConfig, dbLoadProjectConfig } from "requests/projects";
import { dbLoadSettingsProject } from "requests/settings";
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
import { maybeRunGuiToYamlOnAllSections } from "../guiToYaml";
import { getSectionVisibilityKeyForDisplay } from "../sectionInfos";
import { maybeIncrementProjectStateVersion } from "../undo";

export async function loadProjectConfig({ projectConfigName }) {
  const res = await dbLoadProjectConfig(projectConfigName);
  if (res.status === 200) {
    return await loadProjectState(res.data);
  } else {
    return false;
  }
}

export async function loadSettingsProjectConfig() {
  const res = await dbLoadSettingsProject();
  if (res.status === 200) {
    return await loadProjectState(res.data);
  } else {
    return false;
  }
}

export async function loadProjectState({
  projectConfigId,
  projectState: {
    projectConfigs,
    codeInfo,
    codeInfoCols,
    sections,
    variants,
    // artifactGroups,
    uiTypes,
    uiTypeCols,
  },
}) {
  const projectConfig = projectConfigs[projectConfigId];

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
    projectConfigId,
    projectConfigs,
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
    const res = await dbCreateProjectConfig({ previewImgColor });
    if (res.status === 200) {
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

function createNodesMapFromProjectConfigChildren(projectConfig, sections) {
  const nodesMap = new Map();
  const visibilityKey = getSectionVisibilityKeyForDisplay(
    projectConfig.viewingEditingMode,
  );

  for (let k of Object.keys(projectConfig.children)) {
    const v = projectConfig.children[k];
    nodesMap.set(k, {
      id: k,
      position: { x: v.x, y: v.y },
      zIndex: v.zIndex,
      tempZIndex: v.zIndex,
      visibility: sections[k].visibility[visibilityKey],
    });
  }

  return nodesMap;
}

export function getCurrentProjectConfig(_state) {
  const state = _state ?? useProjectState.getState();
  return state.projectConfigs[state.projectConfigId];
}
