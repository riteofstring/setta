import type {
  ColumnId,
  ColumnWidthSpec,
  LayoutEngine,
  LayoutFrameInput,
  OpenPaneRequest,
  PaneDropIntent,
  PaneId,
  PaneInsertionPlacement,
  PaneRenderItem,
  Rect,
  TerminalPaneConfig,
  WorkspaceColumn,
  WorkspacePane,
  WorkspaceScene,
} from "./types";
import { columnSlotIndex } from "./column-slots";
import {
  isHorizontalDirection,
  isVerticalDirection,
  minimumColumnWidth,
  nearestColumnWidthPreset,
  type PaneDirection,
  type PaneLocation,
  planeGeometryForLayout,
  scrollOffsetForColumn,
} from "./layout-engine-helpers";
import {
  normalizedPaneHeightPx,
  normalizedPaneWeight,
  normalizeTerminalPaneConfig,
  terminalConfigForRequest,
} from "./layout-engine-normalization";
import {
  paneInHorizontalVisualDirection,
  paneInVerticalVisualDirection,
} from "./layout-engine-navigation";
import { paneDropIntentCreatesColumn, WorkspaceLayoutEngineBase } from "./layout-engine-base";
import { type OverviewFrameTransform, renderNormalLayoutFrame } from "./layout-engine-rendering";
import {
  applyPaneDropIntentToColumns,
  reorderPaneColumnBefore,
  type PaneReorderPlacement,
} from "./layout-reorder";
import { samePaneDropIntent } from "./pane-drop-intent-equality";

interface PaneReorderPreview {
  intent: PaneDropIntent;
  sourcePaneId: PaneId;
}

interface PaneInsertFramePreview {
  anchorPaneId: PaneId;
  placement: PaneInsertionPlacement;
}

// The exact stage-relative rect (already scaled) where a previewed new pane would
// land, used to position the "add pane" affordance on the real slot.
export interface OverviewInsertPreviewRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

// The empty-frame request used for the non-committing insert preview. Only the
// width (left at the default) affects layout; the surface/title are discarded
// when the preview is restored.
const insertPreviewRequest: OpenPaneRequest = {
  subtitle: "choose a pane type",
  surfaceKind: "empty-frame",
  title: "New frame",
  tone: "slate",
};

interface EngineMutableState {
  columns: WorkspaceColumn[];
  nextColumnSequence: number;
  nextPaneSequence: number;
  paneById: Map<PaneId, WorkspacePane>;
}

export class WorkspaceLikeLayoutEngine extends WorkspaceLayoutEngineBase implements LayoutEngine {
  private paneReorderPreview: PaneReorderPreview | null = null;
  private paneInsertFramePreview: PaneInsertFramePreview | null = null;

  closePane(paneId: PaneId): void {
    this.paneById.delete(paneId);
    this.columns = this.columns
      .map((column) => ({
        ...column,
        paneIds: column.paneIds.filter((candidateId) => candidateId !== paneId),
      }))
      .filter((column) => column.paneIds.length > 0);
    this.reindexColumns();
  }
  columnCount(): number {
    return this.columns.length;
  }
  firstPaneId(): PaneId | null {
    return this.columns[0]?.paneIds[0] ?? null;
  }
  focusedPaneAt(columnIndex: number, rowIndex: number): PaneId {
    return this.requirePaneAt(columnIndex, rowIndex).paneId;
  }
  paneCount(): number {
    return this.paneById.size;
  }
  paneLocation(paneId: PaneId): PaneLocation | null {
    return this.locationForPane(paneId);
  }

  movePane(paneId: PaneId, direction: PaneDirection): void {
    const source = this.locationForPane(paneId);
    if (!source) {
      return;
    }
    if (isVerticalDirection(direction)) {
      this.movePaneWithinColumn(paneId, source, direction);
      return;
    }
    this.movePaneToAdjacentColumn(paneId, source, direction);
  }

