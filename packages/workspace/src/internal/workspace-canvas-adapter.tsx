import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  useViewport,
  ViewportPortal,
  type Node,
  type NodeProps,
  type NodeTypes,
  type OnNodesChange,
  type Viewport,
} from "@xyflow/react";
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import type {
  WorkspaceController,
  WorkspaceDocument,
  WorkspaceGestureOptions,
  WorkspaceJsonValue,
  WorkspaceViewport,
} from "../core.js";
import type {
  WorkspaceMinimapPlacement,
  WorkspaceOverlayPlacement,
  WorkspaceToolbarControl,
  WorkspaceToolbarControlPlacement,
} from "../react.js";
import { WorkspaceGeometryIndex } from "./geometry-index.js";
import { createWorkspaceCanvasGesturePolicy } from "./workspace-canvas-gesture-policy.js";
import { projectWorkspaceCanvasRoots, type WorkspaceCanvasRoot } from "./workspace-canvas-model.js";
import {
  createWorkspaceCanvasController,
  type WorkspaceCanvasController,
} from "./workspace-canvas-navigation.js";
import { WorkspaceGeometryMeasurements } from "./workspace-geometry-service.js";
import type { ResolvedWorkspaceGridOptions } from "./workspace-preferences.js";
import { WorkspaceViewportLifecycle } from "./workspace-viewport-lifecycle.js";
import {
  workspaceViewportsMatch,
  WorkspaceViewportSynchronizer,
} from "./workspace-viewport-synchronizer.js";

export const WORKSPACE_NO_PAN_CLASS_NAME = "setta-workspace-internal-no-pan";
export const WORKSPACE_NO_WHEEL_CLASS_NAME = "setta-workspace-internal-no-wheel";

type WorkspaceRootNodeData = {
  geometry: WorkspaceGeometryMeasurements;
  kind: string;
  order: number;
  sectionId: string;
  title: string;
};

type WorkspaceRootNode = Node<WorkspaceRootNodeData, "workspace-root-shell">;

export type WorkspaceCanvasAdapterProps<TSectionData = WorkspaceJsonValue> = Readonly<{
  ariaLabel: string;
  document: WorkspaceDocument<TSectionData>;
  emptyState: ReactNode;
  gestureOptions: WorkspaceGestureOptions;
  gridOptions: ResolvedWorkspaceGridOptions;
  minimapPlacement: WorkspaceMinimapPlacement;
  minimapVisible: boolean;
  onCanvasControllerChange(controller: WorkspaceCanvasController | null): void;
  onGridSnapChange(value: boolean): void;
  onMinimapVisibilityChange(value: boolean): void;
  onViewportCommit(viewport: WorkspaceViewport): void;
  overlaySlots: Partial<Record<WorkspaceOverlayPlacement, ReactNode>>;
  toolbarControls: readonly WorkspaceToolbarControl<TSectionData>[];
  workspaceController: WorkspaceController<TSectionData>;
}>;

function WorkspaceRootShell({ data }: NodeProps<WorkspaceRootNode>) {
  const registerElement = useCallback(
    (element: HTMLElement | null) => {
      if (!element) {
        return;
      }
      return data.geometry.register({
        depth: 0,
        element,
        order: data.order,
        parentSectionId: null,
        sectionId: data.sectionId,
      });
    },
    [data.geometry, data.order, data.sectionId],
  );

  return (
    <article
      aria-label={data.title}
      className="setta-workspace__root-shell"
      data-workspace-section-id={data.sectionId}
      ref={registerElement}
      tabIndex={-1}
    >
      <h2>{data.title}</h2>
      <p>{data.kind}</p>
    </article>
  );
}

function rootShellPropsMatch(
  left: Readonly<NodeProps<WorkspaceRootNode>>,
  right: Readonly<NodeProps<WorkspaceRootNode>>,
): boolean {
  return (
    left.data.geometry === right.data.geometry &&
    left.data.kind === right.data.kind &&
    left.data.order === right.data.order &&
    left.data.sectionId === right.data.sectionId &&
    left.data.title === right.data.title
  );
}

