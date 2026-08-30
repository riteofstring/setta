import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { useReactFlow } from "../canvas/store";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { useNodeInternals, useWorkspaceDocument } from "../document/stores";
import { getIsEditableTarget } from "../keybindings/editableTarget";
import type { WorkspaceGraphEdge, WorkspaceGraphPortSide } from "./types";
import {
  getWorkspaceGraphBezier,
  getWorkspaceGraphElementCenter,
  getWorkspaceGraphViewportPoint,
  type WorkspaceGraphPoint,
} from "./geometry";
import { getWorkspaceGraphPortSide } from "./validation";
import { useWorkspaceGraph } from "./WorkspaceGraphContext";

type WorkspaceGraphPortGeometry = Readonly<{
  point: WorkspaceGraphPoint;
  side: WorkspaceGraphPortSide;
}>;

type WorkspaceGraphGeometry = Readonly<{
  height: number;
  ports: ReadonlyMap<string, WorkspaceGraphPortGeometry>;
  width: number;
}>;

const EMPTY_GRAPH_GEOMETRY: WorkspaceGraphGeometry = {
  height: 0,
  ports: new Map(),
  width: 0,
};

function getRootRect(rootElement: HTMLElement): DOMRect {
  return rootElement.getBoundingClientRect();
}

function graphGeometryEqual(
  left: WorkspaceGraphGeometry,
  right: WorkspaceGraphGeometry,
): boolean {
  if (
    left.width !== right.width ||
    left.height !== right.height ||
    left.ports.size !== right.ports.size
  ) {
    return false;
  }
  for (const [portId, leftPort] of left.ports) {
    const rightPort = right.ports.get(portId);
    if (
      !rightPort ||
      leftPort.side !== rightPort.side ||
      leftPort.point.x !== rightPort.point.x ||
      leftPort.point.y !== rightPort.point.y
    ) {
      return false;
    }
  }
  return true;
}

function getWorkspaceGraphPortElement(
  rootElement: HTMLElement,
  portId: string,
): HTMLElement | null {
  for (const element of rootElement.querySelectorAll<HTMLElement>(
    "[data-workspace-graph-port-id]",
  )) {
    if (element.dataset.workspaceGraphPortId === portId) {
      return (
        element.querySelector<HTMLElement>(
          "[data-workspace-graph-port-anchor]",
        ) ?? element
      );
    }
  }
  return null;
}

function getWorkspaceGraphEdgeLabel(edge: WorkspaceGraphEdge): string {
  return edge.label
    ? `${edge.family} edge: ${edge.label}`
    : `${edge.family} edge`;
}

function getOppositeSide(side: WorkspaceGraphPortSide): WorkspaceGraphPortSide {
  return side === "left" ? "right" : "left";
}

