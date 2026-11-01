import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { useReactFlow } from "../canvas/store";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { useNodeInternals, useWorkspaceDocument } from "../document/stores";
import { BOUNDED_GROUP_SCROLL_CLASS_NAME } from "../interaction";
import { getIsEditableTarget } from "../keybindings/editableTarget";
import type {
  WorkspaceGraphEdge,
  WorkspaceGraphFamily,
  WorkspaceGraphPort,
  WorkspaceGraphPortSide,
} from "./types";
import {
  getWorkspaceGraphBezier,
  getWorkspaceGraphElementCenter,
  getWorkspaceGraphViewportPoint,
  type WorkspaceGraphPoint,
} from "./geometry";
import {
  getWorkspaceGraphFamilyStyle,
  getWorkspaceGraphPortSide,
} from "./validation";
import { useWorkspaceGraph } from "./WorkspaceGraphContext";

type ActiveWorkspaceGraph = NonNullable<ReturnType<typeof useWorkspaceGraph>>;

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

type WorkspaceGraphLabelBounds = Readonly<{
  height: number;
  width: number;
}>;

const EMPTY_LABEL_BOUNDS: WorkspaceGraphLabelBounds = {
  height: 0,
  width: 0,
};

type WorkspaceGraphClips = Readonly<{
  hit: string;
  paint: string;
}>;

const PORT_DOT_HALF_SIZE = 5;
const PORT_TARGET_HALF_SIZE = 8;
const CLIP_MARGIN = 1e5;
const BOUNDED_GROUP_SCROLL_SELECTOR = `.${BOUNDED_GROUP_SCROLL_CLASS_NAME}`;

function getPortHolesPath(
  ports: ReadonlyMap<string, WorkspaceGraphPortGeometry>,
  halfSize: number,
): string {
  const points = [...ports.values()].map(({ point }) => point);
  const bands = [
    ...new Set(points.flatMap(({ y }) => [y - halfSize, y + halfSize])),
  ].sort((left, right) => left - right);
  const extent =
    Math.max(0, ...points.flatMap(({ x, y }) => [Math.abs(x), Math.abs(y)])) +
    CLIP_MARGIN;
  let path = `M${-extent},${-extent}H${extent}V${extent}H${-extent}Z`;
  for (let band = 1; band < bands.length; band += 1) {
    const top = bands[band - 1]!;
    const bottom = bands[band]!;
    const centers = points
      .filter(({ y }) => y - halfSize <= top && y + halfSize >= bottom)
      .map(({ x }) => x)
      .sort((left, right) => left - right);
    for (let index = 0; index < centers.length;) {
      const left = centers[index]! - halfSize;
      let right = centers[index]! + halfSize;
      for (
        index += 1;
        index < centers.length && centers[index]! - halfSize <= right;
        index += 1
      ) {
        right = centers[index]! + halfSize;
      }
      path += `M${left},${top}H${right}V${bottom}H${left}Z`;
    }
  }
  return path;
}

const CONTROL_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "[contenteditable]:not([contenteditable='false'])",
  ".cm-editor",
  "[data-workspace-graph-port-id]",
  ...[
    "button",
    "checkbox",
    "combobox",
    "menuitem",
    "option",
    "slider",
    "switch",
    "tab",
    "textbox",
  ].map((role) => `[role='${role}']`),
].join(",");

function isControlUnderGraph(
  layer: Element,
  rootElement: HTMLElement,
  x: number,
  y: number,
): boolean {
  const below = document
    .elementsFromPoint(x, y)
    .find((element) => !layer.contains(element));
  const control = below?.closest(CONTROL_SELECTOR);
  return (
    control !== null && control !== undefined && rootElement.contains(control)
  );
}

function yieldGraphToControls(
  rootElement: HTMLElement,
  getLayer: () => SVGSVGElement | null,
): () => void {
  let frame: number | null = null;
  let point: WorkspaceGraphPoint = { x: 0, y: 0 };
  const evaluate = () => {
    frame = null;
    const layer = getLayer();
    layer?.toggleAttribute(
      "data-workspace-graph-yield",
      isControlUnderGraph(layer, rootElement, point.x, point.y),
    );
  };
  const onPointerMove = (event: globalThis.PointerEvent) => {
    if (event.buttons !== 0) {
      return;
    }
    point = { x: event.clientX, y: event.clientY };
    frame ??= window.requestAnimationFrame(evaluate);
  };
  rootElement.addEventListener("pointermove", onPointerMove, true);
  return () => {
    rootElement.removeEventListener("pointermove", onPointerMove, true);
    if (frame !== null) {
      window.cancelAnimationFrame(frame);
    }
  };
}