const MemoizedWorkspaceRootShell = memo(WorkspaceRootShell, rootShellPropsMatch);
const workspaceNodeTypes = {
  "workspace-root-shell": MemoizedWorkspaceRootShell,
} satisfies NodeTypes;

function rootNode(
  root: WorkspaceCanvasRoot,
  geometry: WorkspaceGeometryMeasurements,
): WorkspaceRootNode {
  return {
    ariaLabel: root.title,
    data: {
      geometry,
      kind: root.kind,
      order: root.order,
      sectionId: root.sectionId,
      title: root.title,
    },
    draggable: false,
    focusable: false,
    height: root.size.height,
    id: root.sectionId,
    position: { ...root.position },
    selectable: false,
    type: "workspace-root-shell",
    width: root.size.width,
  };
}

function projectNodes<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  geometry: WorkspaceGeometryMeasurements,
): WorkspaceRootNode[] {
  return projectWorkspaceCanvasRoots(document).map((root) => rootNode(root, geometry));
}

function synchronizeNodes(
  current: readonly WorkspaceRootNode[],
  projected: readonly WorkspaceRootNode[],
): WorkspaceRootNode[] {
  const currentById = new Map(current.map((node) => [node.id, node]));
  return projected.map((node) => {
    const existing = currentById.get(node.id);
    return existing
      ? {
          ...existing,
          ...node,
          data: node.data,
          position: { ...node.position },
        }
      : node;
  });
}

function backgroundVariant(pattern: ResolvedWorkspaceGridOptions["pattern"]): BackgroundVariant {
  if (pattern === "cross") {
    return BackgroundVariant.Cross;
  }
  if (pattern === "lines") {
    return BackgroundVariant.Lines;
  }
  return BackgroundVariant.Dots;
}

function WorkspaceGridBackground({
  canvasId,
  gridOptions,
  snapGrid,
}: Readonly<{
  canvasId: string;
  gridOptions: ResolvedWorkspaceGridOptions;
  snapGrid: [number, number];
}>) {
  const { zoom } = useViewport();
  return (
    <div aria-hidden="true" className="setta-workspace__grid">
      <Background
        bgColor="var(--setta-workspace-canvas-background)"
        color="var(--setta-workspace-grid-color)"
        gap={snapGrid}
        id={`${canvasId}-grid`}
        lineWidth={gridOptions.markSize * zoom}
        size={gridOptions.markSize}
        variant={backgroundVariant(gridOptions.pattern)}
      />
    </div>
  );
}

type ResolvedToolbarControl = Readonly<{
  ariaControls?: string;
  disabled: boolean;
  icon: ReactNode;
  id: string;
  label: string;
  onPress(): void;
  placement: WorkspaceToolbarControlPlacement;
  pressed?: boolean;
  source: "built-in" | "host";
}>;

type ToolbarControlGroup = Readonly<{
  controls: readonly ResolvedToolbarControl[];
  label: string;
  placement: WorkspaceToolbarControlPlacement;
}>;

const toolbarPlacements = [
  "project",
  "viewport",
  "utility",
] as const satisfies readonly WorkspaceToolbarControlPlacement[];

function ToolbarIcon({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <svg
      aria-hidden="true"
      className="setta-workspace__toolbar-icon"
      fill="none"
      focusable="false"
      viewBox="0 0 20 20"
    >
      {children}
    </svg>
  );
}

function ZoomInIcon() {
  return (
    <ToolbarIcon>
      <path d="M10 4.5v11M4.5 10h11" />
    </ToolbarIcon>
  );
}

function ZoomOutIcon() {
  return (
    <ToolbarIcon>
      <path d="M4.5 10h11" />
    </ToolbarIcon>
  );
}

function ResetZoomIcon() {
  return (
    <ToolbarIcon>
      <circle cx="10" cy="10" r="5.25" />
      <path d="M10 7.25v5.5M7.25 10h5.5" />
    </ToolbarIcon>
  );
}

function FitSectionsIcon() {
  return (
    <ToolbarIcon>
      <path d="M7.25 4.5H4.5v2.75M12.75 4.5h2.75v2.75M7.25 15.5H4.5v-2.75M12.75 15.5h2.75v-2.75" />
    </ToolbarIcon>
  );
}