  openPane(request: OpenPaneRequest): PaneId {
    const targetColumn = request.columnId
      ? this.requireColumn(request.columnId)
      : this.insertColumnAfter(request.adjacentToColumnId, request.widthSpec);
    const sequence = this.nextPaneSequence;
    this.nextPaneSequence += 1;
    const pane: WorkspacePane = {
      columnId: targetColumn.columnId,
      heat: (sequence * 37) % 100,
      paneId: `workspace_pane_${sequence}`,
      sequence,
      subtitle: request.subtitle ?? "workspace surface",
      surfaceId: `workspace_surface_${sequence}`,
      surfaceKind: request.surfaceKind ?? "empty-frame",
      terminalConfig: terminalConfigForRequest(request),
      title: request.title ?? `Pane ${String(sequence + 1).padStart(3, "0")}`,
      tone: request.tone ?? "slate",
      weight: request.weight ?? 1,
    };
    this.paneById.set(pane.paneId, pane);
    targetColumn.paneIds.push(pane.paneId);
    return pane.paneId;
  }

  openPaneNearPane(
    paneId: PaneId,
    placement: PaneInsertionPlacement,
    request: OpenPaneRequest,
  ): PaneId {
    const source = this.locationForPane(paneId);
    if (!source) {
      return this.openPane(request);
    }
    if (placement === "right") {
      const columnId = this.insertAdjacentColumn(source, "right", request.widthSpec).columnId;
      return this.openPane({ ...request, columnId });
    }
    const sourceColumn = this.columns[source.columnIndex];
    const widthSpec = request.widthSpec ?? sourceColumn?.widthSpec;
    const columnId = this.insertColumnInPlaneSlot(
      source.planeIndex + (placement === "above" ? -1 : 1),
      sourceColumn ? columnSlotIndex(sourceColumn) : source.planeColumnIndex,
      widthSpec,
    ).columnId;
    return this.openPane({ ...request, columnId });
  }

  configurePane(paneId: PaneId, request: OpenPaneRequest): PaneId {
    const pane = this.paneById.get(paneId);
    if (!pane) {
      throw new Error(`unknown workspace pane ${paneId}`);
    }
    const sequence = this.nextPaneSequence;
    this.nextPaneSequence += 1;
    this.paneById.set(paneId, {
      ...pane,
      heat: (sequence * 37) % 100,
      subtitle: request.subtitle ?? pane.subtitle,
      surfaceId: `workspace_surface_${sequence}`,
      surfaceKind: request.surfaceKind ?? pane.surfaceKind,
      terminalConfig: terminalConfigForRequest(request, pane),
      title: request.title ?? pane.title,
      tone: request.tone ?? pane.tone,
      weight: request.weight ?? pane.weight,
    });
    return paneId;
  }

  paneInVisualDirection(
    paneId: PaneId,
    direction: PaneDirection,
    viewport: LayoutFrameInput["viewport"],
    maximizedPaneId: PaneId | null = null,
  ): PaneId | null {
    const source = this.locationForPane(paneId);
    if (!source) {
      return null;
    }
    const availableHeight = this.availablePaneHeight(viewport.height);
    const columnVisualFrames = (column: WorkspaceColumn) =>
      this.columnVisualFrames(column, availableHeight, maximizedPaneId);
    if (isVerticalDirection(direction)) {
      return paneInVerticalVisualDirection({
        adjacentPlaneIndex: (planeIndex, targetDirection) =>
          this.adjacentPlaneIndex(planeIndex, targetDirection),
        columnVisualFrames,
        columns: this.columns,
        direction,
        nearestColumnInPlaneByHorizontalCenter: (planeIndex, targetSource) =>
          this.nearestColumnInPlaneByHorizontalCenter(planeIndex, targetSource, viewport.width),
        source,
        viewport,
      });
    }
    return paneInHorizontalVisualDirection({
      columns: this.columns,
      direction,
      source,
    });
  }

