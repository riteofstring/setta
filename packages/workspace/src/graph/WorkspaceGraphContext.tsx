import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { applyActiveSectionChange } from "../canvas/activeSectionController";
import { getReactFlowStore } from "../canvas/store";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { useWorkspaceDocument } from "../document/stores";
import { useWorkspaceHost } from "../workspaceHostContext";
import type { WorkspaceGraphConfiguration } from "./types";
import {
  detachWorkspaceGraphConnection,
  evaluateWorkspaceGraphConnection,
  validateWorkspaceGraphConfiguration,
  type WorkspaceGraphSnapshot,
} from "./validation";

export type WorkspaceGraphClientPoint = Readonly<{
  x: number;
  y: number;
}>;

export type WorkspaceGraphGesture =
  | Readonly<{
      kind: "connect";
      originPoint: WorkspaceGraphClientPoint;
      originPortId: string;
      pointerId: number;
      pointerPoint: WorkspaceGraphClientPoint;
    }>
  | Readonly<{
      edgeId: string;
      fixedPortId: string;
      kind: "reconnect";
      originPoint: WorkspaceGraphClientPoint;
      originPortId: string;
      pointerId: number;
      pointerPoint: WorkspaceGraphClientPoint;
    }>;

type WorkspaceGraphContextValue = Readonly<{
  beginConnection: (
    portId: string,
    originPoint: WorkspaceGraphClientPoint,
    pointerId: number,
  ) => void;
  beginReconnect: (
    edgeId: string,
    endpoint: "source" | "target",
    originPoint: WorkspaceGraphClientPoint,
    pointerId: number,
  ) => void;
  cancelGesture: () => void;
  clearSelection: () => void;
  completeGestureAtPort: (portId: string | null) => void;
  deleteSelectedEdges: () => void;
  gesture: WorkspaceGraphGesture | null;
  selectEdge: (edgeId: string, additive: boolean) => void;
  snapshot: WorkspaceGraphSnapshot;
  updateGesturePointer: (
    pointerId: number,
    pointerPoint: WorkspaceGraphClientPoint,
  ) => void;
}>;

const WorkspaceGraphContext = createContext<WorkspaceGraphContextValue | null>(
  null,
);

function getPortIdFromEventTarget(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) {
    return null;
  }
  const port = target.closest<HTMLElement>("[data-workspace-graph-port-id]");
  return port?.dataset.workspaceGraphPortId ?? null;
}

function detachEdgeIds(edgeIds: ReadonlyArray<string>): ReadonlyArray<string> {
  return Object.freeze([...edgeIds]);
}

function detachSelectedEdgeIds(
  edgeIds: ReadonlySet<string>,
): ReadonlySet<string> {
  return new Set(edgeIds);
}

