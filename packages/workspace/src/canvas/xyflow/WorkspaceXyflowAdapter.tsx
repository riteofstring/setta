import { ReactFlow, ViewportPortal, useNodesInitialized } from "@xyflow/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { openWorkspacePaneMenu } from "../../context-menu/workspaceMenuInvocation";
import {
  getOwnerKeyboardMenuPoint,
  isWorkspaceMenuKeyboardEvent,
} from "../../context-menu/workspaceMenuOwnership";
import { applyActiveSectionChange } from "../activeSectionController";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
} from "../../document/stores";
import { useWorkspaceCapabilities } from "../../document/capabilities";
import { useDndMode } from "../../dnd/dndState";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
} from "../../interaction";
import { useWorkspaceHost } from "../../workspaceHostContext";
import { getWorkspaceHostDomId } from "../../workspaceHostInternals";
import { useWorkspaceScopeClassName } from "../../styles/workspaceScope";
import {
  CODEMIRROR_TOOLTIP_PARENT_CLASS_NAME,
  useCodeMirrorTooltipParentRef,
} from "../codeMirrorTooltipParent";
import { computeReadyToBeVisible } from "../fitView";
import { useWorkspaceOptions } from "../options";
import { getReactFlowStore, useReactFlow } from "../store";
import type { NodeDragItem } from "../types";
import { WorkspaceBackground } from "../WorkspaceBackground";
import { WorkspaceXyflowNode } from "./WorkspaceXyflowNode";
import { useWorkspaceXyflowNodeDrag } from "./WorkspaceXyflowNodeDrag";
import { WorkspaceXyflowSelection } from "./WorkspaceXyflowSelection";
import { useWorkspaceXyflowWheelBehavior } from "./useWorkspaceXyflowWheelBehavior";
import { createWorkspaceXyflowNodeProjector } from "./workspaceXyflowProjection";
import { registerWorkspaceXyflowInstance } from "./workspaceXyflowRuntime";
import type {
  WorkspaceXyflowNodeChange,
  WorkspaceXyflowNodeDimensions,
  WorkspaceXyflowSectionNode,
  WorkspaceXyflowViewport,
} from "./types";

type WorkspaceXyflowAdapterProps = {
  onDragCommit?: (items: ReadonlyArray<NodeDragItem>) => void;
  onDragStart?: (items: ReadonlyArray<NodeDragItem>) => void;
  onNodeDimensionsChange?: (
    dimensions: ReadonlyArray<WorkspaceXyflowNodeDimensions>,
  ) => void;
  onRuntimeReady?: () => void;
  onViewportChange: (viewport: WorkspaceXyflowViewport) => void;
  renderNodes?: boolean;
  viewport: WorkspaceXyflowViewport;
  wrapperDimensions: { width: number; height: number };
};

const nodeTypes = { workspace: WorkspaceXyflowNode };
const EMPTY_EDGES: [] = [];
const EMPTY_NODES: Array<WorkspaceXyflowSectionNode> = [];
const EMPTY_SECTION_IDS: ReadonlySet<string> = new Set();

function WorkspaceXyflowMeasurementObserver({
  fitPending,
  onNodesInitialized,
}: {
  fitPending: boolean;
  onNodesInitialized: () => void;
}) {
  const nodesInitialized = useNodesInitialized();

  useEffect(() => {
    if (nodesInitialized) {
      onNodesInitialized();
    }
  }, [fitPending, nodesInitialized, onNodesInitialized]);

  return null;
}

type WorkspaceMenuPointerEvent = MouseEvent | ReactMouseEvent;

function allowsMiddleButtonPan(panOnDrag: boolean | Array<number>): boolean {
  return (
    panOnDrag === true || (Array.isArray(panOnDrag) && panOnDrag.includes(1))
  );
}

function sectionIdsMatch(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): boolean {
  return (
    left.size === right.size && Array.from(left).every((id) => right.has(id))
  );
}