  renderFrame(input: LayoutFrameInput, push: (item: PaneRenderItem) => void): void {
    if (this.columns.length === 0 || input.viewport.width <= 0 || input.viewport.height <= 0) {
      return;
    }

    if (input.presentationMode === "overview" && this.paneInsertFramePreview) {
      return this.renderInsertFramePreview(input, push);
    }

    const previewColumns = this.paneReorderPreviewColumns();
    if (!previewColumns) {
      return this.renderCommittedFrame(input, push);
    }

    // A drop preview reflows the scene. In overview the frame transform (scale,
    // centering, pan bounds) is computed from the committed columns and frozen
    // for the preview, so the visible zoom never snaps and the drag's
    // screen-space hit rects stay valid; only the per-pane offsets follow the
    // preview. Normal mode has a constant (scale 1) frame and needs no freeze.
    const overviewFrameOverride =
      input.presentationMode === "overview" ? this.overviewFrameTransform(input) : undefined;

    const committedColumns = this.columns;
    this.columns = previewColumns;
    try {
      this.renderCommittedFrame(input, push, overviewFrameOverride);
    } finally {
      this.columns = committedColumns;
    }
  }

  private renderCommittedFrame(
    input: LayoutFrameInput,
    push: (item: PaneRenderItem) => void,
    overviewFrameOverride?: OverviewFrameTransform,
  ): void {
    if (input.presentationMode === "overview") {
      this.renderOverviewFrame(input, push, overviewFrameOverride);
    } else {
      this.renderNormalFrame(input, push);
    }
  }

  renamePane(paneId: PaneId, title: string): boolean {
    const pane = this.paneById.get(paneId);
    const normalizedTitle = title.trim();
    if (!pane || normalizedTitle.length === 0 || pane.title === normalizedTitle) {
      return false;
    }
    this.paneById.set(paneId, {
      ...pane,
      title: normalizedTitle,
    });
    return true;
  }

  applyPaneDropIntent(sourcePaneId: PaneId, intent: PaneDropIntent): boolean {
    const result = applyPaneDropIntentToColumns(
      this.columns,
      sourcePaneId,
      intent,
      this.paneDropColumnOptions(sourcePaneId, intent),
    );
    if (!result.changed) {
      return false;
    }
    this.columns = result.columns;
    if (paneDropIntentCreatesColumn(intent)) {
      this.nextColumnSequence += 1;
    }
    if (intent.kind === "swap") {
      this.applyPaneSwapState(sourcePaneId, intent.targetPaneId);
    } else {
      this.applyPaneDropPaneState(sourcePaneId, result);
    }
    this.reindexColumns();
    return true;
  }

  // A swap exchanges two panes' slots, so both panes' column back-references
  // change. The generic pane-state path only knows the source, so handle the
  // pair here.
  private applyPaneSwapState(sourcePaneId: PaneId, targetPaneId: PaneId): void {
    const sourcePane = this.paneById.get(sourcePaneId);
    const targetPane = this.paneById.get(targetPaneId);
    if (!sourcePane || !targetPane) {
      return;
    }
    const sourceColumnId = sourcePane.columnId;
    this.paneById.set(sourcePaneId, { ...sourcePane, columnId: targetPane.columnId });
    this.paneById.set(targetPaneId, { ...targetPane, columnId: sourceColumnId });
  }

  reorderPaneBefore(sourcePaneId: PaneId, targetPaneId: PaneId): boolean {
    const result = reorderPaneColumnBefore(this.columns, sourcePaneId, targetPaneId);
    if (!result.changed) {
      return false;
    }
    this.columns = result.columns;
    this.applyPaneDropPaneState(sourcePaneId, result);
    this.reindexColumns();
    return true;
  }