function SnapGridIcon() {
  return (
    <ToolbarIcon>
      <circle cx="5" cy="5" r="1" />
      <circle cx="15" cy="5" r="1" />
      <circle cx="5" cy="15" r="1" />
      <circle cx="15" cy="15" r="1" />
      <path d="M8 10h4M10 8v4" />
    </ToolbarIcon>
  );
}

function MinimapIcon() {
  return (
    <ToolbarIcon>
      <rect height="11" rx="1.5" width="14" x="3" y="4.5" />
      <rect height="2.5" rx="0.5" width="3.5" x="5" y="7" />
      <rect height="3" rx="0.5" width="4" x="11" y="10.5" />
    </ToolbarIcon>
  );
}

const TOOLBAR_ZOOM_FACTOR = 1.2;

function centeredZoomViewport(
  viewport: WorkspaceViewport,
  zoom: number,
  width: number,
  height: number,
): WorkspaceViewport {
  const scale = zoom / viewport.zoom;
  const centerX = width / 2;
  const centerY = height / 2;
  return {
    x: centerX - (centerX - viewport.x) * scale,
    y: centerY - (centerY - viewport.y) * scale,
    zoom,
  };
}

function toolbarFocusTarget(
  enabledIds: readonly string[],
  currentId: string | null,
  key: string,
): string | null {
  if (enabledIds.length === 0) {
    return null;
  }
  const boundaryIds: Readonly<Record<string, string | undefined>> = {
    End: enabledIds.at(-1),
    Home: enabledIds[0],
  };
  const boundaryId = boundaryIds[key];
  if (boundaryId) {
    return boundaryId;
  }
  const step: number | undefined = { ArrowDown: 1, ArrowUp: -1 }[key];
  if (step === undefined) {
    return null;
  }
  const currentIndex = Math.max(0, enabledIds.indexOf(currentId ?? ""));
  return enabledIds[(currentIndex + step + enabledIds.length) % enabledIds.length] ?? null;
}

function useToolbarFocus(controls: readonly ResolvedToolbarControl[]) {
  const enabledIds = useMemo(
    () => controls.filter((control) => !control.disabled).map((control) => control.id),
    [controls],
  );
  const enabledSignature = enabledIds.join("\u0000");
  const controlElementsRef = useRef(new Map<string, HTMLButtonElement>());
  const focusedControlRef = useRef<string | null>(null);
  const [tabStopId, setTabStopId] = useState<string | null>(() => enabledIds[0] ?? null);

  useEffect(() => {
    if (tabStopId && enabledIds.includes(tabStopId)) {
      return;
    }
    const nextId = enabledIds[0] ?? null;
    const restoreFocus = focusedControlRef.current === tabStopId;
    setTabStopId(nextId);
    if (restoreFocus && nextId) {
      focusedControlRef.current = nextId;
      controlElementsRef.current.get(nextId)?.focus();
    }
  }, [enabledIds, enabledSignature, tabStopId]);

  const registerControl = useCallback((id: string, element: HTMLButtonElement | null) => {
    if (element) {
      controlElementsRef.current.set(id, element);
    } else {
      controlElementsRef.current.delete(id);
    }
  }, []);
  const handleFocus = useCallback((id: string) => {
    focusedControlRef.current = id;
    setTabStopId(id);
  }, []);
  const handleBlur = useCallback(() => {
    focusedControlRef.current = null;
  }, []);
  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      const targetId = toolbarFocusTarget(
        enabledIds,
        event.currentTarget.dataset.workspaceControlId ?? null,
        event.key,
      );
      if (!targetId) {
        return;
      }
      event.preventDefault();
      focusedControlRef.current = targetId;
      setTabStopId(targetId);
      controlElementsRef.current.get(targetId)?.focus();
    },
    [enabledIds],
  );

  return { handleBlur, handleFocus, handleKeyDown, registerControl, tabStopId };
}

