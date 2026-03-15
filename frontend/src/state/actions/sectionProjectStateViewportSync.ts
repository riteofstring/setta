import { useReactFlow } from "forks/xyflow/core/store";
import { Node } from "forks/xyflow/core/types";
import _ from "lodash";
import { useProjectState } from "state/definitions";
import { type ProjectStateSingleConfig } from "utils/generatedTypes";
import { getActiveViewModeTopLevelSections } from "./topLevelSectionLayouts";

export function syncViewportFromProjectState(
  projectState: ProjectStateSingleConfig,
): boolean {
  const { viewport, viewportInitialized } = projectState.projectConfig;
  const currentConfig = useProjectState.getState().projectConfig;
  const viewModeChanged =
    currentConfig.activeViewModeId !==
    projectState.projectConfig.activeViewModeId;
  const viewportChanged =
    !_.isEqual(currentConfig.viewport, viewport) ||
    currentConfig.viewportInitialized !== viewportInitialized;

  if (!viewportChanged && !viewModeChanged) {
    return false;
  }

  if (!viewport || !viewportInitialized) {
    useReactFlow.setState({
      fitViewOnInit: true,
      fitViewOnInitDone: false,
      fitViewOnInitOptions: getFitViewOptionsForVisibleSections(projectState),
    });
    return true;
  }

  useReactFlow.setState({
    fitViewOnInit: false,
    fitViewOnInitDone: true,
    fitViewOnInitOptions: undefined,
    transform: [viewport.x, viewport.y, viewport.zoom],
  });
  return false;
}

export function getFitViewOptionsForVisibleSections(
  projectState: ProjectStateSingleConfig,
) {
  const { activeViewModeId, isEditingViewMode, viewModes } =
    projectState.projectConfig;
  if (isEditingViewMode || !activeViewModeId) {
    return undefined;
  }

  const viewMode = viewModes[activeViewModeId];
  if (!viewMode) {
    return undefined;
  }

  const topLevelSections = getActiveViewModeTopLevelSections(projectState);
  const visibleNodeIds = Object.keys(topLevelSections).filter(
    (sectionId) => viewMode.visibilityBySectionId[sectionId],
  );
  if (visibleNodeIds.length === 0) {
    return undefined;
  }

  return {
    nodes: visibleNodeIds.map((id) => ({ id }) as Node),
  };
}
