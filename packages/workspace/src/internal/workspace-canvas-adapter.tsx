import { type Viewport } from "@xyflow/react";
import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type {
  SectionOrientation,
  SectionOverflow,
  WorkspaceActionResult,
  WorkspaceChildLayoutPositioningChange,
  WorkspaceConnections,
  WorkspaceController,
  WorkspaceDocument,
  WorkspaceGestureOptions,
  WorkspaceJsonValue,
  WorkspacePoint,
  WorkspaceSectionPresentation,
  WorkspaceViewport,
} from "../core.js";
import { deriveWorkspaceParentLookup } from "../core.js";
import { WorkspaceGeometryIndex } from "./geometry-index.js";
import type { InteractionInput } from "./interaction-owner.js";
import type { SectionMovePlan, WorkspaceSectionMoveValidator } from "./section-move-planning.js";
import {
  WorkspaceCanvasAnnouncements,
  WorkspaceCanvasEmptyPanel,
  WorkspaceCanvasHostOverlay,
  WorkspaceFixedOverlay,
  WorkspaceGridBackground,
  WorkspaceMinimap,
} from "./workspace-canvas-decorations.js";
import { WorkspaceCanvasFlow } from "./workspace-canvas-flow.js";
import {
  centerWorkspacePointInViewport,
  type WorkspaceCanvasController,
} from "./workspace-canvas-navigation.js";
import type { WorkspaceRootNode } from "./workspace-canvas-root-node.js";
import { useWorkspaceCanvasRootProjection } from "./workspace-canvas-root-projection.js";
import {
  targetAcceptsWorkspaceCanvasShortcut,
  useWorkspaceCanvasSelectionControls,
} from "./workspace-canvas-selection-controls.js";
import { WorkspaceSelectionOverlay } from "./workspace-canvas-selection.js";
import { useWorkspaceCanvasViewport } from "./workspace-canvas-viewport.js";
import { resolveWorkspaceClipboardShortcut } from "./workspace-clipboard.js";
import { WorkspaceConnectionLayer } from "./workspace-connections-react.js";
import { useWorkspaceExternalDrop } from "./workspace-external-drop.js";
import { WorkspaceGeometryMeasurements } from "./workspace-geometry-service.js";
import { resolveWorkspaceHistoryShortcut } from "./workspace-history.js";
import { useWorkspaceInteractionOwner } from "./workspace-interaction-owner.js";
import { WorkspaceItemInteractionProvider } from "./workspace-item-interaction-context.js";
import type { WorkspacePaneToolbarControl } from "./workspace-panes.js";
import type { ResolvedWorkspaceGridOptions } from "./workspace-preferences.js";
import type {
  WorkspaceExternalDropHandler,
  WorkspaceExternalDropValidator,
  WorkspaceMinimapPlacement,
  WorkspaceOverlayPlacement,
  WorkspaceSectionMoveMode,
  WorkspaceToolbarControl,
} from "./workspace-react-contract.js";
import type {
  WorkspaceSectionColorOption,
  WorkspaceSectionTitleValidator,
} from "./workspace-section-contract.js";
import { useWorkspaceSectionCreationMenu } from "./workspace-section-creation-menu.js";
import { WorkspaceSectionDndBoundary } from "./workspace-section-dnd.js";
import {
  WorkspaceSectionMoveFeedback,
  WorkspaceSectionMoveFeedbackStore,
} from "./workspace-section-move-feedback.js";
import type { WorkspaceSectionRegistry } from "./workspace-section-registry.js";
import type {
  WorkspaceRootResizeSnapshot,
  WorkspaceSectionResizeAxis,
} from "./workspace-section-sizing.js";
import { useWorkspaceSelectionActionMenu } from "./workspace-selection-action-menu.js";
import { WorkspaceSelectionProvider } from "./workspace-selection-context.js";
import type { WorkspaceSelectionStore } from "./workspace-selection-store.js";
import { WorkspaceToolbar } from "./workspace-toolbar.js";
import {
  WorkspaceViewportCulling,
  type ResolvedWorkspaceViewportCullingOptions,
} from "./workspace-viewport-culling.js";
import { WorkspaceViewportSynchronizer } from "./workspace-viewport-synchronizer.js";

