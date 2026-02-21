import type { Node } from "forks/xyflow/core/types";
import { useReactFlow } from "forks/xyflow/core/store";
import { unstable_batchedUpdates } from "react-dom";
import {
  dispatchOptimisticProjectStateUpdate,
  createNodesMapFromProjectConfigChildren,
  getActiveViewModeTopLevelSections,
} from "state/actions/sectionInfos";
import {
  PendingOperationKindEnum,
  useMisc,
  useNodeInternals,
  useProjectState,
  type ZustandProjectState,
} from "state/definitions";
import {
  route_set_active_view_mode,
  route_set_view_mode_sort_order,
} from "utils/generatedEndpoints";

export function applyViewModeSortOrder(
  state: ZustandProjectState,
  orderedViewModeIds: Array<string>,
): void {
  const viewModes = state.projectConfig.viewModes;
  if (orderedViewModeIds.length !== Object.keys(viewModes).length) {
    throw new Error(
      "orderedViewModeIds must include every view mode exactly once.",
    );
  }

  const seen = new Set<string>();
  for (const viewModeId of orderedViewModeIds) {
    if (!(viewModeId in viewModes)) {
      throw new Error(`View mode ${viewModeId} not found.`);
    }
    if (seen.has(viewModeId)) {
      throw new Error("orderedViewModeIds contains duplicates.");
    }
    seen.add(viewModeId);
  }

  orderedViewModeIds.forEach((viewModeId, index) => {
    viewModes[viewModeId].sortIndex = index;
  });
}

function cloneTopLevelSections(
  topLevelSections: ZustandProjectState["projectConfig"]["topLevelSections"],
): ZustandProjectState["projectConfig"]["topLevelSections"] {
  const cloned: ZustandProjectState["projectConfig"]["topLevelSections"] = {};
  for (const [sectionId, layout] of Object.entries(topLevelSections)) {
    cloned[sectionId] = { ...layout };
  }
  return cloned;
}

export function applyActiveViewMode(
  state: ZustandProjectState,
  activeViewModeId: string,
): void {
  const projectConfig = state.projectConfig;
  const { viewModes } = projectConfig;
  if (!(activeViewModeId in viewModes)) {
    throw new Error(`View mode ${activeViewModeId} not found.`);
  }

  const previousActiveViewModeId = projectConfig.activeViewModeId;
  if (previousActiveViewModeId === activeViewModeId) {
    return;
  }

  if (previousActiveViewModeId) {
    if (!(previousActiveViewModeId in viewModes)) {
      throw new Error(`View mode ${previousActiveViewModeId} not found.`);
    }
    const previousViewMode = viewModes[previousActiveViewModeId];
    previousViewMode.topLevelSections = projectConfig.topLevelSections;
    previousViewMode.viewport = projectConfig.viewport;
    previousViewMode.viewportInitialized = projectConfig.viewportInitialized;
  }

  const nextViewMode = viewModes[activeViewModeId];
  if (Object.keys(nextViewMode.topLevelSections).length === 0) {
    nextViewMode.topLevelSections = cloneTopLevelSections(
      projectConfig.topLevelSections,
    );
  }

  projectConfig.topLevelSections = nextViewMode.topLevelSections;
  projectConfig.viewport = nextViewMode.viewport;
  projectConfig.viewportInitialized = nextViewMode.viewportInitialized;
  projectConfig.activeViewModeId = activeViewModeId;
}

function getFitViewOptionsForVisibleSections(
  projectState: ZustandProjectState,
): { nodes: Array<Node> } | undefined {
  const { activeViewModeId, isEditingViewMode, viewModes } =
    projectState.projectConfig;
  if (isEditingViewMode || !activeViewModeId) {
    return undefined;
  }
  if (!(activeViewModeId in viewModes)) {
    return undefined;
  }
  const viewMode = viewModes[activeViewModeId];
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

function syncNodeAndViewportStateAfterViewModeSwitch(): void {
  const projectState = useProjectState.getState();
  const nextNodesMap = createNodesMapFromProjectConfigChildren(
    projectState,
    useNodeInternals.getState().x,
  );
  const { viewport, viewportInitialized } = projectState.projectConfig;

  unstable_batchedUpdates(() => {
    useNodeInternals.setState({ x: nextNodesMap });
    if (!viewport || !viewportInitialized) {
      useReactFlow.setState({
        fitViewOnInit: true,
        fitViewOnInitDone: false,
        fitViewOnInitOptions: getFitViewOptionsForVisibleSections(projectState),
      });
      useMisc.setState({ requestUpdateNodeDimensions: true });
      return;
    }
    useReactFlow.setState({
      fitViewOnInit: false,
      fitViewOnInitDone: true,
      fitViewOnInitOptions: undefined,
      transform: [viewport.x, viewport.y, viewport.zoom],
    });
  });
}

export function persistActiveViewMode(
  projectConfigId: string,
  activeViewModeId: string,
): void {
  const currentActiveViewModeId = useProjectState.getState().projectConfig
    .activeViewModeId;
  if (currentActiveViewModeId === activeViewModeId) {
    return;
  }

  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      applyActiveViewMode(state, activeViewModeId);
    },
    kind: PendingOperationKindEnum.ActiveViewMode,
    send: (frontendOpId) =>
      route_set_active_view_mode({
        projectConfigId,
        activeViewModeId,
        frontendOpId,
      }),
  });

  syncNodeAndViewportStateAfterViewModeSwitch();
}

export function persistViewModeSortOrder(
  projectConfigId: string,
  orderedViewModeIds: Array<string>,
): void {
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      applyViewModeSortOrder(state, orderedViewModeIds);
    },
    send: (frontendOpId) =>
      route_set_view_mode_sort_order({
        projectConfigId,
        orderedViewModeIds,
        frontendOpId,
      }),
  });
}
