import { unstable_batchedUpdates } from "react-dom";
import { runWithAtomicallyPublishedProjectStores } from "state/atomicProjectStorePublication";
import {
  useNodeInternals,
  usePendingOperations,
  useProjectState,
} from "state/definitions";
import { useActiveSectionUI } from "state/storeDefinitions";
import { useMisc } from "state/stores/layoutInteractionStores";
import { type ProjectStateSingleConfigWithCompletedOpIds } from "utils/generatedTypes";
import {
  markRenameBroadcastsReady,
  maybeOpenNextRenamePrompt,
} from "./renameRefactors";
import { getCurrProjectConfigId } from "./sectionEffectiveImpls";
import { getNextActiveSectionUIStateFromProjectState } from "./sectionProjectStateActiveSync";
import { reconcileProjectStateSnapshot } from "./sectionProjectStateSnapshot";
import { syncViewportFromProjectState } from "./sectionProjectStateViewportSync";
import {
  reconcileProjectStateWindowingEphemeral,
  recordProjectStateWindowingAuthoritativeSnapshot,
} from "./sectionProjectStateWindowingSync";
import { clearToolArgumentPreviewForProjectState } from "./sectionToolArgumentPreview";

export function processProjectStateUpdateFromBackend(
  update: ProjectStateSingleConfigWithCompletedOpIds,
) {
  const projectConfigId = getCurrProjectConfigId();
  if (update.projectState.projectConfig.id !== projectConfigId) {
    return;
  }
  recordProjectStateWindowingAuthoritativeSnapshot(update.projectState);
  const snapshot = reconcileProjectStateSnapshot(update);
  const nextActiveSectionUIState = getNextActiveSectionUIStateFromProjectState(
    update.projectState,
    update.completedOpIds,
  );

  if (!snapshot.projectStateChanged) {
    unstable_batchedUpdates(() => {
      usePendingOperations.setState({ pending: snapshot.nextPending });
      if (nextActiveSectionUIState !== null) {
        useActiveSectionUI.setState(nextActiveSectionUIState);
      }
    });
    markRenameBroadcastsReady(snapshot.completedIds);
    maybeOpenNextRenamePrompt();
    clearToolArgumentPreviewForProjectState(
      projectConfigId,
      snapshot.currentState,
    );
    return;
  }

  const shouldRequestFitView = syncViewportFromProjectState(
    update.projectState,
  );
  reconcileProjectStateWindowingEphemeral(snapshot.sanitizedProjectState);
  runWithAtomicallyPublishedProjectStores(
    {
      projectState: snapshot.sanitizedProjectState,
      nodeInternals: { x: snapshot.nextNodesMap },
      activeSectionUI: nextActiveSectionUIState,
    },
    () => {
      unstable_batchedUpdates(() => {
        usePendingOperations.setState({ pending: snapshot.nextPending });
        useNodeInternals.setState({ x: snapshot.nextNodesMap });
        useProjectState.setState(() => snapshot.sanitizedProjectState);
        if (nextActiveSectionUIState !== null) {
          useActiveSectionUI.setState(nextActiveSectionUIState);
        }
      });
    },
  );
  if (shouldRequestFitView) {
    useMisc.setState({ requestUpdateNodeDimensions: true });
  }

  markRenameBroadcastsReady(snapshot.completedIds);
  maybeOpenNextRenamePrompt();
  clearToolArgumentPreviewForProjectState(
    projectConfigId,
    useProjectState.getState(),
  );
}