  previewPaneDropIntent(sourcePaneId: PaneId, intent: PaneDropIntent): boolean {
    const nextPreview = { intent, sourcePaneId };
    if (
      this.paneReorderPreview?.sourcePaneId === nextPreview.sourcePaneId &&
      samePaneDropIntent(this.paneReorderPreview.intent, nextPreview.intent)
    ) {
      return false;
    }
    this.paneReorderPreview = nextPreview;
    return true;
  }

  previewPaneReorder(
    sourcePaneId: PaneId,
    targetPaneId: PaneId,
    placement: PaneReorderPlacement,
  ): boolean {
    return this.previewPaneDropIntent(sourcePaneId, {
      kind: "row",
      placement,
      targetPaneId,
    });
  }

  clearPaneReorderPreview(): boolean {
    if (!this.paneReorderPreview) {
      return false;
    }
    this.paneReorderPreview = null;
    return true;
  }

  hasPaneReorderPreview(): boolean {
    return this.paneReorderPreview !== null;
  }

  // Preview inserting a new empty frame next to an anchor pane (the overview
  // "add pane here" affordance). Non-committing: the layout reflows as if the
  // pane existed, but nothing is mutated permanently. Returns true when the
  // previewed slot changed.
  previewInsertFrame(anchorPaneId: PaneId, placement: PaneInsertionPlacement): boolean {
    if (!this.paneById.has(anchorPaneId)) {
      return false;
    }
    if (
      this.paneInsertFramePreview?.anchorPaneId === anchorPaneId &&
      this.paneInsertFramePreview.placement === placement
    ) {
      return false;
    }
    this.paneInsertFramePreview = { anchorPaneId, placement };
    return true;
  }

  clearInsertFramePreview(): boolean {
    if (!this.paneInsertFramePreview) {
      return false;
    }
    this.paneInsertFramePreview = null;
    return true;
  }

  hasInsertFramePreview(): boolean {
    return this.paneInsertFramePreview !== null;
  }

  insertFramePreview(): { anchorPaneId: PaneId; placement: PaneInsertionPlacement } | null {
    return this.paneInsertFramePreview ? { ...this.paneInsertFramePreview } : null;
  }

  // The exact stage rect the previewed new pane occupies, computed by running the
  // real insert on a snapshot and reading the placeholder's rendered item, then
  // restoring. Matches what `renderFrame` reflows, so the affordance lands on the
  // real slot.
  overviewInsertPreviewBounds(
    viewport: Rect,
    maximizedPaneId: PaneId | null = null,
    overviewZoom = 1,
    // The live overview pan must be applied here too: the renderer offsets every
    // pane by `overviewPanX/Y` (see renderOverviewLayoutFrame), so computing the
    // affordance slot at pan 0 would leave the "add pane" ghost behind by the pan
    // amount once the user has panned/zoomed the overview.
    overviewPanX = 0,
    overviewPanY = 0,
  ): OverviewInsertPreviewRect | null {
    const preview = this.paneInsertFramePreview;
    if (!preview || !this.paneById.has(preview.anchorPaneId)) {
      return null;
    }
    const frameInput: LayoutFrameInput = {
      focusedPaneId: this.focusedPaneAt(0, 0),
      maximizedPaneId,
      movementPhase: "idle",
      overviewPanX,
      overviewPanY,
      overviewZoom,
      presentationMode: "overview",
      scrollColumn: 0,
      scrollRow: 0,
      viewport,
    };
    // Freeze the camera to the committed layout, so the affordance sits on the
    // slot at the unchanged scale/centering (see renderInsertFramePreview).
    const frameOverride = this.overviewFrameTransform(frameInput);
    const saved = this.snapshotMutableState();
    let rect: OverviewInsertPreviewRect | null = null;
    try {
      const placeholderId = this.openPaneNearPane(
        preview.anchorPaneId,
        preview.placement,
        insertPreviewRequest,
      );
      this.renderOverviewFrame(
        frameInput,
        (item) => {
          if (item.paneId === placeholderId) {
            rect = {
              height: item.height * item.scale,
              left: item.x,
              top: item.y,
              width: item.width * item.scale,
            };
          }
        },
        frameOverride,
      );
    } finally {
      this.restoreMutableState(saved);
    }
    return rect;
  }

