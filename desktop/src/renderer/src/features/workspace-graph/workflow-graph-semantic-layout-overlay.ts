import type {
  SemanticGraph,
  SemanticLayoutPosition,
  SemanticLayoutPositionInput,
} from "@generated/backend";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  semanticGraphWithLayoutPositionOverlay,
  semanticLayoutPositionInputsFromRendererPositions,
} from "./semantic-graph-projection";
import type { WorkflowLayoutPosition } from "./workflow-graph-layout";

export interface PendingSemanticLayoutPosition extends SemanticLayoutPosition {
  saveSequence: number;
}

export function useSemanticLayoutOverlay({
  semanticGraph,
  workspaceId,
}: {
  semanticGraph: SemanticGraph | null;
  workspaceId: string;
}) {
  const [pendingSemanticLayoutPositions, setPendingSemanticLayoutPositions] = useState<
    PendingSemanticLayoutPosition[]
  >([]);

  useEffect(() => {
    setPendingSemanticLayoutPositions([]);
  }, [workspaceId]);

  const semanticGraphWithLocalLayout = useMemo(
    () =>
      semanticGraphWithLayoutPositionOverlay({
        overlayPositions: pendingSemanticLayoutPositions,
        semanticGraph,
      }),
    [pendingSemanticLayoutPositions, semanticGraph],
  );

  const preparePendingSemanticLayout = useCallback(
    (positions: WorkflowLayoutPosition[], saveSequence: number) => {
      if (semanticGraph === null) {
        return [];
      }
      const inputs = semanticLayoutPositionInputsFromRendererPositions({
        positions,
        semanticGraph,
      });
      if (inputs.length > 0) {
        setPendingSemanticLayoutPositions((current) =>
          pendingSemanticLayoutPositionsWithInputs({
            current,
            inputs,
            saveSequence,
            semanticGraph,
          }),
        );
      }
      return inputs;
    },
    [semanticGraph],
  );

  const settleSemanticLayoutSave = useCallback(
    (inputs: readonly SemanticLayoutPositionInput[], saveSequence: number) => {
      setPendingSemanticLayoutPositions((current) =>
        pendingSemanticLayoutPositionsAfterSaveSettlement({
          current,
          inputs,
          saveSequence,
        }),
      );
    },
    [],
  );

  return {
    preparePendingSemanticLayout,
    settleSemanticLayoutSave,
    semanticGraphWithLocalLayout,
  };
}

export function pendingSemanticLayoutPositionsWithInputs({
  current,
  inputs,
  saveSequence,
  semanticGraph,
}: {
  current: readonly PendingSemanticLayoutPosition[];
  inputs: readonly SemanticLayoutPositionInput[];
  saveSequence: number;
  semanticGraph: SemanticGraph;
}): PendingSemanticLayoutPosition[] {
  const byEntityId = new Map(current.map((position) => [position.entityId, position]));
  for (const input of inputs) {
    byEntityId.set(input.entityId, {
      entityId: input.entityId,
      pinned: input.pinned,
      saveSequence,
      updatedAt: "",
      workspaceId: semanticGraph.workspaceId,
      x: input.x,
      y: input.y,
    });
  }
  return [...byEntityId.values()];
}

export function pendingSemanticLayoutPositionsAfterSaveSettlement({
  current,
  inputs,
  saveSequence,
}: {
  current: readonly PendingSemanticLayoutPosition[];
  inputs: readonly SemanticLayoutPositionInput[];
  saveSequence: number;
}): PendingSemanticLayoutPosition[] {
  if (inputs.length === 0) {
    return [...current];
  }
  const persistedEntityIds = new Set(inputs.map((input) => input.entityId));
  return current.filter(
    (position) =>
      !persistedEntityIds.has(position.entityId) || position.saveSequence > saveSequence,
  );
}
