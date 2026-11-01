import { useMemo, type PointerEvent } from "react";
import { useWorkspaceCapabilities } from "../document/capabilities";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
} from "../interaction";
import type { WorkspaceGraphPort } from "./types";
import {
  evaluateWorkspaceGraphConnection,
  getWorkspaceGraphFamilyStyle,
  getWorkspaceGraphPortPosition,
  getWorkspaceGraphPortSide,
} from "./validation";
import { useWorkspaceGraph } from "./WorkspaceGraphContext";

type WorkspaceGraphPortConnectionState = "idle" | "invalid" | "valid";

function getWorkspaceGraphPortConnectionState(
  graph: NonNullable<ReturnType<typeof useWorkspaceGraph>>,
  port: WorkspaceGraphPort,
): WorkspaceGraphPortConnectionState {
  if (!graph.gesture) {
    return "idle";
  }
  const firstPortId =
    graph.gesture.kind === "connect"
      ? graph.gesture.originPortId
      : graph.gesture.fixedPortId;
  if (firstPortId === port.id) {
    return "invalid";
  }
  const result = evaluateWorkspaceGraphConnection(
    graph.snapshot,
    firstPortId,
    port.id,
    graph.gesture.kind === "reconnect" ? graph.gesture.edgeId : undefined,
  );
  return result.valid ? "valid" : "invalid";
}

function isWorkspaceGraphPortConnected(
  graph: NonNullable<ReturnType<typeof useWorkspaceGraph>>,
  port: WorkspaceGraphPort,
): boolean {
  return graph.snapshot.edges.some(
    (edge) => edge.source.portId === port.id || edge.target.portId === port.id,
  );
}

type ActiveWorkspaceGraph = NonNullable<ReturnType<typeof useWorkspaceGraph>>;

function getWorkspaceGraphPortPermissions(
  graph: ActiveWorkspaceGraph,
  port: WorkspaceGraphPort,
  canEditStructure: boolean,
): { canReceive: boolean; canStart: boolean } {
  const enabled = canEditStructure && !port.disabled;
  return {
    canStart: enabled && graph.snapshot.onConnect !== undefined,
    canReceive: enabled && graph.gesture !== null,
  };
}

function getWorkspaceGraphPortClassName({
  connectionState,
  port,
  side,
}: {
  connectionState: WorkspaceGraphPortConnectionState;
  port: WorkspaceGraphPort;
  side: ReturnType<typeof getWorkspaceGraphPortSide>;
}): string {
  return [
    NO_DRAG_CLASS_NAME,
    NO_PAN_CLASS_NAME,
    SETTA_PREVENT_SECTION_ACTIVE_CSS,
    SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
    "setta-workspace-graph-port-safe-zone",
    `setta-workspace-graph-port-safe-zone--${side}`,
    `setta-workspace-graph-port--${port.type}`,
    port.disabled ? "setta-workspace-graph-port--disabled" : null,
    connectionState === "valid"
      ? "setta-workspace-graph-port--candidate-valid"
      : null,
    connectionState === "invalid"
      ? "setta-workspace-graph-port--candidate-invalid"
      : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function WorkspaceGraphPortButton({ port }: { port: WorkspaceGraphPort }) {
  const graph = useWorkspaceGraph();
  const canEditStructure = useWorkspaceCapabilities(
    (state) => state.canEditStructure,
  );
  if (!graph) {
    return null;
  }
  const activeGraph = graph;
  const side = getWorkspaceGraphPortSide(port);
  const position = getWorkspaceGraphPortPosition(port);
  const connected = isWorkspaceGraphPortConnected(activeGraph, port);
  const connectionState = getWorkspaceGraphPortConnectionState(
    activeGraph,
    port,
  );
  const { canReceive, canStart } = getWorkspaceGraphPortPermissions(
    activeGraph,
    port,
    canEditStructure,
  );
  const canInteract = canStart || canReceive;
  const className = getWorkspaceGraphPortClassName({
    connectionState,
    port,
    side,
  });

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (!canStart || event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const anchor = event.currentTarget.querySelector<HTMLElement>(
      "[data-workspace-graph-port-anchor]",
    );
    const rect = (anchor ?? event.currentTarget).getBoundingClientRect();
    activeGraph.beginConnection(
      port.id,
      { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      event.pointerId,
    );
  }

  return (
    <button
      aria-label={port.label}
      aria-disabled={!canInteract}
      className={className}
      data-connection-state={connectionState}
      data-connected={connected}
      data-port-family={port.family}
      data-port-side={side}
      data-port-type={port.type}
      data-workspace-graph-port-id={port.id}
      disabled={!canInteract}
      onPointerDown={onPointerDown}
      style={{
        ...getWorkspaceGraphFamilyStyle(
          activeGraph.snapshot.families.get(port.family),
        ),
        top: `${position * 100}%`,
      }}
      type="button"
    >
      <span
        aria-hidden="true"
        className="setta-workspace-graph-port-dot"
        data-workspace-graph-port-anchor="true"
      />
    </button>
  );
}

export function WorkspaceGraphPorts({ sectionId }: { sectionId: string }) {
  const graph = useWorkspaceGraph();
  const ports = useMemo(
    () => graph?.snapshot.portsBySectionId.get(sectionId) ?? [],
    [graph, sectionId],
  );
  if (!graph || ports.length === 0) {
    return null;
  }
  return (
    <>
      {ports.map((port) => (
        <WorkspaceGraphPortButton key={port.id} port={port} />
      ))}
    </>
  );
}
