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
  getWorkspaceGraphPortPosition,
  getWorkspaceGraphPortSide,
} from "./validation";
import { useWorkspaceGraph } from "./WorkspaceGraphContext";
import { evaluateWorkspaceGraphConnection } from "./validation";

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
  const canStart =
    canEditStructure &&
    activeGraph.snapshot.onConnect !== undefined &&
    !port.disabled;
  const className = [
    NO_DRAG_CLASS_NAME,
    NO_PAN_CLASS_NAME,
    SETTA_PREVENT_SECTION_ACTIVE_CSS,
    SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
    "setta-workspace-graph-port-safe-zone",
    `setta-workspace-graph-port-safe-zone--${side}`,
    `setta-workspace-graph-port--${port.family}`,
    `setta-workspace-graph-port--${port.type}`,
    connected ? "setta-workspace-graph-port--connected" : null,
    activeGraph.gesture
      ? "setta-workspace-graph-port--connection-active"
      : null,
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

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (!canStart || event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    activeGraph.beginConnection(
      port.id,
      { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      event.pointerId,
    );
  }

  return (
    <button
      aria-label={port.label}
      aria-disabled={!canStart}
      className={className}
      data-connection-state={connectionState}
      data-connected={connected}
      data-port-family={port.family}
      data-port-side={side}
      data-port-type={port.type}
      data-section-id={port.sectionId}
      data-workspace-graph-port-id={port.id}
      disabled={!canStart}
      onPointerDown={onPointerDown}
      style={{ top: `${position * 100}%` }}
      type="button"
    >
      <span aria-hidden="true" className="setta-workspace-graph-port-dot" />
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