function ToolbarControlButton({
  control,
  keyboard,
}: Readonly<{
  control: ResolvedToolbarControl;
  keyboard: ReturnType<typeof useToolbarFocus>;
}>) {
  const [tooltipDismissed, setTooltipDismissed] = useState(false);
  const handleBlur = () => {
    setTooltipDismissed(false);
    keyboard.handleBlur();
  };
  const handleFocus = () => {
    setTooltipDismissed(false);
    keyboard.handleFocus(control.id);
  };
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setTooltipDismissed(true);
      return;
    }
    keyboard.handleKeyDown(event);
  };
  return (
    <span
      className="setta-workspace__toolbar-item"
      data-tooltip-dismissed={tooltipDismissed ? "true" : undefined}
      onPointerEnter={() => setTooltipDismissed(false)}
      onPointerLeave={() => setTooltipDismissed(false)}
    >
      <button
        aria-controls={control.ariaControls}
        aria-label={control.label}
        aria-pressed={control.pressed}
        className="setta-workspace__toolbar-control"
        data-workspace-control-id={control.id}
        data-workspace-control-placement={control.placement}
        data-workspace-control-source={control.source}
        disabled={control.disabled}
        onBlur={handleBlur}
        onClick={control.onPress}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        ref={(element) => keyboard.registerControl(control.id, element)}
        tabIndex={!control.disabled && keyboard.tabStopId === control.id ? 0 : -1}
        type="button"
      >
        <span aria-hidden="true" className="setta-workspace__toolbar-control-icon">
          {control.icon}
        </span>
      </button>
      <span aria-hidden="true" className="setta-workspace__toolbar-tooltip">
        {control.label}
      </span>
    </span>
  );
}

function toolbarGroups(
  controls: readonly ResolvedToolbarControl[],
): readonly ToolbarControlGroup[] {
  return toolbarPlacements
    .map((placement) => ({
      controls: controls.filter((control) => control.placement === placement),
      label: `${placement[0]?.toUpperCase() ?? ""}${placement.slice(1)} controls`,
      placement,
    }))
    .filter((group) => group.controls.length > 0);
}

