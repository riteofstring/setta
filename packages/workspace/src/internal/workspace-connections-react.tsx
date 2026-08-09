import { ViewportPortal, useViewport } from "@xyflow/react";
import { useCallback, useId, useSyncExternalStore } from "react";

import {
  resolveWorkspacePortPosition,
  type WorkspaceConnections,
  type WorkspaceDocument,
  type WorkspaceEdge,
  type WorkspaceJsonValue,
  type WorkspacePoint,
  type WorkspacePort,
  type WorkspacePortSide,
} from "../core.js";
import type { WorkspaceGeometryIndex } from "./geometry-index.js";

type WorkspaceEdgeProjection = Readonly<{
  edge: WorkspaceEdge;
  labelPosition: WorkspacePoint;
  path: string;
  textAnchor: "end" | "middle" | "start";
}>;

type WorkspacePortProjection = Readonly<{
  point: WorkspacePoint;
  port: WorkspacePort;
}>;

function portKey(sectionId: string, portId: string): string {
  return `${JSON.stringify(sectionId)}:${JSON.stringify(portId)}`;
}

function sideVector(side: WorkspacePortSide): WorkspacePoint {
  const vectors: Record<WorkspacePortSide, WorkspacePoint> = {
    bottom: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
    top: { x: 0, y: -1 },
  };
  return vectors[side];
}

function pointText(point: WorkspacePoint): string {
  return `${String(point.x)} ${String(point.y)}`;
}

export function workspaceEdgePath(
  source: WorkspacePoint,
  sourceSide: WorkspacePortSide,
  target: WorkspacePoint,
  targetSide: WorkspacePortSide,
  minimumControlDistance: number,
): string {
  const distance = Math.hypot(target.x - source.x, target.y - source.y);
  const controlDistance = Math.max(minimumControlDistance, Math.min(distance * 0.45, 240));
  const sourceVector = sideVector(sourceSide);
  const targetVector = sideVector(targetSide);
  const sourceControl = {
    x: source.x + sourceVector.x * controlDistance,
    y: source.y + sourceVector.y * controlDistance,
  };
  const targetControl = {
    x: target.x + targetVector.x * controlDistance,
    y: target.y + targetVector.y * controlDistance,
  };
  return `M ${pointText(source)} C ${pointText(sourceControl)}, ${pointText(targetControl)}, ${pointText(target)}`;
}

