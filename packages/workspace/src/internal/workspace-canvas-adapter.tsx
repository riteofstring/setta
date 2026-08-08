import { ReactFlow } from "@xyflow/react";
import { useCallback, useId, useMemo, useRef, type ReactNode } from "react";

import type {
  WorkspaceActionResult,
  WorkspaceController,
  WorkspaceDocument,
  WorkspaceGestureOptions,
  WorkspaceJsonValue,
  WorkspacePoint,
  WorkspaceSectionPresentation,
  WorkspaceViewport,
} from "../core.js";
import type {
  WorkspaceMinimapPlacement,
  WorkspaceOverlayPlacement,
  WorkspaceToolbarControl,
} from "../react.js";
import { WorkspaceGeometryIndex } from "./geometry-index.js";
import {
  WorkspaceCanvasAnnouncements,
  WorkspaceCanvasEmptyPanel,
  WorkspaceCanvasHostOverlay,
  WorkspaceFixedOverlay,
  WorkspaceGridBackground,
  WorkspaceMinimap,
} from "./workspace-canvas-decorations.js";
import { type WorkspaceCanvasController } from "./workspace-canvas-navigation.js";
import { workspaceNodeTypes, type WorkspaceRootNode } from "./workspace-canvas-root-node.js";
import { useWorkspaceCanvasRootProjection } from "./workspace-canvas-root-projection.js";
import { useWorkspaceCanvasSelectionControls } from "./workspace-canvas-selection-controls.js";
import { WorkspaceSelectionOverlay } from "./workspace-canvas-selection.js";
import { useWorkspaceCanvasViewport } from "./workspace-canvas-viewport.js";
import { WorkspaceGeometryMeasurements } from "./workspace-geometry-service.js";
import {
  WORKSPACE_NO_PAN_CLASS_NAME,
  WORKSPACE_NO_WHEEL_CLASS_NAME,
} from "./workspace-interaction-boundary.js";
import type { ResolvedWorkspaceGridOptions } from "./workspace-preferences.js";
import type {
  WorkspaceSectionColorOption,
  WorkspaceSectionTitleValidator,
} from "./workspace-section-contract.js";
import type { WorkspaceSectionRegistry } from "./workspace-section-registry.js";
import { WorkspaceToolbar } from "./workspace-toolbar.js";
import { WorkspaceViewportSynchronizer } from "./workspace-viewport-synchronizer.js";

export type WorkspaceCanvasAdapterProps<TSectionData = WorkspaceJsonValue> = Readonly<{
  ariaLabel: string;
  appearance: "dark" | "light";
  controllerSynchronizationRevision: number;
  document: WorkspaceDocument<TSectionData>;
  emptyState: ReactNode;
  gestureOptions: WorkspaceGestureOptions;
  gridOptions: ResolvedWorkspaceGridOptions;
  layoutEditable: boolean;
  marqueeSelectionMode: "full" | "partial";
  minimapPlacement: WorkspaceMinimapPlacement;
  minimapVisible: boolean;
  onCanvasControllerChange(controller: WorkspaceCanvasController | null): void;
  onGridSnapChange(value: boolean): void;
  onMinimapVisibilityChange(value: boolean): void;
  onRootMoveCommit(positions: Readonly<Record<string, WorkspacePoint>>): WorkspaceActionResult;
  onSectionPresentationCommit(
    sectionId: string,
    presentation: WorkspaceSectionPresentation,
  ): WorkspaceActionResult;
  onSectionTitleCommit(sectionId: string, title: string): WorkspaceActionResult;
  onSelectionChange(sectionIds: readonly string[]): WorkspaceActionResult;
  onViewportCommit(viewport: WorkspaceViewport): void;
  overlaySlots: Partial<Record<WorkspaceOverlayPlacement, ReactNode>>;
  presentationEditable: boolean;
  readOnly: boolean;
  sectionColorPalette: readonly WorkspaceSectionColorOption[];
  sectionRegistry: WorkspaceSectionRegistry<TSectionData>;
  selectedSectionIds: readonly string[];
  toolbarControls: readonly WorkspaceToolbarControl<TSectionData>[];
  validateSectionTitle: WorkspaceSectionTitleValidator;
  workspaceController: WorkspaceController<TSectionData>;
}>;