function WorkspaceToolbar<TSectionData>({
  ariaLabel,
  canvasId,
  controller,
  gestureOptions,
  gridSnap,
  minimapId,
  minimapVisible,
  onGridSnapChange,
  onMinimapVisibilityChange,
  sectionIds,
  toolbarControls,
}: Readonly<{
  ariaLabel: string;
  canvasId: string;
  controller: WorkspaceController<TSectionData>;
  gestureOptions: WorkspaceGestureOptions;
  gridSnap: boolean;
  minimapId: string;
  minimapVisible: boolean;
  onGridSnapChange(value: boolean): void;
  onMinimapVisibilityChange(value: boolean): void;
  sectionIds: readonly string[];
  toolbarControls: readonly WorkspaceToolbarControl<TSectionData>[];
}>) {
  const viewport = useViewport();
  const pendingViewportRef = useRef<WorkspaceViewport | null>(null);
  useEffect(() => {
    const pendingViewport = pendingViewportRef.current;
    if (pendingViewport && workspaceViewportsMatch(pendingViewport, viewport)) {
      pendingViewportRef.current = null;
    }
  }, [viewport]);
  const changeZoom = useCallback(
    (resolveZoom: (zoom: number) => number) => {
      const currentViewport = pendingViewportRef.current ?? viewport;
      const zoom = Math.min(
        gestureOptions.maxZoom,
        Math.max(gestureOptions.minZoom, resolveZoom(currentViewport.zoom)),
      );
      if (Math.abs(zoom - currentViewport.zoom) < 0.000_001) {
        return;
      }
      const canvasElement = document.getElementById(canvasId);
      if (!canvasElement) {
        throw new Error("Workspace toolbar requires its mounted canvas element.");
      }
      const bounds = canvasElement.getBoundingClientRect();
      const nextViewport = centeredZoomViewport(currentViewport, zoom, bounds.width, bounds.height);
      pendingViewportRef.current = nextViewport;
      controller.setViewport(nextViewport);
    },
    [canvasId, controller, gestureOptions.maxZoom, gestureOptions.minZoom, viewport],
  );
  const zoom = viewport.zoom;
  const resetZoom = Math.min(gestureOptions.maxZoom, Math.max(gestureOptions.minZoom, 1));
  const zoomMatchesReset = Math.abs(zoom - resetZoom) < 0.000_001;
  const builtInControls = useMemo<readonly ResolvedToolbarControl[]>(
    () => [
      {
        disabled: zoom >= gestureOptions.maxZoom,
        icon: <ZoomInIcon />,
        id: "zoom-in",
        label: "Zoom in",
        onPress: () => changeZoom((currentZoom) => currentZoom * TOOLBAR_ZOOM_FACTOR),
        placement: "viewport",
        source: "built-in",
      },
      {
        disabled: zoom <= gestureOptions.minZoom,
        icon: <ZoomOutIcon />,
        id: "zoom-out",
        label: "Zoom out",
        onPress: () => changeZoom((currentZoom) => currentZoom / TOOLBAR_ZOOM_FACTOR),
        placement: "viewport",
        source: "built-in",
      },
      {
        disabled: zoomMatchesReset,
        icon: <ResetZoomIcon />,
        id: "reset-zoom",
        label: "Reset zoom",
        onPress: () => changeZoom(() => resetZoom),
        placement: "viewport",
        source: "built-in",
      },
      {
        disabled: sectionIds.length === 0,
        icon: <FitSectionsIcon />,
        id: "fit-sections",
        label: "Fit sections",
        onPress: () => void controller.fitSections(sectionIds),
        placement: "viewport",
        source: "built-in",
      },
      {
        disabled: false,
        icon: <SnapGridIcon />,
        id: "snap-to-grid",
        label: "Snap to grid",
        onPress: () => onGridSnapChange(!gridSnap),
        placement: "viewport",
        pressed: gridSnap,
        source: "built-in",
      },
      {
        ariaControls: minimapId,
        disabled: false,
        icon: <MinimapIcon />,
        id: "show-minimap",
        label: "Show minimap",
        onPress: () => onMinimapVisibilityChange(!minimapVisible),
        placement: "utility",
        pressed: minimapVisible,
        source: "built-in",
      },
    ],
    [
      controller,
      changeZoom,
      gestureOptions.maxZoom,
      gestureOptions.minZoom,
      gridSnap,
      minimapId,
      minimapVisible,
      onGridSnapChange,
      onMinimapVisibilityChange,
      resetZoom,
      sectionIds,
      zoom,
      zoomMatchesReset,
    ],
  );
  const hostControls = useMemo<readonly ResolvedToolbarControl[]>(
    () =>
      toolbarControls.map((control) => ({
        disabled: control.disabled ?? false,
        icon: control.icon,
        id: control.id,
        label: control.label,
        onPress: () => control.onPress(controller),
        placement: control.placement,
        ...(control.pressed === undefined ? {} : { pressed: control.pressed }),
        source: "host" as const,
      })),
    [controller, toolbarControls],
  );
  const orderedControls = useMemo(
    () => [
      ...hostControls.filter((control) => control.placement === "project"),
      ...builtInControls.filter((control) => control.placement === "viewport"),
      ...hostControls.filter((control) => control.placement === "viewport"),
      ...hostControls.filter((control) => control.placement === "utility"),
      ...builtInControls.filter((control) => control.placement === "utility"),
    ],
    [builtInControls, hostControls],
  );
  const keyboard = useToolbarFocus(orderedControls);
  const groups = toolbarGroups(orderedControls);

  return (
    <div
      aria-label={`${ariaLabel} controls`}
      aria-orientation="vertical"
      className={`setta-workspace__toolbar ${WORKSPACE_NO_PAN_CLASS_NAME} ${WORKSPACE_NO_WHEEL_CLASS_NAME}`}
      role="toolbar"
    >
      {groups.map((group) => (
        <div
          aria-label={group.label}
          className="setta-workspace__toolbar-group"
          data-workspace-control-group={group.placement}
          key={group.placement}
          role="group"
        >
          {group.controls.map((control) => (
            <ToolbarControlButton control={control} keyboard={keyboard} key={control.id} />
          ))}
        </div>
      ))}
    </div>
  );
}

function hasOverlayContent(value: ReactNode): boolean {
  return value !== null && value !== undefined && value !== false;
}