export function WorkspaceGraphProvider({
  children,
  configuration,
}: {
  children?: ReactNode;
  configuration?: WorkspaceGraphConfiguration;
}) {
  const host = useWorkspaceHost();
  const sections = useWorkspaceDocument((state) => state.sections);
  const canEditStructure = useWorkspaceCapabilities(
    (state) => state.canEditStructure,
  );
  const snapshot = useMemo(
    () => validateWorkspaceGraphConfiguration(configuration, sections),
    [configuration, sections],
  );
  const [gesture, setGesture] = useState<WorkspaceGraphGesture | null>(null);

  useEffect(() => {
    setGesture(null);
  }, [snapshot]);

  const cancelGesture = useCallback(() => {
    setGesture(null);
  }, []);

  const updateGesturePointer = useCallback(
    (pointerId: number, pointerPoint: WorkspaceGraphClientPoint) => {
      setGesture((current) => {
        if (!current || current.pointerId !== pointerId) {
          return current;
        }
        return { ...current, pointerPoint };
      });
    },
    [],
  );

  const beginConnection = useCallback(
    (
      portId: string,
      originPoint: WorkspaceGraphClientPoint,
      pointerId: number,
    ) => {
      if (
        !snapshot ||
        !canEditStructure ||
        !snapshot.onConnect ||
        snapshot.portsById.get(portId)?.disabled
      ) {
        return;
      }
      setGesture({
        kind: "connect",
        originPoint,
        originPortId: portId,
        pointerId,
        pointerPoint: originPoint,
      });
    },
    [canEditStructure, snapshot],
  );

  const beginReconnect = useCallback(
    (
      edgeId: string,
      endpoint: "source" | "target",
      originPoint: WorkspaceGraphClientPoint,
      pointerId: number,
    ) => {
      if (!snapshot || !canEditStructure || !snapshot.onReconnect) {
        return;
      }
      const edge = snapshot.edgesById.get(edgeId);
      if (!edge) {
        return;
      }
      const originPortId = edge[endpoint].portId;
      const fixedPortId =
        endpoint === "source" ? edge.target.portId : edge.source.portId;
      setGesture({
        edgeId,
        fixedPortId,
        kind: "reconnect",
        originPoint,
        originPortId,
        pointerId,
        pointerPoint: originPoint,
      });
    },
    [canEditStructure, snapshot],
  );

  const completeGestureAtPort = useCallback(
    (portId: string | null) => {
      const current = gesture;
      setGesture(null);
      if (!current || !snapshot || !portId) {
        return;
      }
      const firstPortId =
        current.kind === "connect" ? current.originPortId : current.fixedPortId;
      const result = evaluateWorkspaceGraphConnection(
        snapshot,
        firstPortId,
        portId,
      );
      if (!result.connection || !result.valid) {
        return;
      }
      if (current.kind === "connect") {
        snapshot.onConnect?.(detachWorkspaceGraphConnection(result.connection));
      } else {
        snapshot.onReconnect?.(
          Object.freeze({
            connection: detachWorkspaceGraphConnection(result.connection),
            edgeId: current.edgeId,
          }),
        );
      }
    },
    [gesture, snapshot],
  );

  const selectEdge = useCallback(
    (edgeId: string, additive: boolean) => {
      if (
        !snapshot?.onSelectedEdgeIdsChange ||
        !snapshot.edgesById.has(edgeId)
      ) {
        return;
      }
      const selectedEdgeIds = additive
        ? new Set(snapshot.selectedEdgeIds)
        : new Set<string>();
      if (additive && selectedEdgeIds.has(edgeId)) {
        selectedEdgeIds.delete(edgeId);
      } else {
        selectedEdgeIds.add(edgeId);
      }
      applyActiveSectionChange(host, { interaction: "pane-click" });
      getReactFlowStore(host).getState().setNodesSelection(0);
      snapshot.onSelectedEdgeIdsChange(detachSelectedEdgeIds(selectedEdgeIds));
    },
    [host, snapshot],
  );

  const clearSelection = useCallback(() => {
    if (
      !snapshot?.onSelectedEdgeIdsChange ||
      snapshot.selectedEdgeIds.size === 0
    ) {
      return;
    }
    snapshot.onSelectedEdgeIdsChange(detachSelectedEdgeIds(new Set()));
  }, [snapshot]);

  const deleteSelectedEdges = useCallback(() => {
    if (
      !snapshot?.onDelete ||
      !canEditStructure ||
      snapshot.selectedEdgeIds.size === 0
    ) {
      return;
    }
    snapshot.onDelete(detachEdgeIds(Array.from(snapshot.selectedEdgeIds)));
  }, [canEditStructure, snapshot]);

  useEffect(() => {
    if (!gesture) {
      return;
    }
    const handlePointerMove = (event: PointerEvent) => {
      updateGesturePointer(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== gesture.pointerId) {
        return;
      }
      completeGestureAtPort(getPortIdFromEventTarget(event.target));
    };
    const handlePointerCancel = (event: PointerEvent) => {
      if (event.pointerId === gesture.pointerId) {
        cancelGesture();
      }
    };
    document.addEventListener("pointermove", handlePointerMove, true);
    document.addEventListener("pointerup", handlePointerUp, true);
    document.addEventListener("pointercancel", handlePointerCancel, true);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("pointerup", handlePointerUp, true);
      document.removeEventListener("pointercancel", handlePointerCancel, true);
    };
  }, [cancelGesture, completeGestureAtPort, gesture, updateGesturePointer]);

  const value = useMemo<WorkspaceGraphContextValue | null>(() => {
    if (!snapshot) {
      return null;
    }
    return {
      beginConnection,
      beginReconnect,
      cancelGesture,
      clearSelection,
      completeGestureAtPort,
      deleteSelectedEdges,
      gesture,
      selectEdge,
      snapshot,
      updateGesturePointer,
    };
  }, [
    beginConnection,
    beginReconnect,
    cancelGesture,
    clearSelection,
    completeGestureAtPort,
    deleteSelectedEdges,
    gesture,
    selectEdge,
    snapshot,
    updateGesturePointer,
  ]);

  return (
    <WorkspaceGraphContext.Provider value={value}>
      {children}
    </WorkspaceGraphContext.Provider>
  );
}

export function useWorkspaceGraph(): WorkspaceGraphContextValue | null {
  return useContext(WorkspaceGraphContext);
}
