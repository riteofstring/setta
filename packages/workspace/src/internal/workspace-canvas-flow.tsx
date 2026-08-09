import { ReactFlow, type ReactFlowProps } from "@xyflow/react";
import { useCallback, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

import type { WorkspaceGestureOptions, WorkspaceViewport } from "../core.js";
import type { WorkspaceCanvasGesturePolicy } from "./workspace-canvas-gesture-policy.js";
import { workspaceNodeTypes, type WorkspaceRootNode } from "./workspace-canvas-root-node.js";
import {
  viewportInteractionEnabled,
  type WorkspaceInteractionActivationSnapshot,
  type WorkspaceInteractionActivationStore,
} from "./workspace-interaction-activation.js";
import {
  WORKSPACE_NO_PAN_CLASS_NAME,
  WORKSPACE_NO_ROOT_DRAG_CLASS_NAME,
  WORKSPACE_NO_WHEEL_CLASS_NAME,
} from "./workspace-interaction-boundary.js";
import type { ResolvedWorkspaceGridOptions } from "./workspace-preferences.js";
import type { WorkspaceSectionMoveMode } from "./workspace-react-contract.js";
import type { ResolvedWorkspaceViewportCullingOptions } from "./workspace-viewport-culling.js";

type UpstreamCanvasProps = ReactFlowProps<WorkspaceRootNode>;

type UpstreamPassThroughProps = Pick<
  UpstreamCanvasProps,
  | "nodes"
  | "onDragEnd"
  | "onDragEnter"
  | "onDragLeave"
  | "onDragOver"
  | "onDrop"
  | "onInit"
  | "onKeyDownCapture"
  | "onMove"
  | "onMoveEnd"
  | "onMoveStart"
  | "onNodeClick"
  | "onNodeDragStart"
  | "onNodeDragStop"
  | "onNodesChange"
  | "onPaneClick"
  | "onPaneContextMenu"
  | "onPointerCancel"
  | "onPointerDownCapture"
  | "onPointerMove"
  | "onPointerMoveCapture"
  | "onPointerUp"
  | "snapGrid"
>;

export type WorkspaceCanvasFlowProps = UpstreamPassThroughProps &
  Readonly<{
    activation: WorkspaceInteractionActivationStore;
    canvasAriaLabel: string;
    canvasId: string;
    children: ReactNode;
    defaultViewport: WorkspaceViewport;
    externalDropState: string;
    gestureOptions: WorkspaceGestureOptions;
    gesturePolicy: WorkspaceCanvasGesturePolicy;
    gridOptions: ResolvedWorkspaceGridOptions;
    keyShortcuts: string;
    layoutEditable: boolean;
    marqueeActive: boolean;
    marqueeMode: "full" | "partial";
    onCanvasElement(element: HTMLDivElement | null): void;
    sectionMoveMode: WorkspaceSectionMoveMode;
    viewportCullingOptions: ResolvedWorkspaceViewportCullingOptions;
  }>;

function interactionDataValue<T extends string>(value: T | null): T | "none" {
  return value ?? "none";
}

function interactionGesturePolicy(
  enabled: boolean,
  policy: WorkspaceCanvasGesturePolicy,
): Pick<
  WorkspaceCanvasGesturePolicy,
  | "panActivationKeyCode"
  | "panOnDrag"
  | "panOnScroll"
  | "zoomActivationKeyCode"
  | "zoomOnDoubleClick"
  | "zoomOnPinch"
  | "zoomOnScroll"
> {
  if (enabled) {
    return policy;
  }
  return {
    panActivationKeyCode: null,
    panOnDrag: false,
    panOnScroll: false,
    zoomActivationKeyCode: null,
    zoomOnDoubleClick: false,
    zoomOnPinch: false,
    zoomOnScroll: false,
  };
}

function setInteractionAttribute(element: HTMLDivElement, name: string, value: string): void {
  if (element.getAttribute(name) !== value) {
    element.setAttribute(name, value);
  }
}

function applyInteractionAttributes(
  element: HTMLDivElement,
  snapshot: WorkspaceInteractionActivationSnapshot,
): void {
  setInteractionAttribute(
    element,
    "data-workspace-interaction-owner",
    interactionDataValue(snapshot.owner),
  );
  setInteractionAttribute(
    element,
    "data-workspace-section-move-input",
    interactionDataValue(snapshot.activeInput),
  );
  setInteractionAttribute(
    element,
    "data-workspace-structural-move-mode",
    interactionDataValue(snapshot.activeSectionMode),
  );
}

/**
 * The one component that rerenders on an interaction-ownership broadcast. It
 * subscribes to the activation store for the viewport gesture flag, so a
 * gesture start reconciles only this element's pan/zoom props instead of
 * committing an adapter-wide render, and it owns the gesture-scoped canvas
 * data attributes imperatively for the same reason. The attributes render
 * once as idle literals (server markup and first paint) and never change
 * through React afterwards.
 */
export function WorkspaceCanvasFlow({
  activation,
  canvasAriaLabel,
  canvasId,
  children,
  defaultViewport,
  externalDropState,
  gestureOptions,
  gesturePolicy,
  gridOptions,
  keyShortcuts,
  layoutEditable,
  marqueeActive,
  marqueeMode,
  onCanvasElement,
  sectionMoveMode,
  viewportCullingOptions,
  ...passThrough
}: WorkspaceCanvasFlowProps) {
  const canvasElementRef = useRef<HTMLDivElement | null>(null);
  const handleCanvasElement = useCallback(
    (element: HTMLDivElement | null) => {
      canvasElementRef.current = element;
      if (element) {
        applyInteractionAttributes(element, activation.getSnapshot());
      }
      onCanvasElement(element);
    },
    [activation, onCanvasElement],
  );
  useLayoutEffect(
    () =>
      activation.subscribe(() => {
        const element = canvasElementRef.current;
        if (element) {
          applyInteractionAttributes(element, activation.getSnapshot());
        }
      }),
    [activation],
  );
  const viewportGesturesEnabled = useCallback(
    () => viewportInteractionEnabled(activation.getSnapshot()),
    [activation],
  );
  const interactionGestures = interactionGesturePolicy(
    useSyncExternalStore(activation.subscribe, viewportGesturesEnabled, viewportGesturesEnabled),
    gesturePolicy,
  );
  return (
    <ReactFlow<WorkspaceRootNode>
      aria-label={canvasAriaLabel}
      aria-keyshortcuts={keyShortcuts}
      autoPanOnNodeDrag={false}
      autoPanOnNodeFocus={false}
      className="setta-workspace__canvas"
      data-workspace-external-drop-state={externalDropState}
      data-workspace-grid-pattern={gridOptions.pattern}
      data-workspace-grid-snap={gridOptions.snap ? "true" : "false"}
      data-workspace-grid-spacing={gridOptions.spacing.join(" ")}
      data-workspace-grid-visible={gridOptions.visible ? "true" : "false"}
      data-workspace-marquee-active={marqueeActive ? "true" : "false"}
      data-workspace-marquee-mode={marqueeMode}
      data-workspace-pan-on-scroll-mode={gestureOptions.panOnScrollMode}
      data-workspace-pan-on-scroll-speed={gestureOptions.panOnScrollSpeed}
      data-workspace-interaction-owner="none"
      data-workspace-section-move-input="none"
      data-workspace-section-move-mode={sectionMoveMode}
      data-workspace-viewport-culling={String(viewportCullingOptions.enabled)}
      data-workspace-viewport-culling-overscan={viewportCullingOptions.overscan}
      data-workspace-structural-move-mode="none"
      defaultViewport={defaultViewport}
      deleteKeyCode={null}
      disableKeyboardA11y
      edges={[]}
      edgesFocusable={false}
      elementsSelectable={false}
      elevateNodesOnSelect={false}
      id={canvasId}
      maxZoom={gesturePolicy.maxZoom}
      minZoom={gesturePolicy.minZoom}
      multiSelectionKeyCode={null}
      noDragClassName={WORKSPACE_NO_ROOT_DRAG_CLASS_NAME}
      noPanClassName={WORKSPACE_NO_PAN_CLASS_NAME}
      noWheelClassName={WORKSPACE_NO_WHEEL_CLASS_NAME}
      nodeTypes={workspaceNodeTypes}
      nodesConnectable={false}
      // Every workspace node carries an explicit boolean `draggable`
      // (projection creation and applyRootSelectionState maintain it), which
      // upstream gives precedence over this flag, and free-move handles opt
      // out through noDragClassName. Keeping the flag static avoids the
      // per-node NodeWrapper rerender its flips would otherwise fan out on
      // every gesture start and finish.
      nodesDraggable={layoutEditable}
      nodesFocusable={false}
      panActivationKeyCode={interactionGestures.panActivationKeyCode}
      panOnDrag={interactionGestures.panOnDrag}
      panOnScroll={interactionGestures.panOnScroll}
      panOnScrollMode={gesturePolicy.panOnScrollMode}
      panOnScrollSpeed={gesturePolicy.panOnScrollSpeed}
      preventScrolling={gesturePolicy.preventScrolling}
      proOptions={{ hideAttribution: false }}
      ref={handleCanvasElement}
      selectionKeyCode={null}
      selectionOnDrag={false}
      tabIndex={0}
      snapToGrid={gridOptions.snap}
      zoomActivationKeyCode={interactionGestures.zoomActivationKeyCode}
      zoomOnDoubleClick={interactionGestures.zoomOnDoubleClick}
      zoomOnPinch={interactionGestures.zoomOnPinch}
      zoomOnScroll={interactionGestures.zoomOnScroll}
      {...passThrough}
    >
      {children}
    </ReactFlow>
  );
}