function WorkspaceFixedOverlay({
  children,
  placement,
}: Readonly<{
  children: ReactNode;
  placement: Exclude<WorkspaceOverlayPlacement, "canvas">;
}>) {
  if (!hasOverlayContent(children)) {
    return null;
  }
  return (
    <div
      className={`setta-workspace__overlay setta-workspace__overlay--${placement} ${WORKSPACE_NO_PAN_CLASS_NAME} ${WORKSPACE_NO_WHEEL_CLASS_NAME}`}
      data-workspace-overlay-placement={placement}
    >
      {children}
    </div>
  );
}

function WorkspaceMinimap({
  ariaLabel,
  id,
  placement,
}: Readonly<{
  ariaLabel: string;
  id: string;
  placement: WorkspaceMinimapPlacement;
}>) {
  return (
    <div data-workspace-minimap-placement={placement} id={id}>
      <MiniMap<WorkspaceRootNode>
        ariaLabel={`${ariaLabel} minimap`}
        bgColor="var(--setta-workspace-minimap-background)"
        className={`setta-workspace__minimap ${WORKSPACE_NO_PAN_CLASS_NAME} ${WORKSPACE_NO_WHEEL_CLASS_NAME}`}
        maskColor="color-mix(in oklch, var(--setta-workspace-canvas-background) 72%, transparent)"
        maskStrokeColor="var(--setta-workspace-selection)"
        maskStrokeWidth={2}
        nodeBorderRadius={6}
        nodeColor="var(--setta-workspace-section-background)"
        nodeStrokeColor="var(--setta-workspace-section-muted-text)"
        pannable={false}
        position={placement === "left" ? "bottom-left" : "bottom-right"}
        zoomable={false}
      />
    </div>
  );
}

function viewportFromUpstream(viewport: Viewport): WorkspaceViewport {
  return { x: viewport.x, y: viewport.y, zoom: viewport.zoom };
}

function advanceViewportLifecycle(
  lifecycle: WorkspaceViewportLifecycle,
  viewport: WorkspaceViewport,
  programmaticViewport: WorkspaceViewport | null,
  event: MouseEvent | TouchEvent | null,
  phase: "begin" | "update",
) {
  if (!event && programmaticViewport) {
    lifecycle.synchronize(viewport);
    return;
  }
  if (phase === "begin") {
    if (lifecycle.isActive()) {
      lifecycle.update(viewport);
    } else {
      lifecycle.begin(viewport);
    }
    return;
  }
  lifecycle.update(viewport);
}