export type WorkspaceCanvasAdapterProps<TSectionData = WorkspaceJsonValue> = Readonly<{
  ariaLabel: string;
  appearance: "dark" | "light";
  clipboardAnnouncement: string;
  clipboardConfigured: boolean;
  controllerSynchronizationRevision: number;
  connections: WorkspaceConnections;
  creationAnnouncement: string;
  creationConfigured: boolean;
  creationEnabled: boolean;
  creationReconciliation: Readonly<{ accepted: boolean; revision: number }>;
  detachedSectionIds: readonly string[];
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
  onCanvasPointChange(point: WorkspacePoint): void;
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
  onSectionMoveCommit(plan: SectionMovePlan): WorkspaceActionResult;
  onSectionOrientationCommit(
    sectionId: string,
    orientation: SectionOrientation,
  ): WorkspaceActionResult;
  onSectionPositioningCommit(
    sectionId: string,
    change: WorkspaceChildLayoutPositioningChange,
  ): WorkspaceActionResult;
  onSectionOverflowCommit(
    sectionId: string,
    overflow: SectionOverflow,
    measuredSize: Readonly<{ height: number; width: number }> | null,
  ): WorkspaceActionResult;
  onSectionPresentationCommit(
    sectionId: string,
    presentation: WorkspaceSectionPresentation,
  ): WorkspaceActionResult;
  onSectionTitleCommit(sectionId: string, title: string): WorkspaceActionResult;
  onSelectionChange(sectionIds: readonly string[]): WorkspaceActionResult;
  onViewportCommit(viewport: WorkspaceViewport): void;
  overlaySlots: Partial<Record<WorkspaceOverlayPlacement, ReactNode>>;
  paneControls: readonly WorkspacePaneToolbarControl[];
  presentationEditable: boolean;
  readOnly: boolean;
  sectionColorPalette: readonly WorkspaceSectionColorOption[];
  sectionMoveMode: WorkspaceSectionMoveMode;
  sectionRegistry: WorkspaceSectionRegistry<TSectionData>;
  selectionStore: WorkspaceSelectionStore;
  structureEditable: boolean;
  toolbarControls: readonly WorkspaceToolbarControl<TSectionData>[];
  validateExternalDrop: WorkspaceExternalDropValidator | undefined;
  validateSectionMove: WorkspaceSectionMoveValidator<TSectionData> | undefined;
  validateSectionTitle: WorkspaceSectionTitleValidator;
  viewportCullingOptions: ResolvedWorkspaceViewportCullingOptions;
  visibleSectionIds: readonly string[];
  workspaceController: WorkspaceController<TSectionData>;
}>;

function nodeDragInput(event: MouseEvent | TouchEvent): InteractionInput {
  return "touches" in event ? "touch" : "pointer";
}