function getWorkspaceGraphEdgeClassName({
  edge,
  selected,
}: {
  edge: WorkspaceGraphEdge;
  selected: boolean;
}): string {
  return [
    "setta-workspace-graph-edge",
    `setta-workspace-graph-edge--${edge.family}`,
    selected ? "setta-workspace-graph-edge--selected" : null,
    edge.status && edge.status !== "idle"
      ? `setta-workspace-graph-edge--${edge.status}`
      : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function WorkspaceGraphEdgePath({
  edge,
  geometry,
}: {
  edge: WorkspaceGraphEdge;
  geometry: WorkspaceGraphGeometry;
}) {
  const graph = useWorkspaceGraph();
  const canEditStructure = useWorkspaceCapabilities(
    (state) => state.canEditStructure,
  );
  if (!graph) {
    return null;
  }
  const activeGraph = graph;
  const source = geometry.ports.get(edge.source.portId);
  const target = geometry.ports.get(edge.target.portId);
  if (!source || !target || edge.hidden) {
    return null;
  }
  const sourceGeometry = source;
  const targetGeometry = target;
  const selected = activeGraph.snapshot.selectedEdgeIds.has(edge.id);
  const bezier = getWorkspaceGraphBezier(
    sourceGeometry.point,
    sourceGeometry.side,
    targetGeometry.point,
    targetGeometry.side,
  );
  const canReconnect =
    canEditStructure && activeGraph.snapshot.onReconnect !== undefined;
  const canSelect = activeGraph.snapshot.onSelectedEdgeIdsChange !== undefined;

  function onClick(event: MouseEvent<SVGGElement>) {
    if (
      event.target instanceof Element &&
      event.target.closest("[data-workspace-graph-reconnect]")
    ) {
      return;
    }
    if (!canSelect) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    activeGraph.selectEdge(edge.id, event.metaKey || event.ctrlKey);
  }

  function onKeyDown(event: KeyboardEvent<SVGGElement>) {
    if (event.key === "Enter" || event.key === " ") {
      if (!canSelect) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      activeGraph.selectEdge(edge.id, event.metaKey || event.ctrlKey);
      return;
    }
    if (event.key === "Escape") {
      if (!canSelect || activeGraph.snapshot.selectedEdgeIds.size === 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      activeGraph.clearSelection();
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      if (
        !canEditStructure ||
        !activeGraph.snapshot.onDelete ||
        activeGraph.snapshot.selectedEdgeIds.size === 0
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      activeGraph.deleteSelectedEdges();
    }
  }

  function onReconnectPointerDown(
    event: PointerEvent<SVGCircleElement>,
    endpoint: "source" | "target",
  ) {
    if (!canReconnect || event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const point =
      endpoint === "source" ? sourceGeometry.point : targetGeometry.point;
    activeGraph.beginReconnect(edge.id, endpoint, point, event.pointerId);
  }

  return (
    <g
      aria-label={getWorkspaceGraphEdgeLabel(edge)}
      className={getWorkspaceGraphEdgeClassName({ edge, selected })}
      data-edge-id={edge.id}
      data-testid={`workspace-graph-edge-${edge.id}`}
      onClick={onClick}
      onKeyDown={onKeyDown}
      role={canSelect ? "button" : undefined}
      tabIndex={canSelect ? 0 : -1}
    >
      <path
        className="setta-workspace-graph-edge-path"
        d={bezier.path}
        fill="none"
      />
      <path
        className="setta-workspace-graph-edge-interaction"
        d={bezier.path}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
      />
      {edge.label ? (
        <g
          className="setta-workspace-graph-edge-label"
          transform={`translate(${bezier.labelX} ${bezier.labelY})`}
        >
          <rect
            className="setta-workspace-graph-edge-label-background"
            height={18}
            rx={9}
            width={Math.max(36, edge.label.length * 6 + 12)}
            x={-Math.max(36, edge.label.length * 6 + 12) / 2}
            y={-9}
          />
          <text
            className="setta-workspace-graph-edge-label-text"
            textAnchor="middle"
            y={3.5}
          >
            {edge.label}
          </text>
        </g>
      ) : null}
      {canReconnect ? (
        <>
          <circle
            cx={sourceGeometry.point.x}
            cy={sourceGeometry.point.y}
            data-workspace-graph-reconnect="source"
            fill="transparent"
            onPointerDown={(event) => onReconnectPointerDown(event, "source")}
            r={10}
            stroke="transparent"
          />
          <circle
            cx={targetGeometry.point.x}
            cy={targetGeometry.point.y}
            data-workspace-graph-reconnect="target"
            fill="transparent"
            onPointerDown={(event) => onReconnectPointerDown(event, "target")}
            r={10}
            stroke="transparent"
          />
        </>
      ) : null}
    </g>
  );
}

function WorkspaceGraphConnectionPreview({
  geometry,
  rootElement,
}: {
  geometry: WorkspaceGraphGeometry;
  rootElement: HTMLElement;
}) {
  const graph = useWorkspaceGraph();
  const transform = useReactFlow((state) => state.transform);
  if (!graph?.gesture) {
    return null;
  }
  const originPort = graph.snapshot.portsById.get(graph.gesture.originPortId);
  if (!originPort) {
    return null;
  }
  const rootRect = getRootRect(rootElement);
  const pointerPoint = getWorkspaceGraphViewportPoint(
    graph.gesture.pointerPoint,
    rootRect,
    transform,
  );
  const origin =
    geometry.ports.get(originPort.id)?.point ??
    getWorkspaceGraphViewportPoint(
      graph.gesture.originPoint,
      rootRect,
      transform,
    );
  let source = origin;
  let sourceSide = getWorkspaceGraphPortSide(originPort);
  let target = pointerPoint;
  let targetSide = getOppositeSide(sourceSide);

  if (graph.gesture.kind === "connect" && originPort.type === "target") {
    source = pointerPoint;
    sourceSide = getOppositeSide(getWorkspaceGraphPortSide(originPort));
    target = origin;
    targetSide = getWorkspaceGraphPortSide(originPort);
  }
  if (graph.gesture.kind === "reconnect") {
    const fixedPort = graph.snapshot.portsById.get(graph.gesture.fixedPortId);
    const fixed = fixedPort
      ? geometry.ports.get(fixedPort.id)?.point
      : undefined;
    if (fixedPort && fixed) {
      if (fixedPort.type === "source") {
        source = fixed;
        sourceSide = getWorkspaceGraphPortSide(fixedPort);
        target = pointerPoint;
        targetSide = getOppositeSide(sourceSide);
      } else {
        source = pointerPoint;
        sourceSide = getOppositeSide(getWorkspaceGraphPortSide(fixedPort));
        target = fixed;
        targetSide = getWorkspaceGraphPortSide(fixedPort);
      }
    }
  }
  const bezier = getWorkspaceGraphBezier(
    source,
    sourceSide,
    target,
    targetSide,
  );
  return (
    <path
      className="setta-workspace-graph-connection-preview"
      d={bezier.path}
      data-testid="workspace-graph-connection-preview"
      fill="none"
    />
  );
}

export function WorkspaceGraphLayer({
  rootElement,
}: {
  rootElement: HTMLElement | null;
}) {
  const graph = useWorkspaceGraph();
  const transform = useReactFlow((state) => state.transform);
  const canEditStructure = useWorkspaceCapabilities(
    (state) => state.canEditStructure,
  );
  const nodes = useNodeInternals((state) => state.x);
  const savedViews = useWorkspaceDocument((state) => state.savedViews);
  const [geometry, setGeometry] =
    useState<WorkspaceGraphGeometry>(EMPTY_GRAPH_GEOMETRY);
  const refreshGeometry = useCallback(() => {
    if (!graph || !rootElement) {
      setGeometry((current) =>
        graphGeometryEqual(current, EMPTY_GRAPH_GEOMETRY)
          ? current
          : EMPTY_GRAPH_GEOMETRY,
      );
      return;
    }
    const rootRect = getRootRect(rootElement);
    const ports = new Map<string, WorkspaceGraphPortGeometry>();
    for (const port of graph.snapshot.ports) {
      const element = getWorkspaceGraphPortElement(rootElement, port.id);
      if (!element) {
        continue;
      }
      ports.set(port.id, {
        point: getWorkspaceGraphViewportPoint(
          getWorkspaceGraphElementCenter(element.getBoundingClientRect()),
          rootRect,
          transform,
        ),
        side: getWorkspaceGraphPortSide(port),
      });
    }
    const next = {
      height: rootRect.height,
      ports,
      width: rootRect.width,
    };
    setGeometry((current) =>
      graphGeometryEqual(current, next) ? current : next,
    );
  }, [graph, rootElement, transform]);

  useLayoutEffect(() => {
    refreshGeometry();
  }, [nodes, refreshGeometry, savedViews]);

  useEffect(() => {
    if (!graph || !rootElement) {
      return;
    }
    let animationFrame: number | null = null;
    const scheduleGeometryRefresh = () => {
      if (animationFrame !== null) {
        return;
      }
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        refreshGeometry();
      });
    };
    const resizeObserver = new ResizeObserver(scheduleGeometryRefresh);
    resizeObserver.observe(rootElement);
    for (const port of graph.snapshot.ports) {
      const element = getWorkspaceGraphPortElement(rootElement, port.id);
      if (element) {
        resizeObserver.observe(element);
      }
    }
    const mutationObserver = new MutationObserver(scheduleGeometryRefresh);
    mutationObserver.observe(rootElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
      childList: true,
      subtree: true,
    });
    window.addEventListener("resize", scheduleGeometryRefresh);
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("resize", scheduleGeometryRefresh);
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [graph, refreshGeometry, rootElement]);

  useEffect(() => {
    if (!graph || !rootElement) {
      return;
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (
        !(event.target instanceof Node) ||
        !rootElement.contains(event.target) ||
        getIsEditableTarget(event)
      ) {
        return;
      }
      if (event.key === "Escape") {
        if (
          !graph.snapshot.onSelectedEdgeIdsChange ||
          graph.snapshot.selectedEdgeIds.size === 0
        ) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        graph.clearSelection();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (
          !canEditStructure ||
          !graph.snapshot.onDelete ||
          graph.snapshot.selectedEdgeIds.size === 0
        ) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        graph.deleteSelectedEdges();
      }
    };
    rootElement.addEventListener("keydown", onKeyDown);
    return () => rootElement.removeEventListener("keydown", onKeyDown);
  }, [canEditStructure, graph, rootElement]);

  const renderedEdges = useMemo(
    () =>
      graph?.snapshot.edges.map((edge) => (
        <WorkspaceGraphEdgePath edge={edge} geometry={geometry} key={edge.id} />
      )) ?? [],
    [geometry, graph],
  );
  if (!graph || !rootElement || geometry.width <= 0 || geometry.height <= 0) {
    return null;
  }
  return (
    <svg
      aria-label="Workspace graph"
      className="setta-workspace-graph-layer"
      height={geometry.height}
      role="group"
      width={geometry.width}
    >
      {renderedEdges}
      <WorkspaceGraphConnectionPreview
        geometry={geometry}
        rootElement={rootElement}
      />
    </svg>
  );
}