  // Reflow the overview as if the previewed pane existed, but never render the
  // placeholder itself (the "add pane" affordance marks its slot) and never
  // commit: the real insert runs on a snapshot that is restored afterwards.
  private renderInsertFramePreview(
    input: LayoutFrameInput,
    push: (item: PaneRenderItem) => void,
  ): void {
    const preview = this.paneInsertFramePreview;
    if (!preview || !this.paneById.has(preview.anchorPaneId)) {
      this.renderOverviewFrame(input, push);
      return;
    }
    // Freeze the camera (scale/centering/pan) to the committed layout so hovering
    // an add slot never rescales or recenters the overview; only the panes shift
    // to open the new slot -- exactly like the drag preview.
    const frameOverride = this.overviewFrameTransform(input);
    const saved = this.snapshotMutableState();
    try {
      const placeholderId = this.openPaneNearPane(
        preview.anchorPaneId,
        preview.placement,
        insertPreviewRequest,
      );
      this.renderOverviewFrame(
        input,
        (item) => {
          if (item.paneId !== placeholderId) {
            push(item);
          }
        },
        frameOverride,
      );
    } finally {
      this.restoreMutableState(saved);
    }
  }

  private snapshotMutableState(): EngineMutableState {
    return {
      columns: this.columns.map((column) => ({ ...column, paneIds: [...column.paneIds] })),
      nextColumnSequence: this.nextColumnSequence,
      nextPaneSequence: this.nextPaneSequence,
      paneById: new Map(this.paneById),
    };
  }

  private restoreMutableState(saved: EngineMutableState): void {
    this.columns = saved.columns;
    this.nextColumnSequence = saved.nextColumnSequence;
    this.nextPaneSequence = saved.nextPaneSequence;
    this.paneById = saved.paneById;
  }

  private renderNormalFrame(input: LayoutFrameInput, push: (item: PaneRenderItem) => void): void {
    renderNormalLayoutFrame({
      availableHeight: this.availablePaneHeight(input.viewport.height),
      columns: this.columns,
      fullSizePanes: this.compactLayout,
      geometry: this.columnGeometry(input.viewport.width, input.maximizedPaneId),
      input,
      paneById: this.paneById,
      planeIndexes: this.planeIndexes(),
      push,
      scene: this.renderScene(),
    });
  }

  private paneReorderPreviewColumns(): WorkspaceColumn[] | null {
    if (!this.paneReorderPreview) {
      return null;
    }
    // A swap previews as a target-pane highlight only (no layout reflow), so the
    // committed columns render unchanged while the drag is in progress.
    if (this.paneReorderPreview.intent.kind === "swap") {
      return null;
    }
    const result = applyPaneDropIntentToColumns(
      this.columns,
      this.paneReorderPreview.sourcePaneId,
      this.paneReorderPreview.intent,
      this.paneDropColumnOptions(
        this.paneReorderPreview.sourcePaneId,
        this.paneReorderPreview.intent,
        "preview",
      ),
    );
    return result.changed
      ? result.columns.map((column, index) => ({
          ...column,
          index,
        }))
      : null;
  }

  lockColumnWidth(columnId: ColumnId, viewportWidth: number): void {
    const column = this.requireColumn(columnId);
    const resolvedWidth = this.resolvedColumnWidth(column.columnId, viewportWidth);
    const slotIndex = columnSlotIndex(column);
    for (const slotColumn of this.columns) {
      if (columnSlotIndex(slotColumn) !== slotIndex) {
        continue;
      }
      const previousProportion =
        slotColumn.widthSpec.unit === "proportion"
          ? slotColumn.widthSpec.value
          : slotColumn.previousProportionWidth;
      slotColumn.previousProportionWidth = previousProportion;
      slotColumn.widthSpec = { unit: "px", value: Math.max(minimumColumnWidth, resolvedWidth) };
    }
  }