export function WorkspaceXyflowAdapter({
  onDragCommit,
  onDragStart,
  onNodeDimensionsChange,
  onRuntimeReady,
  onViewportChange,
  renderNodes = true,
  viewport,
  wrapperDimensions,
}: WorkspaceXyflowAdapterProps) {
  const host = useWorkspaceHost();
  const workspaceScopeClassName = useWorkspaceScopeClassName();
  const selectionKeyPressed = useReactFlow(
    (state) => state.selectionKeyPressed,
  );
  const userSelectionActive = useReactFlow(
    (state) => state.userSelectionActive,
  );
  const panActivationKeyPressed = useReactFlow(
    (state) => state.panActivationKeyPressed,
  );
  const nodeDragThreshold = useReactFlow((state) => state.nodeDragThreshold);
  const readyToBeVisible = useReactFlow(computeReadyToBeVisible);
  const fitPending = useReactFlow(
    (state) => state.fitViewOnInit && !state.fitViewOnInitDone,
  );
  const activeSectionIds = useActiveSections((state) => state.activeIds);
  const canEditLayout = useWorkspaceCapabilities(
    (state) => state.canEditLayout,
  );
  const { isMovingFree, isSorting } = useDndMode();
  const nodes = useNodeInternals((state) => state.x);
  const sections = useWorkspaceDocument((state) => state.sections);
  const [draggingSectionIds, setDraggingSectionIds] =
    useState<ReadonlySet<string>>(EMPTY_SECTION_IDS);
  const projectorRef = useRef<ReturnType<
    typeof createWorkspaceXyflowNodeProjector
  > | null>(null);
  if (projectorRef.current === null) {
    projectorRef.current = createWorkspaceXyflowNodeProjector();
  }
  const projectedNodes = useMemo(
    () =>
      projectorRef.current!({
        activeSectionIds,
        canEditLayout: canEditLayout && !panActivationKeyPressed,
        draggingSectionIds,
        nodes,
        readyToBeVisible,
        sections,
      }),
    [
      activeSectionIds,
      canEditLayout,
      draggingSectionIds,
      nodes,
      panActivationKeyPressed,
      readyToBeVisible,
      sections,
    ],
  );
  const unregisterInstanceRef = useRef<(() => void) | null>(null);
  const rootElementRef = useRef<HTMLDivElement | null>(null);
  const suppressNextPaneClickRef = useRef(false);
  const [rootElement, setRootElement] = useState<HTMLDivElement | null>(null);
  const [rendererElement, setRendererElement] = useState<HTMLDivElement | null>(
    null,
  );
  const tooltipParentRef = useCodeMirrorTooltipParentRef();
  const {
    maxZoom,
    minZoom,
    panOnDrag,
    panOnScroll,
    panOnScrollMode,
    panOnScrollSpeed,
    snapGrid,
    zoomOnDoubleClick,
    zoomOnPinch,
    zoomOnScroll,
  } = useWorkspaceOptions((state) => state);
  const viewportInteractionEnabled = !isSorting && !isMovingFree;
  const effectivePanOnDrag =
    viewportInteractionEnabled && !selectionKeyPressed && !userSelectionActive
      ? panOnDrag
      : false;
  const effectiveWheelOptions = {
    maxZoom,
    minZoom,
    panOnScroll: viewportInteractionEnabled && panOnScroll,
    panOnScrollMode,
    panOnScrollSpeed,
    zoomOnPinch: viewportInteractionEnabled && zoomOnPinch,
    zoomOnScroll: viewportInteractionEnabled && zoomOnScroll,
  };

  useEffect(
    () => () => {
      unregisterInstanceRef.current?.();
      unregisterInstanceRef.current = null;
    },
    [host],
  );

  const handleNodesInitialized = useCallback(() => {
    onRuntimeReady?.();
  }, [onRuntimeReady]);

  const handleDragStateChange = useCallback(
    (items: ReadonlyArray<NodeDragItem>, dragging: boolean) => {
      const nextIds = dragging
        ? new Set(items.map((item) => item.id))
        : EMPTY_SECTION_IDS;
      setDraggingSectionIds((currentIds) =>
        sectionIdsMatch(currentIds, nextIds) ? currentIds : nextIds,
      );
    },
    [],
  );

  const { handleNodeDrag, handleNodeDragStart, handleNodeDragStop } =
    useWorkspaceXyflowNodeDrag({
      host,
      onCommit: onDragCommit,
      onDragStateChange: handleDragStateChange,
      onStart: onDragStart,
    });

  const handleNodesChange = useCallback(
    (changes: Array<WorkspaceXyflowNodeChange>) => {
      const dimensions = changes.flatMap((change) => {
        if (change.type !== "dimensions") {
          return [];
        }
        return [
          {
            id: change.id,
            width: change.dimensions?.width,
            height: change.dimensions?.height,
          },
        ];
      });
      if (dimensions.length > 0) {
        onNodeDimensionsChange?.(dimensions);
      }
    },
    [onNodeDimensionsChange],
  );

  const handlePaneClick = useCallback(() => {
    applyActiveSectionChange(host, { interaction: "pane-click" });
    getReactFlowStore(host).getState().setNodesSelection(0);
  }, [host]);

  const handlePanePointerClick = useCallback(() => {
    if (
      suppressNextPaneClickRef.current ||
      getReactFlowStore(host).getState().selectionKeyPressed
    ) {
      suppressNextPaneClickRef.current = false;
      return;
    }
    handlePaneClick();
  }, [handlePaneClick, host]);

  const handlePaneContextMenu = useCallback(
    (event: WorkspaceMenuPointerEvent) => {
      const pane =
        rootElementRef.current?.querySelector<HTMLDivElement>(
          ".react-flow__pane",
        );
      if (!pane || event.target !== pane) {
        return;
      }
      if (
        !openWorkspacePaneMenu(
          host,
          { x: event.clientX, y: event.clientY },
          pane,
        )
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    },
    [host],
  );

  const handleInit = useCallback(
    (instance: Parameters<typeof registerWorkspaceXyflowInstance>[1]) => {
      unregisterInstanceRef.current?.();
      unregisterInstanceRef.current = registerWorkspaceXyflowInstance(
        host,
        instance,
      );
    },
    [host],
  );

  const handleRootRef = useCallback((element: HTMLDivElement | null) => {
    rootElementRef.current = element;
    setRootElement(element);
  }, []);

  useEffect(() => {
    setRendererElement(
      rootElement?.querySelector<HTMLDivElement>(".react-flow__renderer") ??
        null,
    );
  }, [rootElement]);

  const { onViewportMoveEnd, onViewportMoveStart } =
    useWorkspaceXyflowWheelBehavior({
      host,
      options: effectiveWheelOptions,
      renderer: rendererElement,
      setViewport: onViewportChange,
      viewport,
    });

  useEffect(() => {
    const pane =
      rootElement?.querySelector<HTMLDivElement>(".react-flow__pane");
    if (!pane) {
      return;
    }
    pane.setAttribute("role", "group");
    pane.setAttribute("aria-label", "Workspace canvas background");
    pane.setAttribute("aria-keyshortcuts", "Escape Shift+F10 ContextMenu");
    pane.tabIndex = -1;
    const handlePaneKeyDown = (event: KeyboardEvent) => {
      if (event.target !== pane) {
        return;
      }
      if (
        isWorkspaceMenuKeyboardEvent(event) &&
        openWorkspacePaneMenu(host, getOwnerKeyboardMenuPoint(pane), pane)
      ) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.key === "Escape") {
        handlePaneClick();
      }
    };
    const handlePaneMouseDown = (event: MouseEvent) => {
      if (event.button !== 1 || !(event.target instanceof Element)) {
        return;
      }
      if (
        event.target.closest(
          ".react-flow__nodesselection, .react-flow__nodesselection-hitbox, .react-flow__selection",
        )
      ) {
        event.stopPropagation();
        return;
      }
      if (
        event.target.closest(".react-flow__node") &&
        !allowsMiddleButtonPan(effectivePanOnDrag)
      ) {
        event.stopPropagation();
      }
    };
    pane.addEventListener("keydown", handlePaneKeyDown);
    pane.addEventListener("mousedown", handlePaneMouseDown);
    return () => {
      pane.removeEventListener("keydown", handlePaneKeyDown);
      pane.removeEventListener("mousedown", handlePaneMouseDown);
    };
  }, [effectivePanOnDrag, handlePaneClick, host, rootElement]);

  return (
    <div
      style={{
        width: wrapperDimensions.width,
        height: wrapperDimensions.height,
        position: "absolute",
        top: 0,
        left: 0,
      }}
      data-ready-to-be-visible={readyToBeVisible}
    >
      <ReactFlow<WorkspaceXyflowSectionNode>
        ref={handleRootRef}
        id={getWorkspaceHostDomId(host)}
        className={workspaceScopeClassName}
        nodes={renderNodes ? projectedNodes : EMPTY_NODES}
        edges={EMPTY_EDGES}
        viewport={viewport}
        onViewportChange={onViewportChange}
        onInit={handleInit}
        onNodesChange={handleNodesChange}
        onNodeDragStart={handleNodeDragStart}
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDragStop}
        onPaneClick={handlePanePointerClick}
        onPaneContextMenu={handlePaneContextMenu}
        onMoveStart={onViewportMoveStart}
        onMoveEnd={onViewportMoveEnd}
        nodeTypes={nodeTypes}
        minZoom={minZoom}
        maxZoom={maxZoom}
        panOnDrag={effectivePanOnDrag}
        panOnScroll={false}
        zoomOnScroll={false}
        zoomOnPinch={viewportInteractionEnabled && zoomOnPinch}
        zoomOnDoubleClick={viewportInteractionEnabled && zoomOnDoubleClick}
        paneClickDistance={0}
        nodeDragThreshold={nodeDragThreshold * viewport.zoom}
        snapToGrid={false}
        snapGrid={snapGrid}
        autoPanOnNodeDrag={false}
        selectionOnDrag={false}
        selectNodesOnDrag={false}
        elementsSelectable={false}
        noDragClassName={NO_DRAG_CLASS_NAME}
        noPanClassName={NO_PAN_CLASS_NAME}
        noWheelClassName={NO_WHEEL_CLASS_NAME}
        proOptions={{ hideAttribution: true }}
        onlyRenderVisibleElements={false}
        disableKeyboardA11y
        nodesConnectable={false}
        edgesFocusable={false}
        edgesReconnectable={false}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        panActivationKeyCode={null}
        zoomActivationKeyCode={null}
        elevateNodesOnSelect={false}
      >
        <WorkspaceBackground />
        <WorkspaceXyflowMeasurementObserver
          fitPending={fitPending}
          onNodesInitialized={handleNodesInitialized}
        />
        <ViewportPortal>
          <div
            className={CODEMIRROR_TOOLTIP_PARENT_CLASS_NAME}
            ref={tooltipParentRef}
          />
        </ViewportPortal>
      </ReactFlow>
      <WorkspaceXyflowSelection
        rootElement={rootElement}
        suppressNextPaneClickRef={suppressNextPaneClickRef}
      />
    </div>
  );
}
