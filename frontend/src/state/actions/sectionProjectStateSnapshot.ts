import { type Node } from "forks/xyflow/core/types";
import _ from "lodash";
import { sanitizeProjectStateActiveIds } from "state/activeSectionSelection";
import {
  type PendingOperation,
  useNodeInternals,
  usePendingOperations,
  useProjectState,
  type ZustandProjectState,
} from "state/definitions";
import {
  type ProjectStateSingleConfig,
  type ProjectStateSingleConfigWithCompletedOpIds,
} from "utils/generatedTypes";
import { createNodesMapFromProjectConfigChildren } from "./sectionDisplayStructure";
import { mergeStreamingChatSections } from "./sectionStreamingMerge";
import { reconcilePendingTopLevelLayout } from "./topLevelLayoutPersistence";

export function getComparableProjectState(
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

type ReconciledProjectStateSnapshotBase = {
  currentState: ZustandProjectState;
  completedIds: Set<string>;
  nextPending: Array<PendingOperation>;
  sanitizedProjectState: ProjectStateSingleConfig;
};

export type ReconciledProjectStateSnapshot =
  | (ReconciledProjectStateSnapshotBase & {
      projectStateChanged: false;
      nextNodesMap: null;
    })
  | (ReconciledProjectStateSnapshotBase & {
      projectStateChanged: true;
      nextNodesMap: Map<string, Node>;
    });

export function reconcileProjectStateSnapshot(
  update: ProjectStateSingleConfigWithCompletedOpIds,
): ReconciledProjectStateSnapshot {
  const currentState = useProjectState.getState();
  mergeStreamingChatSections(update.projectState, currentState);

  const completedIds = new Set(update.completedOpIds);
  const nextPending = reconcilePendingOperationsForProjectStateUpdate(update);
  const sanitizedProjectState = getComparableProjectState(update.projectState);
  const projectStateChanged = !_.isEqual(
    getComparableProjectState(currentState),
    sanitizedProjectState,
  );

  if (!projectStateChanged) {
    return {
      currentState,
      completedIds,
      nextPending,
      sanitizedProjectState,
      projectStateChanged: false,
      nextNodesMap: null,
    };
  }

  return {
    currentState,
    completedIds,
    nextPending,
    sanitizedProjectState,
    projectStateChanged: true,
    nextNodesMap: createNodesMapFromProjectConfigChildren(
      update.projectState,
      useNodeInternals.getState().x,
    ),
  };
}

function reconcilePendingOperationsForProjectStateUpdate(
  update: ProjectStateSingleConfigWithCompletedOpIds,
): Array<PendingOperation> {
  const backendPendingIds = new Set(update.pendingOpIds);
  const completedIds = new Set(update.completedOpIds);
  const currentPending = usePendingOperations.getState().pending;
  const nextPending = currentPending.reduce<Array<PendingOperation>>(
    (acc, opInfo) => {
      if (completedIds.has(opInfo.opId)) {
        return acc;
      }
      const isBackendPending = backendPendingIds.has(opInfo.opId);
      acc.push({
        ...opInfo,
        acknowledged: opInfo.acknowledged || isBackendPending,
      });
      return acc;
    },
    [],
  );
  reconcilePendingTopLevelLayout(nextPending);
  for (const opInfo of nextPending) {
    opInfo.apply(update.projectState);
  }
  return nextPending;
}