  resizeColumn(columnId: ColumnId, width: ColumnWidthSpec): void {
    const column = this.requireColumn(columnId);
    this.resizeColumnsInSlot(columnSlotIndex(column), width);
  }

  setPaneTerminalConfig(paneId: PaneId, terminalConfig: TerminalPaneConfig): void {
    const pane = this.paneById.get(paneId);
    if (!pane) {
      throw new Error(`unknown workspace pane ${paneId}`);
    }
    if (pane.surfaceKind !== "terminal") {
      throw new Error(`workspace pane ${paneId} is not a terminal pane`);
    }
    this.paneById.set(paneId, {
      ...pane,
      terminalConfig: normalizeTerminalPaneConfig(terminalConfig),
    });
  }

  resetColumnWidth(columnId: ColumnId): void {
    const column = this.requireColumn(columnId);
    this.resizeColumnsInSlot(columnSlotIndex(column), column.idealWidthSpec);
  }

  resizePane(paneId: PaneId, heightPx: number | null): void {
    const pane = this.paneById.get(paneId);
    if (!pane) {
      return;
    }
    const nextHeightPx = normalizedPaneHeightPx(heightPx);
    this.paneById.set(paneId, {
      ...pane,
      ...(nextHeightPx === null ? { heightPx: undefined } : { heightPx: nextHeightPx }),
    });
  }

  resizePaneSplit(
    upperPaneId: PaneId,
    lowerPaneId: PaneId,
    upperHeightWeight: number,
    lowerHeightWeight: number,
  ): boolean {
    const upperLocation = this.locationForPane(upperPaneId);
    const lowerLocation = this.locationForPane(lowerPaneId);
    if (
      !upperLocation ||
      !lowerLocation ||
      upperLocation.columnIndex !== lowerLocation.columnIndex ||
      lowerLocation.rowIndex !== upperLocation.rowIndex + 1
    ) {
      return false;
    }
    const upperPane = this.paneById.get(upperPaneId);
    const lowerPane = this.paneById.get(lowerPaneId);
    if (!upperPane || !lowerPane) {
      return false;
    }
    this.paneById.set(upperPaneId, {
      ...upperPane,
      weight: normalizedPaneWeight(upperHeightWeight),
    });
    this.paneById.set(lowerPaneId, {
      ...lowerPane,
      weight: normalizedPaneWeight(lowerHeightWeight),
    });
    return true;
  }

  splitPane(paneId: PaneId, direction: PaneDirection): PaneId {
    const source = this.locationForPane(paneId);
    if (!source) {
      return this.openPane({});
    }
    if (isHorizontalDirection(direction)) {
      const columnId = this.insertAdjacentColumn(source, direction).columnId;
      return this.openPane({ columnId });
    }
    const createdPaneId = this.openPane({ columnId: this.columns[source.columnIndex]?.columnId });
    this.insertPaneBesideSource(createdPaneId, source, direction);
    return createdPaneId;
  }

  splitPaneToPlane(paneId: PaneId, direction: "up" | "down"): PaneId {
    const source = this.locationForPane(paneId);
    if (!source) {
      return this.openPane({});
    }
    const targetPlaneIndex = source.planeIndex + (direction === "up" ? -1 : 1);
    const sourceColumn = this.columns[source.columnIndex];
    const columnId = this.insertColumnInPlaneSlot(
      targetPlaneIndex,
      sourceColumn ? columnSlotIndex(sourceColumn) : source.planeColumnIndex,
      sourceColumn?.widthSpec,
    ).columnId;
    return this.openPane({ columnId });
  }

