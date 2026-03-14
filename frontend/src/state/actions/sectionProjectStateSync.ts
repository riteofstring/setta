import { useReactFlow } from "forks/xyflow/core/store";
import { Node } from "forks/xyflow/core/types";
import _ from "lodash";
import { unstable_batchedUpdates } from "react-dom";
import {
  getReconciledActiveSectionUIStateFromBackend,
  sanitizeProjectStateActiveIds,
  useActiveSectionUI,
} from "state/activeSectionUI";
import {
  PendingOperation,
  runWithAtomicallyPublishedProjectStores,
  useNodeInternals,
  usePendingOperations,
  useProjectState,
  ZustandProjectState,
} from "state/definitions";
import { useMisc } from "state/stores/layoutInteractionStores";
import {
  ProjectStateSingleConfig,
  ProjectStateSingleConfigWithCompletedOpIds,
} from "utils/generatedTypes";
import { recordAuthoritativeProjectChatWindowingState } from "./projectChatWindowingAuthoritative";
import { reconcileProjectChatWindowingEphemeralState } from "./projectChatWindowingEphemeral";
import {
  markRenameBroadcastsReady,
  maybeOpenNextRenamePrompt,
} from "./renameRefactors";
import {
  clearToolArgumentPreviewForProjectState,
  createNodesMapFromProjectConfigChildren,
  getCurrProjectConfigId,
  mergeStreamingChatSections,
} from "./sectionInfos";
import { reconcilePendingTopLevelLayout } from "./topLevelLayoutPersistence";
import { getActiveViewModeTopLevelSections } from "./topLevelSectionLayouts";

function getComparableProjectState(
  state: ProjectStateSingleConfig | ZustandProjectState,
): ProjectStateSingleConfig {
  return sanitizeProjectStateActiveIds({
    sections: state.sections,
    sectionImpls: state.sectionImpls,
    sectionVariants: state.sectionVariants,
    codeObjs: state.codeObjs,
    codeObjImpls: state.codeObjImpls,
    codeObjVariants: state.codeObjVariants,
    artifactGroups: state.artifactGroups,
    projectConfig: state.projectConfig,
    singletonSections: state.singletonSections,
    parentSectionMap: state.parentSectionMap,
    shownParamIds: state.shownParamIds,
    requiredDecodedImages: state.requiredDecodedImages,
    genCodeBinding: state.genCodeBinding ?? null,
    projectChatWindowing: state.projectChatWindowing,
  });
}

export function processProjectStateUpdateFromBackend(
  update: ProjectStateSingleConfigWithCompletedOpIds,
) {
  const projectConfigId = getCurrProjectConfigId();
  if (update.projectState.projectConfig.id !== projectConfigId) {
    return;
  }
  const currentState = useProjectState.getState();
  mergeStreamingChatSections(update.projectState, currentState);
  recordAuthoritativeProjectChatWindowingState(
    update.projectState.projectConfig.id,
    update.projectState.projectChatWindowing,
  );
  const backendPendingIds = new Set(update.pendingOpIds);
  const completedIds = new Set(update.completedOpIds);
  const currentPending = usePendingOperations.getState().pending;
  const nextPending = currentPending.reduce<PendingOperation[]>(
    (acc, opInfo) => {
      if (completedIds.has(opInfo.opId)) {
        return acc;
      }
      const isBackendPending = backendPendingIds.has(opInfo.opId);
      const acknowledged = opInfo.acknowledged || isBackendPending;
      acc.push({
        ...opInfo,
        acknowledged,
      });
      return acc;
    },
    [],
  );
  reconcilePendingTopLevelLayout(nextPending);
  for (const opInfo of nextPending) {
    opInfo.apply(update.projectState);
  }
  const nextActiveSectionUIState = getReconciledActiveSectionUIStateFromBackend(
    update.projectState.projectConfig.activeIds,
    update.completedOpIds,
    update.projectState.projectConfig.id,
    Object.keys(update.projectState.sections),
  );
  const sanitizedProjectState = getComparableProjectState(update.projectState);
  const projectStateChanged = !_.isEqual(
    getComparableProjectState(currentState),
    sanitizedProjectState,
  );

  if (!projectStateChanged) {
    unstable_batchedUpdates(() => {
      usePendingOperations.setState({ pending: nextPending });
      if (nextActiveSectionUIState !== null) {
        useActiveSectionUI.setState(nextActiveSectionUIState);
      }
    });
    markRenameBroadcastsReady(completedIds);
    maybeOpenNextRenamePrompt();
    clearToolArgumentPreviewForProjectState(projectConfigId, currentState);
    return;
  }

  const shouldRequestFitView = applyViewportFromProjectState(
    update.projectState,
  );
  const nextNodesMap = createNodesMapFromProjectConfigChildren(
    update.projectState,
    useNodeInternals.getState().x,
  );
  reconcileProjectChatWindowingEphemeralState(
    sanitizedProjectState.projectChatWindowing,
    sanitizedProjectState.projectConfig.id,
  );
  runWithAtomicallyPublishedProjectStores(
    {
      projectState: sanitizedProjectState,
      nodeInternals: { x: nextNodesMap },
      activeSectionUI: nextActiveSectionUIState,
    },
    () => {
      unstable_batchedUpdates(() => {
        usePendingOperations.setState({ pending: nextPending });
        useNodeInternals.setState({ x: nextNodesMap });
        useProjectState.setState(() => sanitizedProjectState);
        if (nextActiveSectionUIState !== null) {
          useActiveSectionUI.setState(nextActiveSectionUIState);
        }
      });
    },
  );
  if (shouldRequestFitView) {
    useMisc.setState({ requestUpdateNodeDimensions: true });
  }

  markRenameBroadcastsReady(completedIds);
  maybeOpenNextRenamePrompt();
  clearToolArgumentPreviewForProjectState(
    projectConfigId,
    useProjectState.getState(),
  );
}

function applyViewportFromProjectState(
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

function getFitViewOptionsForVisibleSections(
  projectState: ProjectStateSingleConfig,
) {
  const { activeViewModeId, isEditingViewMode, viewModes } =
    projectState.projectConfig;
  if (isEditingViewMode) {
    return undefined;
  }
  if (!activeViewModeId) {
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
