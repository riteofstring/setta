import type { Connection } from "forks/xyflow/core/types";
import { addTemporaryNotification } from "state/actions/notifications";
import { useProjectState, useShareSession } from "state/definitions";
import {
  route_create_state_machine_edge,
  route_delete_state_machine_edges,
  route_set_state_machine_edges,
  route_update_state_machine_edge,
} from "utils/generatedEndpoints";
import { clearActiveSectionIds } from "./activeSections";
import { dispatchOptimisticProjectStateUpdate } from "./projectStateOptimisticUpdates";
import { getCurrProjectConfigId } from "./sectionEffectiveImpls";
import {
  getConnectionDebugPayload,
  logWorkflowDebug,
} from "./stateMachineDebug";
import { normalizeWorkflowConnectionHandles } from "./stateMachineEdgeCanonicalization";
import { buildStateMachineEdgeForConnection } from "./stateMachineEdgeConnections";
import {
  applyWorkflowMachineGroupMerge,
  captureWorkflowMachineGroupMergeSnapshot,
  resolveMachineGroupTransitionForConnection,
  restoreWorkflowMachineGroupMergeSnapshot,
} from "./stateMachineEdgeGraph";

type WorkflowEdge = ReturnType<
  typeof useProjectState.getState
>["projectConfig"]["stateMachineEdges"][number];

export function createStateMachineEdgeFromConnection(
  connection: Connection,
): void {
  if (useShareSession.getState().isDeploymentMode) {
    logWorkflowDebug("workflow edge creation skipped in deployment mode", {
      ...getConnectionDebugPayload(connection),
    });
    return;
  }
  const state = useProjectState.getState();
  const normalizedConnection = normalizeWorkflowConnectionHandles(connection);
  const machineGroupTransition = resolveMachineGroupTransitionForConnection(
    normalizedConnection,
    state,
  );
  const nextEdge = buildStateMachineEdgeForConnection(connection, state);
  if (!nextEdge) {
    logWorkflowDebug("workflow edge creation rejected", {
      ...getConnectionDebugPayload(connection),
      normalizedConnection: getConnectionDebugPayload(normalizedConnection),
      resolvedMachineGroupId: machineGroupTransition.machineGroupId,
      mergedMachineGroupIds: machineGroupTransition.mergedMachineGroupIds,
    });
    addTemporaryNotification(
      "Workflow edges require compatible workflow ports and one resolvable machine group.",
      "warning",
    );
    return;
  }
  const mergeSnapshot = captureWorkflowMachineGroupMergeSnapshot(
    state,
    machineGroupTransition.mergedMachineGroupIds,
  );
  logWorkflowDebug("workflow edge created", {
    edgeId: nextEdge.id,
    machineGroupId: nextEdge.machineGroupId,
    mergedMachineGroupIds: machineGroupTransition.mergedMachineGroupIds,
    sourceSectionId: nextEdge.sourceSectionId,
    sourcePortId: nextEdge.sourcePortId,
    targetSectionId: nextEdge.targetSectionId,
    targetPortId: nextEdge.targetPortId,
    sourceFilterType: nextEdge.sourceFilter?.type ?? null,
    targetActionType: nextEdge.targetAction?.type ?? null,
  });
  dispatchOptimisticProjectStateUpdate({
    apply: (draft) => {
      applyWorkflowMachineGroupMerge(
        draft,
        nextEdge.machineGroupId,
        machineGroupTransition.mergedMachineGroupIds,
      );
      if (
        draft.projectConfig.stateMachineEdges.some(
          (edge) => edge.id === nextEdge.id,
        )
      ) {
        return;
      }
      draft.projectConfig.stateMachineEdges.push(nextEdge);
    },
    rollback: (draft) => {
      draft.projectConfig.stateMachineEdges =
        draft.projectConfig.stateMachineEdges.filter(
          (edge) => edge.id !== nextEdge.id,
        );
      restoreWorkflowMachineGroupMergeSnapshot(draft, mergeSnapshot);
    },
    send: (frontendOpId) =>
      route_create_state_machine_edge({
        projectConfigId: getCurrProjectConfigId(),
        id: nextEdge.id,
        machineGroupId: nextEdge.machineGroupId,
        sourceSectionId: nextEdge.sourceSectionId,
        sourcePortId: nextEdge.sourcePortId,
        targetSectionId: nextEdge.targetSectionId,
        targetPortId: nextEdge.targetPortId,
        sourceFilter: nextEdge.sourceFilter,
        sourceActivationCountCondition: nextEdge.sourceActivationCountCondition,
        targetAction: nextEdge.targetAction,
        style: null,
        hidden: false,
        zIndex: 0,
        frontendOpId,
      }),
  });
}

export function toggleStateMachineEdgeSelection(
  edgeId: string,
  multiSelect: boolean,
): void {
  clearActiveSectionIds();
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      for (const edge of state.projectConfig.stateMachineEdges) {
        if (edge.id === edgeId) {
          edge.selected = multiSelect ? !edge.selected : true;
        } else if (!multiSelect) {
          edge.selected = false;
        }
      }
    },
    send: (frontendOpId) => {
      if (multiSelect) {
        const edge = useProjectState
          .getState()
          .projectConfig.stateMachineEdges.find(
            (candidate) => candidate.id === edgeId,
          );
        if (!edge) {
          return;
        }
        return route_update_state_machine_edge({
          projectConfigId: getCurrProjectConfigId(),
          edge,
          frontendOpId,
        });
      }
      return route_set_state_machine_edges({
        projectConfigId: getCurrProjectConfigId(),
        edges: useProjectState.getState().projectConfig.stateMachineEdges,
        frontendOpId,
      });
    },
  });
}

export function deleteSelectedStateMachineEdges(): boolean {
  if (useShareSession.getState().isDeploymentMode) {
    return false;
  }
  const selectedIds = useProjectState
    .getState()
    .projectConfig.stateMachineEdges.filter((edge) => edge.selected)
    .map((edge) => edge.id);
  if (selectedIds.length === 0) {
    return false;
  }
  dispatchOptimisticProjectStateUpdate({
    apply: (draft) => {
      draft.projectConfig.stateMachineEdges =
        draft.projectConfig.stateMachineEdges.filter(
          (edge) => !selectedIds.includes(edge.id),
        );
    },
    send: (frontendOpId) =>
      route_delete_state_machine_edges({
        projectConfigId: getCurrProjectConfigId(),
        edgeIds: selectedIds,
        frontendOpId,
      }),
  });
  return true;
}

export function replaceStateMachineEdge(nextEdge: WorkflowEdge): void {
  if (useShareSession.getState().isDeploymentMode) {
    return;
  }
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      const index = state.projectConfig.stateMachineEdges.findIndex(
        (edge) => edge.id === nextEdge.id,
      );
      if (index === -1) {
        return;
      }
      state.projectConfig.stateMachineEdges[index] = nextEdge;
    },
    send: (frontendOpId) =>
      route_update_state_machine_edge({
        projectConfigId: getCurrProjectConfigId(),
        edge: nextEdge,
        frontendOpId,
      }),
  });
}