  unlockColumnWidth(columnId: ColumnId, viewportWidth: number): void {
    const column = this.requireColumn(columnId);
    if (column.widthSpec.unit === "proportion") {
      return;
    }
    const unlockedProportion =
      column.previousProportionWidth ??
      nearestColumnWidthPreset(column.widthSpec.value / this.availableWidth(viewportWidth));
    this.resizeColumnsInSlot(columnSlotIndex(column), {
      unit: "proportion",
      value: nearestColumnWidthPreset(unlockedProportion),
    });
  }

  resolvedColumnWidth(columnId: ColumnId, viewportWidth: number): number {
    return this.resolveColumnWidth(this.requireColumn(columnId), viewportWidth);
  }

  verticalScrollOffsetForPane(
    paneId: PaneId,
    viewportHeight: number,
    maximizedPaneId: PaneId | null = null,
  ): number {
    const location = this.locationForPane(paneId);
    if (!location) {
      return 0;
    }
    const focusedColumn = this.columns[location.columnIndex];
    if (!focusedColumn) {
      return 0;
    }
    const availableHeight = this.availablePaneHeight(viewportHeight);
    const planeGeometry = planeGeometryForLayout({
      availableHeight,
      columns: this.columns,
      fullSizePanes: this.compactLayout,
      maximizedPaneId,
      padding: this.renderScene().padding,
      paneById: this.paneById,
      planeGap: this.scene.columnGap,
      planeIndexes: this.planeIndexes(),
      rowGap: this.scene.rowGap,
      viewportHeight,
    });
    const planeOffset = planeGeometry.offsets.get(location.planeIndex) ?? 0;
    if (!this.compactLayout) {
      return planeOffset;
    }
    return (
      planeOffset +
      scrollOffsetForColumn(
        location.rowIndex,
        this.columnVisualFrames(focusedColumn, availableHeight, maximizedPaneId).map(
          (frame) => frame.top,
        ),
      )
    );
  }

  scrollColumnForFocusedColumnVisibility(
    focusedColumnIndex: number,
    currentScrollColumn: number,
    viewportWidth: number,
    maximizedPaneId: PaneId | null = null,
  ): number {
    const focusedColumn = this.columns[focusedColumnIndex];
    const geometry = this.columnGeometry(viewportWidth, maximizedPaneId, 0);
    if (!focusedColumn) {
      return this.constrainScrollColumnToViewport(currentScrollColumn, viewportWidth, geometry);
    }
    return this.constrainScrollColumnToViewport(
      this.scrollColumnForColumn(focusedColumn),
      viewportWidth,
      geometry,
    );
  }

  horizontalScrollColumnForPane(paneId: PaneId): number {
    const location = this.locationForPane(paneId);
    const column = location ? this.columns[location.columnIndex] : undefined;
    return column ? this.scrollColumnForColumn(column) : 0;
  }

  totalColumnOverflowWidth(viewportWidth: number): number {
    const geometry = this.columnGeometry(viewportWidth, null, 0);
    return this.scenePadding() * 2 + this.maxUnscaledPlaneWidth(geometry);
  }

  toScene(id: string = this.scene.id): WorkspaceScene {
    const columns = this.columns.map((column, index) => ({
      ...column,
      idealWidthSpec: { ...column.idealWidthSpec },
      index,
      paneIds: [...column.paneIds],
      slotIndex: columnSlotIndex(column),
      widthSpec: { ...column.widthSpec },
    }));
    const panes = [...this.paneById.values()].sort((left, right) => left.sequence - right.sequence);
    const widestPlaneColumnCount = Math.max(
      1,
      ...this.planeIndexes().map((planeIndex) => this.columnsInPlane(planeIndex).length),
    );
    return {
      ...this.scene,
      columns,
      id,
      paneById: new Map(panes.map((pane) => [pane.paneId, pane])),
      panes,
      panesPerColumn: Math.max(1, ...columns.map((column) => column.paneIds.length)),
      totalPanes: panes.length,
      visibleColumnCount: Math.min(this.scene.visibleColumnCount, widestPlaneColumnCount),
    };
  }
}