function useGeometryRevision(index: WorkspaceGeometryIndex): number {
  const subscribe = useCallback((listener: () => void) => index.subscribe(listener), [index]);
  const snapshot = useCallback(() => index.revision, [index]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

function projectPorts(
  connections: WorkspaceConnections,
  geometryIndex: WorkspaceGeometryIndex,
): readonly WorkspacePortProjection[] {
  return connections.ports.flatMap((port) => {
    const frame = geometryIndex.get(port.sectionId);
    return frame ? [{ point: resolveWorkspacePortPosition(frame.rect, port), port }] : [];
  });
}

function projectEdges(
  connections: WorkspaceConnections,
  ports: readonly WorkspacePortProjection[],
  minimumControlDistance: number,
): readonly WorkspaceEdgeProjection[] {
  const portsByKey = new Map(
    ports.map((projection) => [portKey(projection.port.sectionId, projection.port.id), projection]),
  );
  return connections.edges.flatMap((edge) => {
    const source = portsByKey.get(portKey(edge.source.sectionId, edge.source.portId));
    const target = portsByKey.get(portKey(edge.target.sectionId, edge.target.portId));
    if (!source || !target) return [];
    const sourceVector = sideVector(source.port.side);
    const horizontalSource = source.port.side === "left" || source.port.side === "right";
    const labelDistance = minimumControlDistance / 2;
    return [
      {
        edge,
        labelPosition: {
          x:
            source.point.x +
            sourceVector.x * labelDistance +
            (horizontalSource ? 0 : minimumControlDistance / 5),
          y:
            source.point.y +
            sourceVector.y * labelDistance -
            (horizontalSource ? minimumControlDistance / 5 : 0),
        },
        path: workspaceEdgePath(
          source.point,
          source.port.side,
          target.point,
          target.port.side,
          minimumControlDistance,
        ),
        textAnchor:
          source.port.side === "left" ? "end" : source.port.side === "right" ? "start" : "middle",
      },
    ];
  });
}

function sectionTitle<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  sectionId: string,
): string {
  const section = document.sections[sectionId];
  if (!section) {
    throw new Error(`Workspace connection section ${JSON.stringify(sectionId)} is unavailable.`);
  }
  return section.title;
}

function portLabel(
  document: WorkspaceDocument<unknown>,
  portsByKey: ReadonlyMap<string, WorkspacePort>,
  sectionId: string,
  portId: string,
): string {
  const port = portsByKey.get(portKey(sectionId, portId));
  if (!port) {
    throw new Error(`Workspace connection port ${JSON.stringify(portId)} is unavailable.`);
  }
  return `${sectionTitle(document, sectionId)}, ${port.label}`;
}

function countLabel(count: number, singular: string): string {
  return `${String(count)} ${count === 1 ? singular : `${singular}s`}`;
}

function WorkspaceConnectionDescriptions<TSectionData>({
  ariaLabel,
  connections,
  document,
}: Readonly<{
  ariaLabel: string;
  connections: WorkspaceConnections;
  document: WorkspaceDocument<TSectionData>;
}>) {
  const portsByKey = new Map(
    connections.ports.map((port) => [portKey(port.sectionId, port.id), port]),
  );
  return (
    <div
      aria-label={`${ariaLabel} connections`}
      className="setta-workspace__visually-hidden"
      data-workspace-connection-descriptions=""
      role="group"
    >
      <p>
        {countLabel(connections.ports.length, "port")} and{" "}
        {countLabel(connections.edges.length, "edge")}.
      </p>
      <ul aria-label="Ports">
        {connections.ports.map((port) => (
          <li key={portKey(port.sectionId, port.id)}>
            {sectionTitle(document, port.sectionId)}, {port.label}, {port.side} side.
          </li>
        ))}
      </ul>
      <ul aria-label="Edges">
        {connections.edges.map((edge) => (
          <li key={edge.id}>
            {edge.label}:{" "}
            {portLabel(document, portsByKey, edge.source.sectionId, edge.source.portId)}
            {" to "}
            {portLabel(document, portsByKey, edge.target.sectionId, edge.target.portId)}.{" "}
            {edge.directed ? "Directed" : "Undirected"}.
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WorkspaceConnectionLayer<TSectionData = WorkspaceJsonValue>({
  ariaLabel,
  connections,
  document,
  geometryIndex,
}: Readonly<{
  ariaLabel: string;
  connections: WorkspaceConnections;
  document: WorkspaceDocument<TSectionData>;
  geometryIndex: WorkspaceGeometryIndex;
}>) {
  useGeometryRevision(geometryIndex);
  const { zoom } = useViewport();
  const markerId = `setta-workspace-arrow-${useId().replaceAll(":", "")}`;
  const ports = projectPorts(connections, geometryIndex);
  const edges = projectEdges(connections, ports, 48 / zoom);
  const markerSize = 10 / zoom;
  const portRadius = 5 / zoom;
  return (
    <>
      {ports.length > 0 ? (
        <ViewportPortal>
          <svg
            aria-hidden="true"
            className="setta-workspace__connections"
            data-workspace-visible-edge-count={edges.length}
            data-workspace-visible-port-count={ports.length}
            focusable="false"
          >
            <defs>
              <marker
                id={markerId}
                markerHeight={markerSize}
                markerUnits="userSpaceOnUse"
                markerWidth={markerSize}
                orient="auto"
                refX="9"
                refY="5"
                viewBox="0 0 10 10"
              >
                <path className="setta-workspace__connection-arrow" d="M 0 0 L 10 5 L 0 10 z" />
              </marker>
            </defs>
            {edges.map(({ edge, labelPosition, path, textAnchor }) => (
              <g data-workspace-edge-id={edge.id} key={edge.id}>
                <path className="setta-workspace__connection-underlay" d={path} />
                <path
                  className="setta-workspace__connection-edge"
                  d={path}
                  markerEnd={edge.directed ? `url(#${markerId})` : undefined}
                />
                <text
                  className="setta-workspace__connection-label"
                  dominantBaseline="central"
                  fontSize={12 / zoom}
                  strokeWidth={4 / zoom}
                  textAnchor={textAnchor}
                  x={labelPosition.x}
                  y={labelPosition.y}
                >
                  {edge.label}
                </text>
              </g>
            ))}
            {ports.map(({ point, port }) => (
              <g
                data-workspace-port-id={port.id}
                data-workspace-port-section-id={port.sectionId}
                key={portKey(port.sectionId, port.id)}
              >
                <circle
                  className="setta-workspace__connection-port-underlay"
                  cx={point.x}
                  cy={point.y}
                  r={portRadius + 2 / zoom}
                />
                <circle
                  className="setta-workspace__connection-port"
                  cx={point.x}
                  cy={point.y}
                  r={portRadius}
                />
              </g>
            ))}
          </svg>
        </ViewportPortal>
      ) : null}
      <WorkspaceConnectionDescriptions
        ariaLabel={ariaLabel}
        connections={connections}
        document={document}
      />
    </>
  );
}
