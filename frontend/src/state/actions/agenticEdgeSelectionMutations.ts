import { useProjectState, useShareSession } from "state/definitions";
import {
  route_delete_agentic_edges,
  route_set_agentic_edges,
  route_update_agentic_edge,
} from "utils/generatedEndpoints";

import { dispatchOptimisticProjectStateUpdate } from "./projectStateOptimisticUpdates";
import { getCurrProjectConfigId } from "./sectionInfos";

export function toggleAgenticEdgeSelection(
  edgeId: string,
  multiSelect: boolean,
): void {
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      const edges = state.projectConfig.agenticEdges;
      for (const edge of edges) {
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
          .projectConfig.agenticEdges.find(
            (candidate) => candidate.id === edgeId,
          );
        if (!edge) {
          return;
        }
        return route_update_agentic_edge({
          projectConfigId: getCurrProjectConfigId(),
          edge,
          frontendOpId,
        });
      }
      return route_set_agentic_edges({
        projectConfigId: getCurrProjectConfigId(),
        edges: useProjectState.getState().projectConfig.agenticEdges,
        frontendOpId,
      });
    },
  });
}

export function deleteSelectedAgenticEdges(): boolean {
  if (useShareSession.getState().isDeploymentMode) {
    return false;
  }
  const state = useProjectState.getState();
  const selectedIds = state.projectConfig.agenticEdges
    .filter((edge) => edge.selected)
    .map((edge) => edge.id);
  if (selectedIds.length === 0) {
    return false;
  }

  dispatchOptimisticProjectStateUpdate({
    apply: (draft) => {
      draft.projectConfig.agenticEdges =
        draft.projectConfig.agenticEdges.filter(
          (edge) => !selectedIds.includes(edge.id),
        );
    },
    send: (frontendOpId) =>
      route_delete_agentic_edges({
        projectConfigId: getCurrProjectConfigId(),
        edgeIds: selectedIds,
        frontendOpId,
      }),
  });

  return true;
}

export function deleteAgenticEdgesById(edgeIds: string[]): void {
  if (useShareSession.getState().isDeploymentMode || edgeIds.length === 0) {
    return;
  }
  dispatchOptimisticProjectStateUpdate({
    apply: (draft) => {
      draft.projectConfig.agenticEdges =
        draft.projectConfig.agenticEdges.filter(
          (edge) => !edgeIds.includes(edge.id),
        );
    },
    send: (frontendOpId) =>
      route_delete_agentic_edges({
        projectConfigId: getCurrProjectConfigId(),
        edgeIds,
        frontendOpId,
      }),
  });
}
