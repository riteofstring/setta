import { ReactFlow } from "@xyflow/react";
import {
  useCallback,
  useId,
  useMemo,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

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
import { WorkspaceGeometryIndex } from "./geometry-index.js";
import {
  WorkspaceCanvasAnnouncements,
  WorkspaceCanvasEmptyPanel,
  WorkspaceCanvasHostOverlay,
  WorkspaceFixedOverlay,
  WorkspaceGridBackground,
  WorkspaceMinimap,
} from "./workspace-canvas-decorations.js";
import {
  centerWorkspacePointInViewport,
  type WorkspaceCanvasController,
} from "./workspace-canvas-navigation.js";
import { workspaceNodeTypes, type WorkspaceRootNode } from "./workspace-canvas-root-node.js";
import { useWorkspaceCanvasRootProjection } from "./workspace-canvas-root-projection.js";
import {
  targetAcceptsWorkspaceCanvasShortcut,
  useWorkspaceCanvasSelectionControls,
} from "./workspace-canvas-selection-controls.js";
import { WorkspaceSelectionOverlay } from "./workspace-canvas-selection.js";
import { useWorkspaceCanvasViewport } from "./workspace-canvas-viewport.js";
import { useWorkspaceExternalDrop } from "./workspace-external-drop.js";
import { WorkspaceGeometryMeasurements } from "./workspace-geometry-service.js";
import { resolveWorkspaceHistoryShortcut } from "./workspace-history.js";
import {
  WORKSPACE_NO_PAN_CLASS_NAME,
  WORKSPACE_NO_ROOT_DRAG_CLASS_NAME,
  WORKSPACE_NO_WHEEL_CLASS_NAME,
} from "./workspace-interaction-boundary.js";
import type { ResolvedWorkspaceGridOptions } from "./workspace-preferences.js";
import type {
  WorkspaceExternalDropHandler,
  WorkspaceExternalDropValidator,
  WorkspaceMinimapPlacement,
  WorkspaceOverlayPlacement,
  WorkspaceToolbarControl,
} from "./workspace-react-contract.js";
import type {
  WorkspaceSectionColorOption,
  WorkspaceSectionTitleValidator,
} from "./workspace-section-contract.js";
import { useWorkspaceSectionCreationMenu } from "./workspace-section-creation-menu.js";
import type { WorkspaceSectionRegistry } from "./workspace-section-registry.js";
import type {
  WorkspaceRootResizeSnapshot,
  WorkspaceSectionResizeAxis,
} from "./workspace-section-sizing.js";
import { useWorkspaceSelectionActionMenu } from "./workspace-selection-action-menu.js";
import { WorkspaceToolbar } from "./workspace-toolbar.js";
import { WorkspaceViewportSynchronizer } from "./workspace-viewport-synchronizer.js";

export type WorkspaceCanvasAdapterProps<TSectionData = WorkspaceJsonValue> = Readonly<{
  ariaLabel: string;
  appearance: "dark" | "light";
  controllerSynchronizationRevision: number;
  creationAnnouncement: string;
  creationConfigured: boolean;
  creationEnabled: boolean;
  creationReconciliation: Readonly<{ accepted: boolean; revision: number }>;
  document: WorkspaceDocument<TSectionData>;
  emptyState: ReactNode;
  gestureOptions: WorkspaceGestureOptions;
  gridOptions: ResolvedWorkspaceGridOptions;
  groupingConfigured: boolean;
  historyAnnouncement: string;
  layoutEditable: boolean;
  marqueeSelectionMode: "full" | "partial";
  minimapPlacement: WorkspaceMinimapPlacement;
  minimapVisible: boolean;
  onCanvasControllerChange(controller: WorkspaceCanvasController | null): void;
  onExternalDrop: WorkspaceExternalDropHandler | undefined;
  onGridSnapChange(value: boolean): void;
  onMinimapVisibilityChange(value: boolean): void;
  onRootMoveCommit(positions: Readonly<Record<string, WorkspacePoint>>): WorkspaceActionResult;
  onRootResizeCommit(
    sectionId: string,
    axes: readonly WorkspaceSectionResizeAxis[],
    resize: WorkspaceRootResizeSnapshot,
  ): WorkspaceActionResult;
  onSectionContentSizeCommit(
    sectionId: string,
    axes: readonly WorkspaceSectionResizeAxis[],
  ): WorkspaceActionResult;
  onSectionLockedCommit(sectionId: string, locked: boolean): WorkspaceActionResult;
  onSectionMinimizedCommit(sectionId: string, isMinimized: boolean): WorkspaceActionResult;
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
  structureEditable: boolean;
  toolbarControls: readonly WorkspaceToolbarControl<TSectionData>[];
  validateExternalDrop: WorkspaceExternalDropValidator | undefined;
  validateSectionTitle: WorkspaceSectionTitleValidator;
  workspaceController: WorkspaceController<TSectionData>;
}>;

export function WorkspaceCanvasAdapter<TSectionData = WorkspaceJsonValue>({
  ariaLabel,
  appearance,
  controllerSynchronizationRevision,
  creationAnnouncement,
  creationConfigured,
  creationEnabled,
  creationReconciliation,
  document,
  emptyState,
  gestureOptions,
  gridOptions,
  groupingConfigured,
  historyAnnouncement,
  layoutEditable,
  marqueeSelectionMode,
  minimapPlacement,
  minimapVisible,
  onCanvasControllerChange,
  onExternalDrop,
  onGridSnapChange,
  onMinimapVisibilityChange,
  onRootMoveCommit,
  onRootResizeCommit,
  onSectionContentSizeCommit,
  onSectionLockedCommit,
  onSectionMinimizedCommit,
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
  structureEditable,
  toolbarControls,
  validateExternalDrop,
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
  const externalDrop = useWorkspaceExternalDrop({
    document,
    geometry,
    geometryIndex,
    onExternalDrop,
    registry: sectionRegistry,
    structureEditable,
    validateExternalDrop,
  });
  const selection = useWorkspaceCanvasSelectionControls({
    document,
    geometry,
    geometryIndex,
    marqueeSelectionMode,
    onSelectionChange,
    selectedSectionIds,
  });
  const creation = useWorkspaceSectionCreationMenu({
    controller: workspaceController,
    creationReconciliation,
    enabled: creationEnabled,
    geometry,
    registry: sectionRegistry,
  });
  const selectionActions = useWorkspaceSelectionActionMenu({
    controller: workspaceController,
    document,
    groupingConfigured,
    layoutEditable,
    onSelectionRequest: selection.handleSelectionRequest,
    presentationEditable,
    selectedSectionIdsRef: selection.selectedSectionIdsRef,
    structureEditable,
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
    onRootResizeCommit,
    onSectionContentSizeCommit,
    onSectionLockedCommit,
    onSectionMinimizedCommit,
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
  const cancelExternalDrop = externalDrop.onDragEnd;
  const cancelMarqueeSelection = selection.marqueeSelection.cancel;
  const cancelRootMovement = rootProjection.cancelRootMovement;
  const cancelCanvasInteractions = useCallback(() => {
    cancelExternalDrop();
    cancelMarqueeSelection();
    cancelRootMovement();
  }, [cancelExternalDrop, cancelMarqueeSelection, cancelRootMovement]);
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
  const handleMinimapPointNavigate = useCallback(
    (point: WorkspacePoint) => {
      workspaceController.setViewport(
        centerWorkspacePointInViewport(point, document.viewport, geometry.canvasBounds()),
      );
    },
    [document.viewport, geometry, workspaceController],
  );
  const handleMinimapSectionNavigate = useCallback(
    (sectionId: string) => {
      void workspaceController.focusSection(sectionId);
    },
    [workspaceController],
  );
  const handleCanvasKeyDownCapture = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const historyDirection = resolveWorkspaceHistoryShortcut(event);
      if (
        historyDirection &&
        targetAcceptsWorkspaceCanvasShortcut(event.target, event.currentTarget.ownerDocument)
      ) {
        workspaceController[historyDirection]();
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      selection.handleCanvasKeyDownCapture(event);
      if (!event.defaultPrevented) {
        selectionActions.handleCanvasKeyDownCapture(event);
      }
      if (!event.defaultPrevented) {
        creation.handleCanvasKeyDownCapture(event);
      }
    },
    [creation, selection, selectionActions, workspaceController],
  );

  return (
    <div
      className="setta-workspace__canvas-boundary"
      onContextMenuCapture={selectionActions.handleCanvasContextMenuCapture}
    >
      <ReactFlow<WorkspaceRootNode>
        aria-label={`${ariaLabel} canvas`}
        aria-keyshortcuts="Control+A Meta+A Control+Y Meta+Y Control+Z Meta+Z Control+Shift+Z Meta+Shift+Z Shift+F10 ContextMenu Escape"
        autoPanOnNodeFocus={false}
        className="setta-workspace__canvas"
        data-workspace-external-drop-state={externalDrop.state}
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
        noDragClassName={WORKSPACE_NO_ROOT_DRAG_CLASS_NAME}
        noPanClassName={WORKSPACE_NO_PAN_CLASS_NAME}
        noWheelClassName={WORKSPACE_NO_WHEEL_CLASS_NAME}
        nodeTypes={workspaceNodeTypes}
        nodes={rootProjection.nodes}
        nodesConnectable={false}
        nodesDraggable
        nodesFocusable={false}
        onDragEnd={externalDrop.onDragEnd}
        onDragEnter={externalDrop.onDragEnter}
        onDragLeave={externalDrop.onDragLeave}
        onDragOver={externalDrop.onDragOver}
        onInit={viewport.handleInitialized}
        onKeyDownCapture={handleCanvasKeyDownCapture}
        onMove={viewport.handleMove}
        onMoveEnd={viewport.handleMoveEnd}
        onMoveStart={viewport.handleMoveStart}
        onNodeClick={selection.handleNodeClick}
        onNodeDragStart={rootProjection.handleNodeDragStart}
        onNodeDragStop={rootProjection.handleNodeDragStop}
        onNodesChange={rootProjection.handleNodesChange}
        onPaneClick={selection.handlePaneClick}
        onPaneContextMenu={creation.handlePaneContextMenu}
        onPointerCancel={selection.marqueeSelection.onPointerCancel}
        onPointerDownCapture={selection.marqueeSelection.onPointerDownCapture}
        onPointerMove={selection.marqueeSelection.onPointerMove}
        onPointerMoveCapture={creation.handlePointerMoveCapture}
        onPointerUp={selection.marqueeSelection.onPointerUp}
        onDrop={externalDrop.onDrop}
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
        tabIndex={0}
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
          creation={creationAnnouncement}
          externalDrop={externalDrop.announcementText}
          history={historyAnnouncement}
          movement={rootProjection.announcementText}
          selection={selection.announcementText}
          selectionAction={selectionActions.announcementText}
          sectionState={rootProjection.sectionStateAnnouncementText}
          sizing={rootProjection.sizingAnnouncementText}
        />
        {creation.dialog}
        {selectionActions.dialog}
        {externalDrop.feedback}
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
          creationControl={
            creationConfigured
              ? {
                  ariaControls: creation.dialogId,
                  disabled: !creation.available,
                  onPress: creation.openPalette,
                }
              : null
          }
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
          interactive={sectionIds.length > 0}
          id={minimapId}
          onPointerInteractionStart={viewport.handleUnattributedInteractionStart}
          onPointNavigate={handleMinimapPointNavigate}
          onSectionNavigate={handleMinimapSectionNavigate}
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
    </div>
  );
}
