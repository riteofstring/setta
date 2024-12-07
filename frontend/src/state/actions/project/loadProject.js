import BASE_UI_TYPES from "constants/BaseUITypes.json";
import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import { useNavigate } from "react-router-dom";
import { dbCreateProjectConfig, dbLoadProjectConfig } from "requests/projects";
import { dbLoadSettingsProject } from "requests/settings";
import {
  useNodeInternals,
  useProjectConfig,
  useSectionInfos,
} from "state/definitions";
import { PAGE_LOAD_TYPES, pathRelativeToProject } from "utils/constants";
import { maybeIncrementProjectStateVersion } from "../undo";

export async function loadProjectConfig({ projectConfigName }) {
  const res = await dbLoadProjectConfig(projectConfigName);
  if (res.status === 200) {
    console.log(res.data);
    return loadProjectState(res.data);
  } else {
    return false;
  }
}

export async function loadSettingsProjectConfig() {
  const res = await dbLoadSettingsProject();
  if (res.status === 200) {
    console.log(res.data);
    return loadProjectState(res.data);
  } else {
    return false;
  }
}

export function loadProjectState({
  projectConfig,
  codeInfo,
  codeInfoCols,
  sections,
  sectionVariants,
  uiTypes,
  uiTypeCols,
}) {
  useProjectConfig.setState({
    ..._.omit(projectConfig, ["children", "viewport"]),
  });
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
  useSectionInfos.setState({
    x: sections,
    variants: sectionVariants,
    uiTypes: { ...uiTypes, ...BASE_UI_TYPES },
    uiTypeCols,
    codeInfo,
    codeInfoCols,
  });
  useNodeInternals.setState({
    x: createNodesMapFromProjectConfigChildren(projectConfig),
  });
  maybeIncrementProjectStateVersion(true, false);
  return true;
}

export function useCreateAndGoToProjectConfig() {
  const navigateToAnotherConfig = useNavigateToAnotherConfig();
  return async () => {
    const { data: newProjectName } = await dbCreateProjectConfig();
    navigateToAnotherConfig(newProjectName);
  };
}

export function useNavigateToAnotherConfig() {
  const navigate = useNavigate();
  return (projectConfigName) => {
    navigate(pathRelativeToProject(projectConfigName), {
      state: { pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG },
    });
  };
}

function createNodesMapFromProjectConfigChildren(projectConfig) {
  const nodesMap = new Map();

  for (let k of Object.keys(projectConfig.children)) {
    const v = projectConfig.children[k];
    nodesMap.set(k, {
      id: k,
      position: { x: v.x, y: v.y },
      zIndex: v.zIndex,
      tempZIndex: v.zIndex,
    });
  }

  return nodesMap;
}