export function WorkspaceCanvasAdapter<TSectionData = WorkspaceJsonValue>({
  ariaLabel,
  document,
  emptyState,
  gestureOptions,
  gridOptions,
  minimapPlacement,
  minimapVisible,
  onCanvasControllerChange,
  onGridSnapChange,
  onMinimapVisibilityChange,
  onViewportCommit,
  overlaySlots,
  toolbarControls,
  workspaceController,
}: WorkspaceCanvasAdapterProps<TSectionData>) {
  const reactId = useId();
  const canvasId = `setta-workspace-canvas-${reactId.replaceAll(":", "")}`;
  const minimapId = `${canvasId}-minimap`;
  const geometryIndex = useMemo(() => new WorkspaceGeometryIndex(), []);
  const geometryRef = useRef<WorkspaceGeometryMeasurements | null>(null);
  geometryRef.current ??= new WorkspaceGeometryMeasurements(geometryIndex, document.viewport);
  const geometry = geometryRef.current;
  const gestureOptionsRef = useRef(gestureOptions);
  gestureOptionsRef.current = gestureOptions;
  const canvasController = useMemo(
    () =>
      createWorkspaceCanvasController(geometry, () => ({
        maxZoom: gestureOptionsRef.current.maxZoom,
        minZoom: gestureOptionsRef.current.minZoom,
      })),
    [geometry],
  );
  const projectedNodes = useMemo(() => projectNodes(document, geometry), [document, geometry]);
  const [nodes, setNodes] = useState<WorkspaceRootNode[]>(projectedNodes);
  const [viewportSynchronizationRevision, setViewportSynchronizationRevision] = useState(0);
  const lifecycleRef = useRef<WorkspaceViewportLifecycle | null>(null);
  lifecycleRef.current ??= new WorkspaceViewportLifecycle(document.viewport);
  const lifecycle = lifecycleRef.current;
  const programmaticViewportRef = useRef<WorkspaceViewport | null>(null);
  const canvasMountedRef = useRef(false);
  const canvasGesturePolicy = useMemo(
    () => createWorkspaceCanvasGesturePolicy(gestureOptions),
    [gestureOptions],
  );
  const snapGrid = useMemo<[number, number]>(
    () => [gridOptions.spacing[0], gridOptions.spacing[1]],
    [gridOptions.spacing],
  );
  const sectionIds = useMemo(
    () => document.rootSections.map((root) => root.sectionId),
    [document.rootSections],
  );

  useEffect(() => {
    setNodes((current) => synchronizeNodes(current, projectedNodes));
    geometry.requestMeasurement();
  }, [geometry, projectedNodes]);

  useEffect(() => {
    onCanvasControllerChange(canvasController);
    return () => onCanvasControllerChange(null);
  }, [canvasController, onCanvasControllerChange]);

  const handleNodesChange = useCallback<OnNodesChange<WorkspaceRootNode>>(
    (changes) => {
      setNodes((current) => applyNodeChanges(changes, current));
      geometry.requestMeasurement();
    },
    [geometry],
  );
  const handleCanvasElement = useCallback(
    (element: HTMLDivElement | null) => {
      canvasMountedRef.current = element !== null;
      if (!element) {
        const baseline = lifecycle.cancel();
        if (baseline) {
          geometry.setViewport(baseline);
        }
        programmaticViewportRef.current = null;
      }
      geometry.setCanvasElement(element);
    },
    [geometry, lifecycle],
  );
  const handleMoveStart = useCallback(
    (event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
      if (!canvasMountedRef.current) {
        return;
      }
      if (event) {
        programmaticViewportRef.current = null;
      }
      const nextViewport = viewportFromUpstream(viewport);
      geometry.setViewport(nextViewport);
      advanceViewportLifecycle(
        lifecycle,
        nextViewport,
        programmaticViewportRef.current,
        event,
        "begin",
      );
    },
    [geometry, lifecycle],
  );
  const handleMove = useCallback(
    (event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
      if (!canvasMountedRef.current) {
        return;
      }
      const nextViewport = viewportFromUpstream(viewport);
      geometry.setViewport(nextViewport);
      advanceViewportLifecycle(
        lifecycle,
        nextViewport,
        programmaticViewportRef.current,
        event,
        "update",
      );
    },
    [geometry, lifecycle],
  );
  const handleMoveEnd = useCallback(
    (event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
      if (!canvasMountedRef.current) {
        return;
      }
      const nextViewport = viewportFromUpstream(viewport);
      if (!event) {
        if (
          workspaceViewportsMatch(programmaticViewportRef.current ?? nextViewport, nextViewport)
        ) {
          if (!lifecycle.isActive()) {
            geometry.completeViewport(nextViewport);
            lifecycle.synchronize(nextViewport);
          }
          programmaticViewportRef.current = null;
        }
        return;
      }
      if (!workspaceViewportsMatch(lifecycle.current(), nextViewport)) {
        return;
      }
      geometry.setViewport(nextViewport);
      const completed = lifecycle.complete(nextViewport);
      setViewportSynchronizationRevision((current) => current + 1);
      if (completed) {
        onViewportCommit(completed);
      }
    },
    [geometry, lifecycle, onViewportCommit],
  );

  return (
    <ReactFlow<WorkspaceRootNode>
      aria-label={`${ariaLabel} canvas`}
      autoPanOnNodeFocus={false}
      className="setta-workspace__canvas"
      data-workspace-grid-pattern={gridOptions.pattern}
      data-workspace-grid-snap={gridOptions.snap ? "true" : "false"}
      data-workspace-grid-spacing={gridOptions.spacing.join(" ")}
      data-workspace-grid-visible={gridOptions.visible ? "true" : "false"}
      data-workspace-pan-on-scroll-mode={gestureOptions.panOnScrollMode}
      data-workspace-pan-on-scroll-speed={gestureOptions.panOnScrollSpeed}
      defaultViewport={document.viewport}
      deleteKeyCode={null}
      disableKeyboardA11y
      edges={[]}
      edgesFocusable={false}
      elementsSelectable={false}
      id={canvasId}
      maxZoom={canvasGesturePolicy.maxZoom}
      minZoom={canvasGesturePolicy.minZoom}
      multiSelectionKeyCode={null}
      noPanClassName={WORKSPACE_NO_PAN_CLASS_NAME}
      noWheelClassName={WORKSPACE_NO_WHEEL_CLASS_NAME}
      nodeTypes={workspaceNodeTypes}
      nodes={nodes}
      nodesConnectable={false}
      nodesDraggable={false}
      nodesFocusable={false}
      onMove={handleMove}
      onMoveEnd={handleMoveEnd}
      onMoveStart={handleMoveStart}
      onNodesChange={handleNodesChange}
      panActivationKeyCode={canvasGesturePolicy.panActivationKeyCode}
      panOnDrag={canvasGesturePolicy.panOnDrag}
      panOnScroll={canvasGesturePolicy.panOnScroll}
      panOnScrollMode={canvasGesturePolicy.panOnScrollMode}
      panOnScrollSpeed={canvasGesturePolicy.panOnScrollSpeed}
      preventScrolling={canvasGesturePolicy.preventScrolling}
      proOptions={{ hideAttribution: false }}
      ref={handleCanvasElement}
      selectionKeyCode={null}
      selectionOnDrag={false}
      snapGrid={snapGrid}
      snapToGrid={gridOptions.snap}
      zoomActivationKeyCode={canvasGesturePolicy.zoomActivationKeyCode}
      zoomOnDoubleClick={canvasGesturePolicy.zoomOnDoubleClick}
      zoomOnPinch={canvasGesturePolicy.zoomOnPinch}
      zoomOnScroll={canvasGesturePolicy.zoomOnScroll}
    >
      {gridOptions.visible ? (
        <WorkspaceGridBackground
          canvasId={canvasId}
          gridOptions={gridOptions}
          snapGrid={snapGrid}
        />
      ) : null}
      {hasOverlayContent(overlaySlots.canvas) ? (
        <ViewportPortal>
          <div className="setta-workspace__host-overlay" data-workspace-overlay-placement="canvas">
            {overlaySlots.canvas}
          </div>
        </ViewportPortal>
      ) : null}
      <div
        className={`setta-workspace__empty-panel ${WORKSPACE_NO_PAN_CLASS_NAME} ${WORKSPACE_NO_WHEEL_CLASS_NAME}`}
        hidden={!hasOverlayContent(emptyState)}
      >
        <div className="setta-workspace__empty">{emptyState}</div>
      </div>
      <WorkspaceFixedOverlay placement="project">{overlaySlots.project}</WorkspaceFixedOverlay>
      <WorkspaceFixedOverlay placement="utility">{overlaySlots.utility}</WorkspaceFixedOverlay>
      <WorkspaceFixedOverlay placement="viewport">{overlaySlots.viewport}</WorkspaceFixedOverlay>
      <WorkspaceToolbar
        ariaLabel={ariaLabel}
        canvasId={canvasId}
        controller={workspaceController}
        gestureOptions={gestureOptions}
        gridSnap={gridOptions.snap}
        minimapId={minimapId}
        minimapVisible={minimapVisible}
        onGridSnapChange={onGridSnapChange}
        onMinimapVisibilityChange={onMinimapVisibilityChange}
        sectionIds={sectionIds}
        toolbarControls={toolbarControls}
      />
      {minimapVisible ? (
        <WorkspaceMinimap ariaLabel={ariaLabel} id={minimapId} placement={minimapPlacement} />
      ) : null}
      <WorkspaceViewportSynchronizer
        geometry={geometry}
        lifecycle={lifecycle}
        programmaticViewportRef={programmaticViewportRef}
        synchronizationRevision={viewportSynchronizationRevision}
        viewport={document.viewport}
      />
    </ReactFlow>
  );
}