function isOutsideBoundedGroupScroll(
  element: Element,
  center: WorkspaceGraphPoint,
  tolerance: number,
): boolean {
  const scroller = element.parentElement?.closest(
    BOUNDED_GROUP_SCROLL_SELECTOR,
  );
  if (!scroller) {
    return false;
  }
  const rect = scroller.getBoundingClientRect();
  return (
    center.x < rect.left - tolerance ||
    center.x > rect.right + tolerance ||
    center.y < rect.top - tolerance ||
    center.y > rect.bottom + tolerance ||
    isOutsideBoundedGroupScroll(scroller, center, tolerance)
  );
}

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
  family,
  selected,
}: {
  edge: WorkspaceGraphEdge;
  family: WorkspaceGraphFamily | undefined;
  selected: boolean;
}): string {
  return [
    "setta-workspace-graph-edge",
    family?.pattern && family.pattern !== "solid"
      ? `setta-workspace-graph-edge--${family.pattern}`
      : null,
    selected ? "setta-workspace-graph-edge--selected" : null,
    edge.status && edge.status !== "idle"
      ? `setta-workspace-graph-edge--${edge.status}`
      : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function consumeGraphKeyboardEvent(event: {
  preventDefault: () => void;
  stopPropagation: () => void;
}): void {
  event.preventDefault();
  event.stopPropagation();
}

function isGraphEdgeActivationKey(key: string): boolean {
  return key === "Enter" || key === " ";
}

function isGraphEdgeDeletionKey(key: string): boolean {
  return key === "Delete" || key === "Backspace";
}

function canClearGraphEdgeSelection(
  graph: ActiveWorkspaceGraph,
  canSelect: boolean,
): boolean {
  return canSelect && graph.snapshot.selectedEdgeIds.size > 0;
}

function canDeleteGraphEdgeSelection(
  graph: ActiveWorkspaceGraph,
  canEditStructure: boolean,
): boolean {
  return (
    canEditStructure &&
    graph.snapshot.onDelete !== undefined &&
    graph.snapshot.selectedEdgeIds.size > 0
  );
}

function isWorkspaceGraphKeyboardTarget(
  event: globalThis.KeyboardEvent,
  rootElement: HTMLElement,
): boolean {
  if (!(event.target instanceof Node)) {
    return false;
  }
  return rootElement.contains(event.target) && !getIsEditableTarget(event);
}

function deleteGraphEdgesKeepingFocus(
  graph: ActiveWorkspaceGraph,
  rootElement: HTMLElement,
  target: EventTarget | null,
): void {
  const focusedEdgeId =
    target instanceof SVGElement
      ? target.closest<SVGElement>("[data-edge-id]")?.dataset.edgeId
      : undefined;
  const deletesFocus =
    focusedEdgeId !== undefined &&
    graph.snapshot.selectedEdgeIds.has(focusedEdgeId);
  graph.deleteSelectedEdges();
  if (deletesFocus) {
    (
      rootElement.querySelector<HTMLElement>(".react-flow__pane") ?? rootElement
    ).focus({ preventScroll: true });
  }
}

function WorkspaceGraphEdgeLabel({
  label,
  x,
  y,
}: {
  label: string | undefined;
  x: number;
  y: number;
}) {
  const textRef = useRef<SVGTextElement>(null);
  const [bounds, setBounds] =
    useState<WorkspaceGraphLabelBounds>(EMPTY_LABEL_BOUNDS);

  useEffect(() => {
    const textElement = textRef.current;
    if (!textElement || typeof textElement.getBBox !== "function") {
      return;
    }
    const nextBounds = textElement.getBBox();
    setBounds({ height: nextBounds.height, width: nextBounds.width });
  }, [label]);

  if (!label) {
    return null;
  }
  return (
    <g
      className="setta-workspace-graph-edge-label"
      transform={`translate(${x - bounds.width / 2} ${y - bounds.height / 2})`}
      visibility={bounds.width ? "visible" : "hidden"}
    >
      <rect
        className="setta-workspace-graph-edge-label-background"
        height={bounds.height + 8}
        rx={2}
        ry={2}
        width={bounds.width + 4}
        x={-2}
        y={-4}
      />
      <text
        className="setta-workspace-graph-edge-label-text"
        dy="0.3em"
        ref={textRef}
        y={bounds.height / 2}
      >
        {label}
      </text>
    </g>
  );
}

function WorkspaceGraphEdgePath({
  clips,
  edge,
  geometry,
}: {
  clips: WorkspaceGraphClips;
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
  const family = activeGraph.snapshot.families.get(edge.family);
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
    if (!isGraphEdgeActivationKey(event.key) || !canSelect) {
      return;
    }
    consumeGraphKeyboardEvent(event);
    activeGraph.selectEdge(edge.id, event.metaKey || event.ctrlKey);
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
      className={getWorkspaceGraphEdgeClassName({ edge, family, selected })}
      data-edge-family={edge.family}
      data-edge-id={edge.id}
      data-testid={`workspace-graph-edge-${edge.id}`}
      onClick={onClick}
      onKeyDown={onKeyDown}
      role={canSelect ? "button" : undefined}
      style={getWorkspaceGraphFamilyStyle(family)}
      tabIndex={canSelect ? 0 : -1}
    >
      <path
        className="setta-workspace-graph-edge-path"
        clipPath={clips.paint}
        d={bezier.path}
        fill="none"
      />
      <path
        className="setta-workspace-graph-edge-interaction"
        clipPath={clips.hit}
        d={bezier.path}
        fill="none"
        stroke="transparent"
        strokeWidth={10}
      />
      <WorkspaceGraphEdgeLabel
        label={edge.label}
        x={bezier.labelX}
        y={bezier.labelY}
      />
      {canReconnect ? (
        <>
          <circle
            clipPath={clips.hit}
            cx={sourceGeometry.point.x}
            cy={sourceGeometry.point.y}
            data-workspace-graph-reconnect="source"
            fill="transparent"
            onPointerDown={(event) => onReconnectPointerDown(event, "source")}
            r={10}
            stroke="transparent"
          />
          <circle
            clipPath={clips.hit}
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

type WorkspaceGraphConnectionPreviewEndpoints = Readonly<{
  source: WorkspaceGraphPoint;
  sourceSide: WorkspaceGraphPortSide;
  target: WorkspaceGraphPoint;
  targetSide: WorkspaceGraphPortSide;
}>;

function getDefaultConnectionPreviewEndpoints(
  originPort: WorkspaceGraphPort,
  origin: WorkspaceGraphPoint,
  pointerPoint: WorkspaceGraphPoint,
): WorkspaceGraphConnectionPreviewEndpoints {
  const sourceSide = getWorkspaceGraphPortSide(originPort);
  return {
    source: origin,
    sourceSide,
    target: pointerPoint,
    targetSide: getOppositeSide(sourceSide),
  };
}

function getConnectPreviewEndpoints(
  graph: ActiveWorkspaceGraph,
  originPort: WorkspaceGraphPort,
  origin: WorkspaceGraphPoint,
  pointerPoint: WorkspaceGraphPoint,
  fallback: WorkspaceGraphConnectionPreviewEndpoints,
): WorkspaceGraphConnectionPreviewEndpoints {
  if (graph.gesture?.kind !== "connect" || originPort.type !== "target") {
    return fallback;
  }
  const targetSide = getWorkspaceGraphPortSide(originPort);
  return {
    source: pointerPoint,
    sourceSide: getOppositeSide(targetSide),
    target: origin,
    targetSide,
  };
}

function getReconnectPreviewEndpoints(
  graph: ActiveWorkspaceGraph,
  geometry: WorkspaceGraphGeometry,
  pointerPoint: WorkspaceGraphPoint,
  fallback: WorkspaceGraphConnectionPreviewEndpoints,
): WorkspaceGraphConnectionPreviewEndpoints {
  if (graph.gesture?.kind !== "reconnect") {
    return fallback;
  }
  const fixedPort = graph.snapshot.portsById.get(graph.gesture.fixedPortId);
  const fixed = fixedPort ? geometry.ports.get(fixedPort.id)?.point : undefined;
  if (!fixedPort || !fixed) {
    return fallback;
  }
  const fixedSide = getWorkspaceGraphPortSide(fixedPort);
  if (fixedPort.type === "source") {
    return {
      source: fixed,
      sourceSide: fixedSide,
      target: pointerPoint,
      targetSide: getOppositeSide(fixedSide),
    };
  }
  return {
    source: pointerPoint,
    sourceSide: getOppositeSide(fixedSide),
    target: fixed,
    targetSide: fixedSide,
  };
}

function getConnectionPreviewEndpoints(
  graph: ActiveWorkspaceGraph,
  geometry: WorkspaceGraphGeometry,
  originPort: WorkspaceGraphPort,
  origin: WorkspaceGraphPoint,
  pointerPoint: WorkspaceGraphPoint,
): WorkspaceGraphConnectionPreviewEndpoints {
  const fallback = getDefaultConnectionPreviewEndpoints(
    originPort,
    origin,
    pointerPoint,
  );
  const connect = getConnectPreviewEndpoints(
    graph,
    originPort,
    origin,
    pointerPoint,
    fallback,
  );
  return getReconnectPreviewEndpoints(graph, geometry, pointerPoint, connect);
}

function WorkspaceGraphConnectionPreview({
  clipPath,
  geometry,
  rootElement,
}: {
  clipPath: string;
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
  const { source, sourceSide, target, targetSide } =
    getConnectionPreviewEndpoints(
      graph,
      geometry,
      originPort,
      origin,
      pointerPoint,
    );
  const bezier = getWorkspaceGraphBezier(
    source,
    sourceSide,
    target,
    targetSide,
  );
  return (
    <path
      className="setta-workspace-graph-connection-preview"
      clipPath={clipPath}
      d={bezier.path}
      data-testid="workspace-graph-connection-preview"
      fill="none"
      style={getWorkspaceGraphFamilyStyle(
        graph.snapshot.families.get(originPort.family),
      )}
    />
  );
}

function getWorkspaceGraphGeometry(
  graph: ActiveWorkspaceGraph,
  rootElement: HTMLElement,
  transform: readonly [number, number, number],
): WorkspaceGraphGeometry {
  const rootRect = getRootRect(rootElement);
  const ports = new Map<string, WorkspaceGraphPortGeometry>();
  for (const port of graph.snapshot.ports) {
    const element = getWorkspaceGraphPortElement(rootElement, port.id);
    const center = element
      ? getWorkspaceGraphElementCenter(element.getBoundingClientRect())
      : null;
    if (
      !element ||
      !center ||
      isOutsideBoundedGroupScroll(
        element,
        center,
        PORT_DOT_HALF_SIZE * transform[2],
      )
    ) {
      continue;
    }
    ports.set(port.id, {
      point: getWorkspaceGraphViewportPoint(center, rootRect, transform),
      side: getWorkspaceGraphPortSide(port),
    });
  }
  return {
    height: rootRect.height,
    ports,
    width: rootRect.width,
  };
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
    const next = getWorkspaceGraphGeometry(graph, rootElement, transform);
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
    rootElement.addEventListener("scroll", scheduleGeometryRefresh, true);
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("resize", scheduleGeometryRefresh);
      rootElement.removeEventListener("scroll", scheduleGeometryRefresh, true);
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
      if (!isWorkspaceGraphKeyboardTarget(event, rootElement)) {
        return;
      }
      if (event.key === "Escape") {
        const canSelect = graph.snapshot.onSelectedEdgeIdsChange !== undefined;
        if (!canClearGraphEdgeSelection(graph, canSelect)) {
          return;
        }
        consumeGraphKeyboardEvent(event);
        graph.clearSelection();
        return;
      }
      if (
        !isGraphEdgeDeletionKey(event.key) ||
        !canDeleteGraphEdgeSelection(graph, canEditStructure)
      ) {
        return;
      }
      consumeGraphKeyboardEvent(event);
      deleteGraphEdgesKeepingFocus(graph, rootElement, event.target);
    };
    rootElement.addEventListener("keydown", onKeyDown);
    return () => rootElement.removeEventListener("keydown", onKeyDown);
  }, [canEditStructure, graph, rootElement]);

  const layerRef = useRef<SVGSVGElement>(null);
  const hasGraph = graph !== null;
  useEffect(
    () =>
      hasGraph && rootElement
        ? yieldGraphToControls(rootElement, () => layerRef.current)
        : undefined,
    [hasGraph, rootElement],
  );
  const clipId = `setta-workspace-graph-${useId().replace(/[^\w-]/gu, "")}`;
  const clips = useMemo<WorkspaceGraphClips>(
    () => ({ hit: `url(#${clipId}-hit)`, paint: `url(#${clipId}-paint)` }),
    [clipId],
  );
  const holes = useMemo(
    () => ({
      hit: getPortHolesPath(geometry.ports, PORT_TARGET_HALF_SIZE),
      paint: getPortHolesPath(geometry.ports, PORT_DOT_HALF_SIZE),
    }),
    [geometry.ports],
  );
  const renderedEdges = useMemo(
    () =>
      graph?.snapshot.edges.map((edge) => (
        <WorkspaceGraphEdgePath
          clips={clips}
          edge={edge}
          geometry={geometry}
          key={edge.id}
        />
      )) ?? [],
    [clips, geometry, graph],
  );
  if (!graph || !rootElement || geometry.width <= 0 || geometry.height <= 0) {
    return null;
  }
  return (
    <svg
      aria-label="Workspace graph"
      ref={layerRef}
      className="setta-workspace-graph-layer"
      height={geometry.height}
      role="group"
      width={geometry.width}
    >
      <defs>
        <clipPath id={`${clipId}-paint`}>
          <path clipRule="evenodd" d={holes.paint} />
        </clipPath>
        <clipPath id={`${clipId}-hit`}>
          <path clipRule="evenodd" d={holes.hit} />
        </clipPath>
      </defs>
      {renderedEdges}
      <WorkspaceGraphConnectionPreview
        clipPath={clips.paint}
        geometry={geometry}
        rootElement={rootElement}
      />
    </svg>
  );
}