export function WorkspaceCanvasAdapter<TSectionData = WorkspaceJsonValue>({
  ariaLabel,
  appearance,
  controllerSynchronizationRevision,
  document,
  emptyState,
  gestureOptions,
  gridOptions,
  layoutEditable,
  marqueeSelectionMode,
  minimapPlacement,
  minimapVisible,
  onCanvasControllerChange,
  onGridSnapChange,
  onMinimapVisibilityChange,
  onRootMoveCommit,
  onSectionPresentationCommit,
  onSectionTitleCommit,
  onSelectionChange,
  onViewportCommit,
  overlaySlots,
  presentationEditable,
  readOnly,
  sectionColorPalette,
  sectionRegistry,
  selectedSectionIds,
  toolbarControls,
  validateSectionTitle,
  workspaceController,
}: WorkspaceCanvasAdapterProps<TSectionData>) {
  const reactId = useId();
  const canvasId = `setta-workspace-canvas-${reactId.replaceAll(":", "")}`;
  const minimapId = `${canvasId}-minimap`;
  const geometryIndex = useMemo(() => new WorkspaceGeometryIndex(), []);
  const geometryRef = useRef<WorkspaceGeometryMeasurements | null>(null);
  geometryRef.current ??= new WorkspaceGeometryMeasurements(geometryIndex, document.viewport);
  const geometry = geometryRef.current;
  const selection = useWorkspaceCanvasSelectionControls({
    document,
    geometry,
    geometryIndex,
    marqueeSelectionMode,
    onSelectionChange,
    selectedSectionIds,
  });
  const rootProjection = useWorkspaceCanvasRootProjection({
    appearance,
    colorPalette: sectionColorPalette,
    commitSelection: selection.commitSelection,
    document,
    geometry,
    gridOptions,
    layoutEditable,
    onRootMoveCommit,
    onSectionPresentationCommit,
    onSectionTitleCommit,
    onSelectionRequest: selection.handleSelectionRequest,
    presentationEditable,
    readOnly,
    rootSelectionProjection: selection.rootSelectionProjection,
    sectionRegistry,
    selectedSectionIdsRef: selection.selectedSectionIdsRef,
    validateSectionTitle,
  });
  const cancelMarqueeSelection = selection.marqueeSelection.cancel;
  const cancelRootMovement = rootProjection.cancelRootMovement;
  const cancelCanvasInteractions = useCallback(() => {
    cancelMarqueeSelection();
    cancelRootMovement();
  }, [cancelMarqueeSelection, cancelRootMovement]);
  const viewport = useWorkspaceCanvasViewport({
    canonicalViewport: document.viewport,
    geometry,
    gestureOptions,
    onCanvasControllerChange,
    onDetach: cancelCanvasInteractions,
    onViewportCommit,
  });
  const snapGrid = useMemo<[number, number]>(
    () => [gridOptions.spacing[0], gridOptions.spacing[1]],
    [gridOptions.spacing],
  );
  const sectionIds = useMemo(
    () => document.rootSections.map((root) => root.sectionId),
    [document.rootSections],
  );

  return (
    <ReactFlow<WorkspaceRootNode>
      aria-label={`${ariaLabel} canvas`}
      aria-keyshortcuts="Control+A Meta+A Escape"
      autoPanOnNodeFocus={false}
      className="setta-workspace__canvas"
      data-workspace-grid-pattern={gridOptions.pattern}
      data-workspace-grid-snap={gridOptions.snap ? "true" : "false"}
      data-workspace-grid-spacing={gridOptions.spacing.join(" ")}
      data-workspace-grid-visible={gridOptions.visible ? "true" : "false"}
      data-workspace-marquee-active={selection.marqueeSelection.active ? "true" : "false"}
      data-workspace-marquee-mode={marqueeSelectionMode}
      data-workspace-pan-on-scroll-mode={gestureOptions.panOnScrollMode}
      data-workspace-pan-on-scroll-speed={gestureOptions.panOnScrollSpeed}
      defaultViewport={document.viewport}
      deleteKeyCode={null}
      disableKeyboardA11y
      edges={[]}
      edgesFocusable={false}
      elementsSelectable={false}
      elevateNodesOnSelect={false}
      id={canvasId}
      maxZoom={viewport.gesturePolicy.maxZoom}
      minZoom={viewport.gesturePolicy.minZoom}
      multiSelectionKeyCode={null}
      noPanClassName={WORKSPACE_NO_PAN_CLASS_NAME}
      noWheelClassName={WORKSPACE_NO_WHEEL_CLASS_NAME}
      nodeTypes={workspaceNodeTypes}
      nodes={rootProjection.nodes}
      nodesConnectable={false}
      nodesDraggable
      nodesFocusable={false}
      onInit={viewport.handleInitialized}
      onKeyDownCapture={selection.handleCanvasKeyDownCapture}
      onMove={viewport.handleMove}
      onMoveEnd={viewport.handleMoveEnd}
      onMoveStart={viewport.handleMoveStart}
      onNodeClick={selection.handleNodeClick}
      onNodeDragStart={rootProjection.handleNodeDragStart}
      onNodeDragStop={rootProjection.handleNodeDragStop}
      onNodesChange={rootProjection.handleNodesChange}
      onPaneClick={selection.handlePaneClick}
      onPointerCancel={selection.marqueeSelection.onPointerCancel}
      onPointerDownCapture={selection.marqueeSelection.onPointerDownCapture}
      onPointerMove={selection.marqueeSelection.onPointerMove}
      onPointerUp={selection.marqueeSelection.onPointerUp}
      panActivationKeyCode={viewport.gesturePolicy.panActivationKeyCode}
      panOnDrag={viewport.gesturePolicy.panOnDrag}
      panOnScroll={viewport.gesturePolicy.panOnScroll}
      panOnScrollMode={viewport.gesturePolicy.panOnScrollMode}
      panOnScrollSpeed={viewport.gesturePolicy.panOnScrollSpeed}
      preventScrolling={viewport.gesturePolicy.preventScrolling}
      proOptions={{ hideAttribution: false }}
      ref={viewport.handleCanvasElement}
      selectionKeyCode={null}
      selectionOnDrag={false}
      snapGrid={snapGrid}
      snapToGrid={gridOptions.snap}
      zoomActivationKeyCode={viewport.gesturePolicy.zoomActivationKeyCode}
      zoomOnDoubleClick={viewport.gesturePolicy.zoomOnDoubleClick}
      zoomOnPinch={viewport.gesturePolicy.zoomOnPinch}
      zoomOnScroll={viewport.gesturePolicy.zoomOnScroll}
    >
      {gridOptions.visible ? (
        <WorkspaceGridBackground
          canvasId={canvasId}
          gridOptions={gridOptions}
          snapGrid={snapGrid}
        />
      ) : null}
      <WorkspaceCanvasAnnouncements
        movement={rootProjection.announcementText}
        selection={selection.announcementText}
      />
      <WorkspaceSelectionOverlay
        geometryIndex={geometryIndex}
        selectedSectionIds={selectedSectionIds}
      />
      {selection.marqueeSelection.overlay}
      <WorkspaceCanvasHostOverlay>{overlaySlots.canvas}</WorkspaceCanvasHostOverlay>
      <WorkspaceCanvasEmptyPanel>{emptyState}</WorkspaceCanvasEmptyPanel>
      <WorkspaceFixedOverlay placement="project">{overlaySlots.project}</WorkspaceFixedOverlay>
      <WorkspaceFixedOverlay placement="utility">{overlaySlots.utility}</WorkspaceFixedOverlay>
      <WorkspaceFixedOverlay placement="viewport">{overlaySlots.viewport}</WorkspaceFixedOverlay>
      <WorkspaceToolbar
        ariaLabel={ariaLabel}
        canonicalViewport={document.viewport}
        controller={workspaceController}
        gestureOptions={gestureOptions}
        getCanvasBounds={viewport.getCanvasBounds}
        gridSnap={gridOptions.snap}
        minimapId={minimapId}
        minimapVisible={minimapVisible}
        onGridSnapChange={onGridSnapChange}
        onMinimapVisibilityChange={onMinimapVisibilityChange}
        sectionIds={sectionIds}
        toolbarControls={toolbarControls}
      />
      <WorkspaceMinimap
        ariaLabel={ariaLabel}
        id={minimapId}
        placement={minimapPlacement}
        visible={minimapVisible}
      />
      <WorkspaceViewportSynchronizer
        geometry={geometry}
        lifecycle={viewport.lifecycle}
        programmaticViewportRef={viewport.programmaticViewportRef}
        synchronizationRevision={controllerSynchronizationRevision}
        viewport={document.viewport}
      />
    </ReactFlow>
  );
}