export function WorkspaceCanvasAdapter<TSectionData = WorkspaceJsonValue>({
  ariaLabel,
  appearance,
  clipboardAnnouncement,
  clipboardConfigured,
  controllerSynchronizationRevision,
  connections,
  creationAnnouncement,
  creationConfigured,
  creationEnabled,
  creationReconciliation,
  detachedSectionIds,
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
  onCanvasPointChange,
  onExternalDrop,
  onGridSnapChange,
  onMinimapVisibilityChange,
  onRootMoveCommit,
  onRootResizeCommit,
  onSectionContentSizeCommit,
  onSectionLockedCommit,
  onSectionMinimizedCommit,
  onSectionMoveCommit,
  onSectionOrientationCommit,
  onSectionOverflowCommit,
  onSectionPositioningCommit,
  onSectionPresentationCommit,
  onSectionTitleCommit,
  onSelectionChange,
  onViewportCommit,
  overlaySlots,
  paneControls,
  presentationEditable,
  readOnly,
  sectionColorPalette,
  sectionMoveMode,
  sectionRegistry,
  selectionStore,
  structureEditable,
  toolbarControls,
  validateExternalDrop,
  validateSectionMove,
  validateSectionTitle,
  viewportCullingOptions,
  visibleSectionIds,
  workspaceController,
}: WorkspaceCanvasAdapterProps<TSectionData>) {
  const reactId = useId();
  const canvasId = `setta-workspace-canvas-${reactId.replaceAll(":", "")}`;
  const minimapId = `${canvasId}-minimap`;
  const geometryIndex = useMemo(() => new WorkspaceGeometryIndex(), []);
  const geometryRef = useRef<WorkspaceGeometryMeasurements | null>(null);
  geometryRef.current ??= new WorkspaceGeometryMeasurements(geometryIndex, document.viewport);
  const geometry = geometryRef.current;
  const viewportCulling = useMemo(() => new WorkspaceViewportCulling(), []);
  const parentLookup = useMemo(() => deriveWorkspaceParentLookup(document), [document]);
  useLayoutEffect(() => {
    viewportCulling.setOptions(viewportCullingOptions);
    viewportCulling.setParentLookup(parentLookup);
    geometry.setRetainedSectionIds(visibleSectionIds);
  }, [geometry, parentLookup, viewportCulling, viewportCullingOptions, visibleSectionIds]);
  const sectionMoveFeedbackStore = useMemo(() => new WorkspaceSectionMoveFeedbackStore(), []);
  const scheduleInteractionFrame = useCallback(
    (callback: () => void) => {
      const view = geometry.canvasElement()?.ownerDocument.defaultView;
      if (view) {
        view.requestAnimationFrame(() => callback());
      } else {
        queueMicrotask(callback);
      }
    },
    [geometry],
  );
  const interaction = useWorkspaceInteractionOwner({
    layoutEnabled: layoutEditable,
    scheduleFrame: scheduleInteractionFrame,
    sectionMode: sectionMoveMode,
    structureEnabled: structureEditable,
  });
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
    selectionStore,
    visibleSectionIds,
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
    detachedSectionIds,
    groupingConfigured,
    layoutEditable,
    onSelectionRequest: selection.handleSelectionRequest,
    presentationEditable,
    selectionStore,
    structureEditable,
    visibleSectionIds,
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
    onSectionOrientationCommit,
    onSectionOverflowCommit,
    onSectionPositioningCommit,
    onSectionPresentationCommit,
    onSectionTitleCommit,
    onSelectionRequest: selection.handleSelectionRequest,
    presentationEditable,
    readOnly,
    sectionRegistry,
    selectionStore,
    validateSectionTitle,
    viewportCulling,
  });
  const completeRootLayout = interaction.completeRootLayout;
  const startRootLayout = interaction.startRootLayout;
  const cancelInteraction = interaction.cancel;
  const cancelRootMovement = rootProjection.cancelRootMovement;
  const rootNodeDragStart = rootProjection.handleNodeDragStart;
  const rootNodeDragStop = rootProjection.handleNodeDragStop;
  const handleNodeDragStart = useCallback(
    (
      event: MouseEvent | TouchEvent,
      node: WorkspaceRootNode,
      draggedNodes: WorkspaceRootNode[],
    ) => {
      if (!rootNodeDragStart(event, node, draggedNodes)) {
        return;
      }
      if (!startRootLayout(nodeDragInput(event))) {
        cancelRootMovement();
      }
    },
    [cancelRootMovement, rootNodeDragStart, startRootLayout],
  );
  const handleNodeDragStop = useCallback(
    (
      event: MouseEvent | TouchEvent,
      node: WorkspaceRootNode,
      draggedNodes: WorkspaceRootNode[],
    ) => {
      rootNodeDragStop(event, node, draggedNodes);
      completeRootLayout();
    },
    [completeRootLayout, rootNodeDragStop],
  );
  const sectionTitle = useCallback(
    (sectionId: string) => {
      const section = document.sections[sectionId];
      if (!section) {
        throw new Error(`Workspace section drag source ${sectionId} is not in the document.`);
      }
      return section.title;
    },
    [document.sections],
  );
  const cancelExternalDrop = externalDrop.onDragEnd;
  const cancelMarqueeSelection = selection.marqueeSelection.cancel;
  const cancelCanvasInteractions = useCallback(() => {
    cancelExternalDrop();
    cancelMarqueeSelection();
    cancelRootMovement();
    cancelInteraction();
  }, [cancelExternalDrop, cancelInteraction, cancelMarqueeSelection, cancelRootMovement]);
  const viewport = useWorkspaceCanvasViewport({
    activation: interaction.activationStore,
    canonicalViewport: document.viewport,
    geometry,
    gestureOptions,
    onCanvasControllerChange,
    onDetach: cancelCanvasInteractions,
    onViewportCommit,
    resolveInsertionCandidate: externalDrop.resolveCandidate,
    revealSection: viewportCulling.revealSection,
  });
  const completeViewport = interaction.completeViewport;
  const startViewport = interaction.startViewport;
  const viewportMoveEnd = viewport.handleMoveEnd;
  const viewportMoveStart = viewport.handleMoveStart;
  const handleViewportMoveStart = useCallback(
    (event: MouseEvent | TouchEvent | null, nextViewport: Viewport) => {
      if (event && !startViewport(nodeDragInput(event))) {
        return;
      }
      viewportMoveStart(event, nextViewport);
    },
    [startViewport, viewportMoveStart],
  );
  const handleViewportMoveEnd = useCallback(
    (event: MouseEvent | TouchEvent | null, nextViewport: Viewport) => {
      viewportMoveEnd(event, nextViewport);
      completeViewport();
    },
    [completeViewport, viewportMoveEnd],
  );
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
      const clipboardAction = clipboardConfigured ? resolveWorkspaceClipboardShortcut(event) : null;
      if (
        clipboardAction &&
        targetAcceptsWorkspaceCanvasShortcut(event.target, event.currentTarget.ownerDocument)
      ) {
        void workspaceController[clipboardAction]();
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
    [clipboardConfigured, creation, selection, selectionActions, workspaceController],
  );
  const handlePointerMoveCapture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      creation.handlePointerMoveCapture(event);
      onCanvasPointChange(geometry.clientPointToWorkspace({ x: event.clientX, y: event.clientY }));
    },
    [creation, geometry, onCanvasPointChange],
  );
  const canvasKeyShortcuts = [
    "Control+A Meta+A",
    clipboardConfigured ? "Control+C Meta+C Control+V Meta+V" : "",
    "Control+Y Meta+Y Control+Z Meta+Z Control+Shift+Z Meta+Shift+Z",
    "Shift+F10 ContextMenu Escape",
  ]
    .filter(Boolean)
    .join(" ");
  const viewportCanvasElement = viewport.handleCanvasElement;
  const handleCanvasElement = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) {
        viewportCulling.setCanvasElement(null);
      }
      viewportCanvasElement(element);
      if (element) {
        viewportCulling.setCanvasElement(element);
      }
    },
    [viewportCanvasElement, viewportCulling],
  );

  return (
    <div
      className="setta-workspace__canvas-boundary"
      onContextMenuCapture={selectionActions.handleCanvasContextMenuCapture}
    >
      <WorkspaceSelectionProvider store={selectionStore}>
        <WorkspaceItemInteractionProvider
          activation={interaction.activationStore}
          finish={interaction.finishItemTree}
          start={interaction.startItemTree}
          zoom={document.viewport.zoom}
        >
          <WorkspaceSectionDndBoundary
            activation={interaction.activationStore}
            document={document}
            feedbackStore={sectionMoveFeedbackStore}
            geometry={geometry}
            geometryIndex={geometryIndex}
            gridOptions={gridOptions}
            layoutEditable={layoutEditable}
            mode={sectionMoveMode}
            onComplete={(canceled, announcement) =>
              canceled
                ? interaction.cancelSectionStructure(announcement)
                : interaction.complete(announcement)
            }
            onMoveCommit={onSectionMoveCommit}
            onReconciliation={interaction.announceSectionStructure}
            onSelectionRequest={selection.handleSelectionRequest}
            onStart={interaction.startSectionStructure}
            sectionTitle={sectionTitle}
            selectionStore={selectionStore}
            structureEditable={structureEditable}
            validateSectionMove={validateSectionMove}
          >
            <WorkspaceCanvasFlow
              activation={interaction.activationStore}
              canvasAriaLabel={`${ariaLabel} canvas`}
              canvasId={canvasId}
              defaultViewport={document.viewport}
              externalDropState={externalDrop.state}
              gestureOptions={gestureOptions}
              gesturePolicy={viewport.gesturePolicy}
              gridOptions={gridOptions}
              keyShortcuts={canvasKeyShortcuts}
              layoutEditable={layoutEditable}
              marqueeActive={selection.marqueeSelection.active}
              marqueeMode={marqueeSelectionMode}
              nodes={rootProjection.nodes}
              onCanvasElement={handleCanvasElement}
              onDragEnd={externalDrop.onDragEnd}
              onDragEnter={externalDrop.onDragEnter}
              onDragLeave={externalDrop.onDragLeave}
              onDragOver={externalDrop.onDragOver}
              onDrop={externalDrop.onDrop}
              onInit={viewport.handleInitialized}
              onKeyDownCapture={handleCanvasKeyDownCapture}
              onMove={viewport.handleMove}
              onMoveEnd={handleViewportMoveEnd}
              onMoveStart={handleViewportMoveStart}
              onNodeClick={selection.handleNodeClick}
              onNodeDragStart={handleNodeDragStart}
              onNodeDragStop={handleNodeDragStop}
              onNodesChange={rootProjection.handleNodesChange}
              onPaneClick={selection.handlePaneClick}
              onPaneContextMenu={creation.handlePaneContextMenu}
              onPointerCancel={selection.marqueeSelection.onPointerCancel}
              onPointerDownCapture={selection.marqueeSelection.onPointerDownCapture}
              onPointerMove={selection.marqueeSelection.onPointerMove}
              onPointerMoveCapture={handlePointerMoveCapture}
              onPointerUp={selection.marqueeSelection.onPointerUp}
              sectionMoveMode={sectionMoveMode}
              snapGrid={snapGrid}
              viewportCullingOptions={viewportCullingOptions}
            >
              {gridOptions.visible ? (
                <WorkspaceGridBackground
                  canvasId={canvasId}
                  gridOptions={gridOptions}
                  snapGrid={snapGrid}
                />
              ) : null}
              <WorkspaceCanvasAnnouncements
                clipboard={clipboardAnnouncement}
                creation={creationAnnouncement}
                containerLayout={rootProjection.containerLayoutAnnouncementText}
                containerOrientation={rootProjection.containerOrientationAnnouncementText}
                containerPositioning={rootProjection.containerPositioningAnnouncementText}
                externalDrop={externalDrop.announcementText}
                history={historyAnnouncement}
                interactionActivation={interaction.activationStore}
                movement={rootProjection.announcementText}
                selectionStore={selectionStore}
                selectionAction={selectionActions.announcementText}
                sectionState={rootProjection.sectionStateAnnouncementText}
                sizing={rootProjection.sizingAnnouncementText}
              />
              {creation.dialog}
              {rootProjection.containerPositioningDialog}
              {selectionActions.dialog}
              {externalDrop.feedback}
              {connections.ports.length > 0 ? (
                <WorkspaceConnectionLayer
                  ariaLabel={ariaLabel}
                  connections={connections}
                  document={document}
                  geometryIndex={geometryIndex}
                />
              ) : null}
              <WorkspaceSelectionOverlay
                activation={interaction.activationStore}
                geometryIndex={geometryIndex}
                selectionStore={selectionStore}
              />
              <WorkspaceSectionMoveFeedback store={sectionMoveFeedbackStore} />
              {selection.marqueeSelection.overlay}
              <WorkspaceCanvasHostOverlay>{overlaySlots.canvas}</WorkspaceCanvasHostOverlay>
              <WorkspaceCanvasEmptyPanel>{emptyState}</WorkspaceCanvasEmptyPanel>
              <WorkspaceFixedOverlay placement="project">
                {overlaySlots.project}
              </WorkspaceFixedOverlay>
              <WorkspaceFixedOverlay placement="utility">
                {overlaySlots.utility}
              </WorkspaceFixedOverlay>
              <WorkspaceFixedOverlay placement="viewport">
                {overlaySlots.viewport}
              </WorkspaceFixedOverlay>
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
                paneControls={paneControls}
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
            </WorkspaceCanvasFlow>
          </WorkspaceSectionDndBoundary>
        </WorkspaceItemInteractionProvider>
      </WorkspaceSelectionProvider>
    </div>
  );
}
