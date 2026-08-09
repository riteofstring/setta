# Generated public API review

A nested spatial workbench for React.

This file is a human-review artifact generated from the built package. It is not a compatibility promise or a checked-in API snapshot.

## Declared package entry points

| Specifier | Types | Import |
| --- | --- | --- |
| `@setta/workspace` | `./dist/index.d.ts` | `./dist/index.js` |
| `@setta/workspace/core` | `./dist/core.d.ts` | `./dist/core.js` |
| `@setta/workspace/react` | `./dist/react.d.ts` | `./dist/react.js` |
| `@setta/workspace/testing` | `./dist/testing.d.ts` | `./dist/testing.js` |
| `@setta/workspace/styles.css` | — | `./dist/styles.css` |

## Declaration closure (50 files)

### core.d.ts

export { createFilteredSortableItemTree, reconcileFilteredSortableItemMove, } from "./internal/sortable-item-filtering.js";
export { planSortableItemKeyboardMove } from "./internal/sortable-item-keyboard-move.js";
export { applySortableItemListMove, planSortableItemListMove, validateSortableItemLists, } from "./internal/sortable-item-lists.js";
export type { SortableItemList, SortableItemListDragBlock, SortableItemListMoveDecision, SortableItemListMoveInput, SortableItemListMovePlan, SortableItemListMoveRejectionCode, } from "./internal/sortable-item-lists.js";
export { applySortableItemMove } from "./internal/sortable-item-move-application.js";
export { planSortableItemMove } from "./internal/sortable-item-move-planning.js";
export { normalizeSortableItemSelectionRoots, resolveSortableItemDragBlock, resolveSortableItemSelectionChange, } from "./internal/sortable-item-selection.js";
export type { ItemMovePlan, SortableItemDragBlock, SortableItemKeyboardCommand, SortableItemKeyboardMoveInput, SortableItemMoveDecision, SortableItemMoveInput, SortableItemMoveRejectionCode, SortableItemSelectionMode, SortableItemTree, } from "./internal/sortable-item-tree-contract.js";
export { SortableItemTreeValidationError, deriveSortableItemParentLookup, getSortableItemOrder, validateSortableItemTree, } from "./internal/sortable-item-tree-validation.js";
export type { SortableItemTreeValidationCode } from "./internal/sortable-item-tree-validation.js";
export { WORKSPACE_CLIPBOARD_MIME_TYPE, WORKSPACE_CLIPBOARD_SCHEMA_VERSION, createWorkspaceJsonClipboardAdapter, } from "./internal/workspace-clipboard.js";
export type { WorkspaceClipboardAdapter, WorkspaceClipboardCloneDecision, WorkspaceClipboardCloneRejectionCode, WorkspaceClipboardCloneRequest, WorkspaceClipboardItem, WorkspaceClipboardSectionClone, WorkspaceJsonClipboardAdapterOptions, WorkspaceJsonClipboardDataValidationRequest, WorkspaceTextClipboard, } from "./internal/workspace-clipboard.js";
export { WORKSPACE_CONNECTIONS_SCHEMA_VERSION, createEmptyWorkspaceConnections, parseWorkspaceConnections, resolveWorkspacePortPosition, serializeWorkspaceConnections, validateWorkspaceConnections, } from "./internal/workspace-connections.js";
export type { WorkspaceConnectionRect, WorkspaceConnections, WorkspaceEdge, WorkspaceEdgeEndpoint, WorkspacePort, WorkspacePortSide, } from "./internal/workspace-connections.js";
export { WORKSPACE_DOCUMENT_SCHEMA_VERSION } from "./internal/workspace-document-contract.js";
export type { SectionChildPositioning, SectionChrome, SectionDimension, SectionDimensionMode, SectionOrientation, SectionOverflow, WorkspaceChildLayout, WorkspaceChildLayoutPositioningChange, WorkspaceDocument, WorkspaceFreeformChildLayout, WorkspaceJsonValue, WorkspaceOrderedChildLayout, WorkspaceParentLookup, WorkspacePoint, WorkspaceRootSection, WorkspaceSection, WorkspaceSectionPresentation, WorkspaceSectionSize, WorkspaceViewport, } from "./internal/workspace-document-contract.js";
export { WorkspaceDocumentValidationError, isValidWorkspaceColor, parseWorkspaceDocument, serializeWorkspaceDocument, validateWorkspaceDocument, } from "./internal/workspace-document-validation.js";
export type { WorkspaceDocumentValidationCode } from "./internal/workspace-document-validation.js";
export { createEmptyWorkspaceDocument, deriveWorkspaceParentLookup, getAdjacentWorkspaceSectionId, getWorkspaceNavigationOrder, getWorkspaceSectionOrder, isWorkspaceSectionDescendant, } from "./internal/workspace-document.js";
export { WORKSPACE_DEFAULT_CAPABILITIES, WORKSPACE_DEFAULT_GESTURE_OPTIONS, WORKSPACE_DEFAULT_ZOOM, WORKSPACE_MAX_ZOOM, WORKSPACE_MIN_ZOOM, resolveWorkspaceCapabilities, resolveWorkspaceGestureOptions, } from "./internal/workspace-policy.js";
export type { WorkspaceActivationKey, WorkspaceCapabilities, WorkspaceCapabilityOverrides, WorkspaceGestureOptionOverrides, WorkspaceGestureOptions, WorkspacePanOnScrollMode, } from "./internal/workspace-policy.js";
export { packWorkspaceRectangles, planWorkspaceRootAutoLayout, } from "./internal/workspace-root-auto-layout.js";
export type { WorkspacePackedRectangle, WorkspacePackingRectangle, WorkspaceRectanglePackingInput, WorkspaceRootAutoLayoutInput, WorkspaceRootAutoLayoutPlan, WorkspaceRootAutoLayoutRectangle, } from "./internal/workspace-root-auto-layout.js";
export { planWorkspaceSectionPlacement } from "./internal/workspace-smart-placement.js";
export type { WorkspacePlacementRect, WorkspacePlacementSize, WorkspaceSmartPlacementInput, WorkspaceSmartPlacementResult, } from "./internal/workspace-smart-placement.js";
export type { WorkspaceActionRejectionReason, WorkspaceActionResult, WorkspaceAppearance, WorkspaceAppearanceOptionOverrides, WorkspaceAppearanceOptions, WorkspaceController, WorkspaceCreateSectionOptions, WorkspaceDocumentChange, WorkspaceDocumentChangeReason, WorkspaceFitOptions, WorkspaceGridOptionOverrides, WorkspaceGridOptions, WorkspaceGridPattern, WorkspaceHistoryState, WorkspaceRootAutoLayoutOptions, WorkspaceThemeTokens, } from "./internal/workspace-surface-contract.js";
export { WORKSPACE_VIEWPORT_PRESETS_SCHEMA_VERSION, parseWorkspaceViewportPresets, serializeWorkspaceViewportPresets, validateWorkspaceViewportPresets, } from "./internal/workspace-viewport-presets.js";
export type { WorkspaceViewportPreset } from "./internal/workspace-viewport-presets.js";
//# sourceMappingURL=core.d.ts.map
### index.d.ts

export * from "./core.js";
export * from "./react.js";
export { SortableItemLists, SortableItemTree } from "./react.js";
//# sourceMappingURL=index.d.ts.map
### internal/adapter-proof-drag-planning.d.ts

import { type CollisionTrackerState, type ListOrientation } from "./collision-characterization.js";
import type { WorkspaceGeometryIndex } from "./geometry-index.js";
import { type InteractionPoint, type InteractionRect } from "./interaction-geometry.js";
import { type SectionMovePlan, type WorkspaceSectionMoveMode } from "./section-move-planning.js";
import type { SectionHierarchySnapshot } from "./selection-planning.js";
export declare const ADAPTER_PROOF_CANVAS_TARGET_ID = "adapter-proof-canvas";
export declare function adapterProofWorkspaceRects(geometryIndex: WorkspaceGeometryIndex): Readonly<Record<string, InteractionRect>>;
export type AdapterProofDragSession = {
    activatorPoint: InteractionPoint | null;
    clientRectsById: Readonly<Record<string, InteractionRect>>;
    collisionState: CollisionTrackerState;
    hierarchy: SectionHierarchySnapshot;
    mode: WorkspaceSectionMoveMode;
    sectionIds: readonly string[];
    sourceClientBounds: InteractionRect;
    sourceWorkspaceBounds: InteractionRect;
    workspaceRectsById: Readonly<Record<string, InteractionRect>>;
};
export type AdapterProofDragPreview = {
    collisionState: CollisionTrackerState;
    destinationBounds: InteractionRect;
    destinationKey: string;
    order: readonly string[];
    plan: SectionMovePlan;
    targetId: string;
};
export type AdapterProofPreviewResolution = {
    collisionState: CollisionTrackerState;
    preview: AdapterProofDragPreview | null;
    reason: string | null;
};
export declare function resolveAdapterProofDragPreview({ orientation, screenDelta, session, targetId, zoom, }: {
    orientation(parentId: string | null): ListOrientation;
    screenDelta: InteractionPoint;
    session: AdapterProofDragSession;
    targetId: string | null;
    zoom: number;
}): AdapterProofPreviewResolution;
export declare function adapterProofSelectionBounds(sectionIds: readonly string[], rectsById: Readonly<Record<string, InteractionRect>>): InteractionRect | null;
export declare function serializeAdapterProofPlan(plan: SectionMovePlan): string;
//# sourceMappingURL=adapter-proof-drag-planning.d.ts.map
### internal/adapter-proof-model.d.ts

import type { ListOrientation } from "./collision-characterization.js";
import type { SectionHierarchySnapshot } from "./selection-planning.js";
export type AdapterProofSection = {
    id: string;
    title: string;
    width: number;
};
export type AdapterProofNestedSection = AdapterProofSection & {
    children?: readonly AdapterProofNestedSection[];
};
export declare const ADAPTER_PROOF_SECTIONS: Readonly<Record<string, AdapterProofSection>>;
export declare const INITIAL_ADAPTER_PROOF_HIERARCHY: SectionHierarchySnapshot;
export declare const ADAPTER_PROOF_ORIENTATIONS: Readonly<Record<string, ListOrientation>>;
export declare function requireAdapterProofSection(sectionId: string): AdapterProofSection;
export declare function adapterProofOrientation(parentId: string | null): ListOrientation;
export declare function buildAdapterProofNestedSections(hierarchy: SectionHierarchySnapshot, parentId: string): readonly AdapterProofNestedSection[];
//# sourceMappingURL=adapter-proof-model.d.ts.map
### internal/collision-characterization.d.ts

import type { InteractionPoint, InteractionRect } from "./interaction-geometry.js";
export type ListOrientation = "horizontal" | "vertical";
export type CollisionCandidate = {
    id: string;
    intersectionArea: number;
    orientation: ListOrientation;
    rect: InteractionRect;
    sortableContainerId: string | null;
    triggerDistance: number | null;
};
export type CollisionTrackerState = {
    pastMidpoint: boolean | null;
    pointer: InteractionPoint | null;
    pointerDirection: InteractionPoint | null;
    targetId: string | null;
    targetRect: InteractionRect | null;
};
export type CollisionResolution = {
    candidate: CollisionCandidate | null;
    state: CollisionTrackerState;
};
export declare const EMPTY_COLLISION_TRACKER_STATE: CollisionTrackerState;
export declare function clearCollisionTarget(state: CollisionTrackerState): CollisionTrackerState;
export declare function resolveCollisionFrame({ activeRect, candidates, parentByChild, pointer, previousState, }: {
    activeRect: InteractionRect;
    candidates: readonly CollisionCandidate[];
    parentByChild: Readonly<Record<string, string | null>>;
    pointer: InteractionPoint | null;
    previousState?: CollisionTrackerState;
}): CollisionResolution;
export declare function pickCollisionCandidate(candidates: readonly CollisionCandidate[], parentByChild: Readonly<Record<string, string | null>>, previousTargetId?: string | null): CollisionCandidate | null;
//# sourceMappingURL=collision-characterization.d.ts.map
### internal/geometry-index.d.ts

import { type InteractionPoint, type ViewportTransform } from "./interaction-geometry.js";
export type ScreenPoint = InteractionPoint;
export type WorkspacePoint = InteractionPoint;
export type ScreenRect = ScreenPoint & {
    width: number;
    height: number;
};
export type WorkspaceRect = WorkspacePoint & {
    width: number;
    height: number;
};
export type MarqueeSelectionMode = "full" | "partial";
export type MeasuredWorkspaceFrame = {
    sectionId: string;
    parentSectionId: string | null;
    depth: number;
    order: number;
    rect: WorkspaceRect;
};
export type GeometryDropTarget = {
    targetSectionId: string | null;
    workspacePosition: WorkspacePoint;
};
export type GeometryRegistration = {
    update(frame: MeasuredWorkspaceFrame): void;
    dispose(): void;
};
export declare class WorkspaceGeometryIndex {
    #private;
    get size(): number;
    get revision(): number;
    subscribe(listener: () => void): () => void;
    register(frame: MeasuredWorkspaceFrame): GeometryRegistration;
    has(sectionId: string): boolean;
    get(sectionId: string): MeasuredWorkspaceFrame | undefined;
    require(sectionId: string): MeasuredWorkspaceFrame;
    directChildren(parentSectionId: string | null): readonly MeasuredWorkspaceFrame[];
    framesAt(point: WorkspacePoint): readonly MeasuredWorkspaceFrame[];
    bounds(sectionIds: readonly string[]): WorkspaceRect;
    boundsWhenReady(sectionIds: readonly string[]): WorkspaceRect | null;
    framesInRect(rect: WorkspaceRect, mode: MarqueeSelectionMode): readonly MeasuredWorkspaceFrame[];
    selectionRoots(sectionIds: readonly string[]): readonly string[];
    snapshot(): readonly MeasuredWorkspaceFrame[];
}
export declare function clientPointToWorkspace(point: ScreenPoint, viewportBounds: ScreenRect, transform: ViewportTransform): WorkspacePoint;
export declare function clientRectToWorkspace(rect: ScreenRect, viewportBounds: ScreenRect, transform: ViewportTransform): WorkspaceRect;
export declare function workspacePointToClient(point: WorkspacePoint, viewportBounds: ScreenRect, transform: ViewportTransform): ScreenPoint;
export declare function workspaceRectToClient(rect: WorkspaceRect, viewportBounds: ScreenRect, transform: ViewportTransform): ScreenRect;
export declare function resolveGeometryDropTarget(index: WorkspaceGeometryIndex, clientPoint: ScreenPoint, viewportBounds: ScreenRect, transform: ViewportTransform, excludedSectionIds?: ReadonlySet<string>): GeometryDropTarget;
//# sourceMappingURL=geometry-index.d.ts.map
### internal/interaction-geometry.d.ts

export type InteractionPoint = {
    x: number;
    y: number;
};
export type InteractionRect = InteractionPoint & {
    width: number;
    height: number;
    right: number;
    bottom: number;
};
export type ViewportTransform = InteractionPoint & {
    zoom: number;
};
export type DragTransform = InteractionPoint & {
    scaleX: number;
    scaleY: number;
};
export declare function normalizeScreenDelta(delta: InteractionPoint, zoom: number): InteractionPoint;
export declare function screenPointToWorkspace(point: InteractionPoint, viewport: ViewportTransform): InteractionPoint;
export declare function workspacePointToScreen(point: InteractionPoint, viewport: ViewportTransform): InteractionPoint;
export declare function resolveRectBoundsById(ids: readonly string[], rectsById: Readonly<Record<string, InteractionRect>>): InteractionRect | null;
export declare function resolveCanvasDropPositions(ids: readonly string[], rectsById: Readonly<Record<string, InteractionRect>>, screenDelta: InteractionPoint, viewport: ViewportTransform): Readonly<Record<string, InteractionPoint>> | null;
export declare function createInteractionRect(x: number, y: number, width: number, height: number): InteractionRect;
export declare function serializeDragTransform(transform: DragTransform | null): string;
//# sourceMappingURL=interaction-geometry.d.ts.map
### internal/interaction-owner.d.ts

import type { WorkspaceSectionMoveMode } from "./section-move-planning.js";
export type InteractionInput = "keyboard" | "pointer" | "touch";
export type InteractionSurface = "canvas" | "host-content" | "item-handle" | "nested-section-handle" | "root-section-handle";
export type InteractionOwner = "item-tree" | "root-layout" | "section-structure" | "viewport";
export type InteractionOwnershipState = {
    owner: InteractionOwner | null;
    phase: "active" | "idle";
};
export type InteractionActivationPolicy = {
    itemTreeEnabled: boolean;
    rootLayoutEnabled: boolean;
    sectionStructureEnabled: boolean;
    viewportEnabled: boolean;
};
export type InteractionStart = {
    input: InteractionInput;
    itemMovementEnabled: boolean;
    layoutEnabled: boolean;
    sectionMode: WorkspaceSectionMoveMode;
    structureEnabled: boolean;
    surface: InteractionSurface;
    viewportOverride: boolean;
};
export type InteractionOwnershipEvent = {
    type: "cancel";
} | {
    type: "complete";
} | {
    type: "mode-change";
    sectionMode: WorkspaceSectionMoveMode;
} | {
    type: "start";
    request: InteractionStart;
};
export declare const IDLE_INTERACTION_OWNERSHIP: InteractionOwnershipState;
export declare function transitionInteractionOwnership(state: InteractionOwnershipState, event: InteractionOwnershipEvent): InteractionOwnershipState;
export declare function resolveStartOwner(request: InteractionStart): InteractionOwner | null;
export declare function resolveInteractionActivationPolicy(state: InteractionOwnershipState, sectionMode: WorkspaceSectionMoveMode): InteractionActivationPolicy;
//# sourceMappingURL=interaction-owner.d.ts.map
### internal/nested-freeform-representation-proof.d.ts

export type NestedFreeformRepresentationCandidateId = "all-sections-xyflow" | "nested-xyflow" | "recursive-dom";
export type NestedFreeformRepresentationCandidate = Readonly<{
    id: NestedFreeformRepresentationCandidateId;
    label: string;
    reasons: readonly string[];
    selected: boolean;
}>;
export declare const NESTED_FREEFORM_REPRESENTATION_CANDIDATES: readonly (Readonly<{
    id: "all-sections-xyflow";
    label: "One all-section XYFlow graph";
    reasons: readonly string[];
    selected: false;
}> | Readonly<{
    id: "nested-xyflow";
    label: "One fixed XYFlow viewport per freeform container";
    reasons: readonly string[];
    selected: false;
}> | Readonly<{
    id: "recursive-dom";
    label: "Absolutely positioned recursive DOM";
    reasons: readonly string[];
    selected: true;
}>)[];
export declare function NestedFreeformRepresentationProof(): import("react").JSX.Element;
//# sourceMappingURL=nested-freeform-representation-proof.d.ts.map
### internal/section-move-planning.d.ts

import type { WorkspaceDocument, WorkspaceJsonValue, WorkspacePoint } from "../core.js";
import { type SectionHierarchySnapshot, type SelectionBlockRejectionCode } from "./selection-planning.js";
export type WorkspaceSectionMoveMode = "free" | "sort";
export type SectionMovePlacement = Readonly<{
    index: number;
    type: "ordered";
}> | Readonly<{
    positions: Readonly<Record<string, WorkspacePoint>>;
    type: "freeform";
}>;
export type SectionMoveDestination = Readonly<{
    parentId: string | null;
    placement: SectionMovePlacement;
}>;
export type SectionMovePlan = {
    sectionIds: readonly string[];
    mode: WorkspaceSectionMoveMode;
    sourceParentIds: readonly (string | null)[];
    destination: SectionMoveDestination;
};
export type WorkspaceSectionMoveDecision = Readonly<{
    allowed: false;
    reason: string;
}> | Readonly<{
    allowed: true;
}>;
export type WorkspaceSectionMoveValidationRequest<TSectionData = WorkspaceJsonValue> = Readonly<{
    document: WorkspaceDocument<TSectionData>;
    plan: SectionMovePlan;
}>;
export type WorkspaceSectionMoveValidator<TSectionData = WorkspaceJsonValue> = (request: WorkspaceSectionMoveValidationRequest<TSectionData>) => WorkspaceSectionMoveDecision;
export type SectionMoveRejectionCode = SelectionBlockRejectionCode | "host-policy" | "invalid-move";
export type SectionMoveDecision = {
    status: "planned";
    plan: SectionMovePlan;
} | {
    status: "cancelled";
} | {
    status: "unchanged";
    plan: SectionMovePlan;
} | {
    status: "rejected";
    code: SectionMoveRejectionCode;
    reason: string;
};
export type AppliedHierarchy = SectionHierarchySnapshot;
export declare function resolveWorkspaceSectionMoveDecision(value: WorkspaceSectionMoveDecision): WorkspaceSectionMoveDecision;
export declare function validateWorkspaceSectionMovePlan<TSectionData>(document: WorkspaceDocument<TSectionData>, plan: SectionMovePlan, validator: WorkspaceSectionMoveValidator<TSectionData> | undefined): WorkspaceSectionMoveDecision;
export declare function serializeSectionMovePlan(plan: SectionMovePlan): string;
export declare function sectionMovePlansEqual(left: SectionMovePlan, right: SectionMovePlan): boolean;
export declare function planSectionMove({ cancelled, destination, hierarchy, mode, selectedIds, validate, }: {
    cancelled?: boolean;
    destination: SectionMoveDestination | null;
    hierarchy: SectionHierarchySnapshot;
    mode: WorkspaceSectionMoveMode;
    selectedIds: readonly string[];
    validate?: (plan: SectionMovePlan) => {
        allowed: true;
    } | {
        allowed: false;
        reason: string;
    };
}): SectionMoveDecision;
export declare function applySectionMovePlan(hierarchy: SectionHierarchySnapshot, plan: SectionMovePlan): AppliedHierarchy;
export declare function sectionHierarchySnapshotsEqual(left: SectionHierarchySnapshot, right: SectionHierarchySnapshot): boolean;
//# sourceMappingURL=section-move-planning.d.ts.map
### internal/selection-planning.d.ts

import type { InteractionPoint } from "./interaction-geometry.js";
export type SectionHierarchySnapshot = {
    rootSectionIds: readonly string[];
    childrenByParent: Readonly<Record<string, readonly string[]>>;
    parentByChild: Readonly<Record<string, string | null>>;
    rootPositions: Readonly<Record<string, InteractionPoint>>;
};
export type SelectionBlock = {
    sectionIds: readonly string[];
    sourceParentIds: readonly (string | null)[];
};
export type SelectionBlockRejectionCode = "empty-selection" | "parent-cycle" | "root-layout-missing" | "selection-not-direct-children";
type SelectionBlockRejection = {
    allowed: false;
    code: SelectionBlockRejectionCode;
    reason: string;
};
export type SelectionBlockResult = {
    allowed: true;
    block: SelectionBlock;
} | SelectionBlockRejection;
export declare function resolveSelectionBlock(selectedIds: readonly string[], hierarchy: SectionHierarchySnapshot): SelectionBlockResult;
export declare function selectionContainsSectionOrAncestor(candidateId: string, selectionRootIds: ReadonlySet<string>, parentByChild: Readonly<Record<string, string | null>>): boolean;
export {};
//# sourceMappingURL=selection-planning.d.ts.map
### internal/sortable-item-filtering.d.ts

import type { ItemMovePlan, SortableItemTree } from "./sortable-item-tree-contract.js";
export type SortableItemFilterProjection = Readonly<{
    canonicalTree: SortableItemTree;
    reconcilePlannedMove(plan: ItemMovePlan): ItemMovePlan;
    tree: SortableItemTree;
    visibleItemIds: readonly string[];
}>;
export declare function createSortableItemFilterProjection(tree: SortableItemTree, visibleItemIds: readonly string[]): SortableItemFilterProjection;
export declare function createFilteredSortableItemTree(tree: SortableItemTree, visibleItemIds: readonly string[]): SortableItemTree;
export declare function reconcileFilteredSortableItemMove(tree: SortableItemTree, visibleItemIds: readonly string[], plan: ItemMovePlan): ItemMovePlan;
//# sourceMappingURL=sortable-item-filtering.d.ts.map
### internal/sortable-item-keyboard-move.d.ts

import type { SortableItemKeyboardMoveInput, SortableItemMoveDecision } from "./sortable-item-tree-contract.js";
export declare function planSortableItemKeyboardMove(value: SortableItemKeyboardMoveInput): SortableItemMoveDecision;
//# sourceMappingURL=sortable-item-keyboard-move.d.ts.map
### internal/sortable-item-lists.d.ts

import type { ItemMovePlan, SortableItemMoveRejectionCode, SortableItemTree } from "./sortable-item-tree-contract.js";
export type SortableItemList = Readonly<{
    label: string;
    listId: string;
    tree: SortableItemTree;
}>;
export type SortableItemListDragBlock = Readonly<{
    itemIds: readonly string[];
    selectedItemIds: readonly string[];
    sourceListIds: readonly string[];
    sourceParentIds: readonly string[];
}>;
export type SortableItemListMovePlan = Readonly<{
    destinationIndex: number;
    destinationListId: string;
    destinationParentId: string;
    itemIds: readonly string[];
    sourceListIds: readonly string[];
    sourceParentIds: readonly string[];
}>;
export type SortableItemListMoveRejectionCode = SortableItemMoveRejectionCode | "unknown-destination-list";
type SortableItemListMoveResult = Readonly<{
    block: SortableItemListDragBlock;
    plan: SortableItemListMovePlan;
}>;
export type SortableItemListMoveDecision = (SortableItemListMoveResult & Readonly<{
    status: "planned" | "unchanged";
}>) | Readonly<{
    block: SortableItemListDragBlock;
    code: SortableItemListMoveRejectionCode;
    reason: string;
    status: "rejected";
}>;
export type SortableItemListMoveInput = Readonly<{
    activeItemId: string;
    canContainChildren?: (itemId: string, listId: string) => boolean;
    canMove?: (plan: SortableItemListMovePlan) => boolean;
    destinationIndex: number;
    destinationListId: string;
    destinationParentId: string;
    lists: readonly SortableItemList[];
    selectedItemIds: readonly string[];
}>;
type SortableItemListRoot = Readonly<{
    label: string;
    listId: string;
    publicRootId: string;
    syntheticRootId: string;
}>;
export type SortableItemListsIndex = Readonly<{
    aggregateTree: SortableItemTree;
    aggregateRootId: string;
    itemListIdByItem: ReadonlyMap<string, string>;
    listById: ReadonlyMap<string, SortableItemList>;
    listIdBySyntheticRoot: ReadonlyMap<string, string>;
    roots: readonly SortableItemListRoot[];
    syntheticRootByListId: ReadonlyMap<string, string>;
}>;
export declare function createSortableItemListsIndex(value: readonly SortableItemList[]): SortableItemListsIndex;
export declare function validateSortableItemLists(value: unknown): asserts value is readonly SortableItemList[];
export declare function sortableItemListPlanFromInternal(index: SortableItemListsIndex, plan: ItemMovePlan): SortableItemListMovePlan;
export declare function applySortableItemListMove(lists: readonly SortableItemList[], value: SortableItemListMovePlan): readonly SortableItemList[];
export declare function planSortableItemListMove(value: SortableItemListMoveInput): SortableItemListMoveDecision;
export {};
//# sourceMappingURL=sortable-item-lists.d.ts.map
### internal/sortable-item-move-application.d.ts

import type { ItemMovePlan, SortableItemTree } from "./sortable-item-tree-contract.js";
export declare function applySortableItemMove(tree: SortableItemTree, value: ItemMovePlan): SortableItemTree;
export declare function sortableItemTreesMatch(left: SortableItemTree, right: SortableItemTree): boolean;
//# sourceMappingURL=sortable-item-move-application.d.ts.map
### internal/sortable-item-move-planning.d.ts

import { type SortableItemMoveDecision, type SortableItemMoveInput } from "./sortable-item-tree-contract.js";
export declare function planSortableItemMove(value: SortableItemMoveInput): SortableItemMoveDecision;
//# sourceMappingURL=sortable-item-move-planning.d.ts.map
### internal/sortable-item-selection.d.ts

import type { SortableItemDragBlock, SortableItemSelectionMode, SortableItemTree } from "./sortable-item-tree-contract.js";
import { type SortableItemTreeIndex } from "./sortable-item-tree-validation.js";
export declare function resolveSortableItemSelectionChange(tree: SortableItemTree, selectedItemIds: readonly string[], itemId: string, mode: SortableItemSelectionMode): readonly string[];
export declare function normalizeSortableItemSelectionRoots(tree: SortableItemTree, selectedItemIds: readonly string[]): readonly string[];
export declare function resolveSortableItemDragBlock(tree: SortableItemTree, selectedItemIds: readonly string[], activeItemId: string): SortableItemDragBlock;
export declare function resolveSortableItemDragBlockFromIndex(index: SortableItemTreeIndex, selectedItemIds: readonly string[], activeItemId: string): SortableItemDragBlock;
export declare function resolveSortableItemDragAnchor(index: SortableItemTreeIndex, block: SortableItemDragBlock, activeItemId: string): Readonly<{
    itemId: string;
    parentId: string;
}>;
//# sourceMappingURL=sortable-item-selection.d.ts.map
### internal/sortable-item-tree-contract.d.ts

export type SortableItemTree = Readonly<{
    rootId: string;
    itemIds: readonly string[];
    childrenByParent: Readonly<Record<string, readonly string[]>>;
}>;
export type SortableItemSelectionMode = "replace" | "toggle";
export type SortableItemKeyboardCommand = "indent" | "move-down" | "move-up" | "outdent";
export type SortableItemDragBlock = Readonly<{
    itemIds: readonly string[];
    selectedItemIds: readonly string[];
    sourceParentIds: readonly string[];
}>;
export type ItemMovePlan = Readonly<{
    itemIds: readonly string[];
    sourceParentIds: readonly string[];
    destinationParentId: string;
    destinationIndex: number;
}>;
export type SortableItemMoveRejectionCode = "cycle" | "destination-cannot-contain" | "host-policy" | "invalid-destination-index" | "unknown-destination-parent";
type SortableItemMoveResult = Readonly<{
    block: SortableItemDragBlock;
    plan: ItemMovePlan;
}>;
export type SortableItemMoveDecision = (SortableItemMoveResult & Readonly<{
    status: "planned" | "unchanged";
}>) | Readonly<{
    block: SortableItemDragBlock;
    code: SortableItemMoveRejectionCode;
    reason: string;
    status: "rejected";
}>;
export type SortableItemMoveInput = Readonly<{
    activeItemId: string;
    canContainChildren?: (itemId: string) => boolean;
    canMove?: (plan: ItemMovePlan) => boolean;
    destinationIndex: number;
    destinationParentId: string;
    selectedItemIds: readonly string[];
    tree: SortableItemTree;
}>;
export type SortableItemKeyboardMoveInput = Readonly<{
    activeItemId: string;
    canContainChildren?: (itemId: string) => boolean;
    canMove?: (plan: ItemMovePlan) => boolean;
    command: SortableItemKeyboardCommand;
    selectedItemIds: readonly string[];
    tree: SortableItemTree;
}>;
export {};
//# sourceMappingURL=sortable-item-tree-contract.d.ts.map
### internal/sortable-item-tree-geometry.d.ts

import type { SortableItemPointerTarget } from "./sortable-item-tree-session.js";
import type { AdapterDndEvent } from "./upstream-dnd-adapter.js";
export type SortableItemDomTargetIdentity = Readonly<{
    itemId: string;
    type: "item";
}> | Readonly<{
    parentId: string;
    type: "parent";
}>;
export type SortableItemClientRect = Readonly<{
    bottom: number;
    height: number;
    left: number;
    right: number;
    top: number;
    width: number;
}>;
export declare function snapshotSortableItemClientRects(elements: ReadonlyMap<string, HTMLElement>): ReadonlyMap<string, SortableItemClientRect>;
export declare function sortableItemPointerTargetForEvent(event: AdapterDndEvent, targets: ReadonlyMap<string, SortableItemDomTargetIdentity>, rows: ReadonlyMap<string, SortableItemClientRect>, branches: ReadonlyMap<string, SortableItemClientRect>): SortableItemPointerTarget | null;
export declare function sortableItemEventClientY(event: AdapterDndEvent, target: SortableItemPointerTarget): number;
export declare function sortableItemWritingDirection(element: HTMLElement | null): "ltr" | "rtl";
export declare function findSortableItemHandle(tree: HTMLElement, itemId: string): HTMLElement | null;
export declare function beginSortableItemHandleFocusRecovery(ownerDocument: Document, treeId: string, itemId: string): () => void;
//# sourceMappingURL=sortable-item-tree-geometry.d.ts.map
### internal/sortable-item-tree-react-contract.d.ts

import type { ReactNode } from "react";
import { type SortableItemFilterProjection } from "./sortable-item-filtering.js";
import type { SortableItemList, SortableItemListMovePlan, SortableItemListsIndex } from "./sortable-item-lists.js";
import type { ItemMovePlan, SortableItemTree } from "./sortable-item-tree-contract.js";
export type SortableItemTreeProps = Readonly<{
    ariaLabel?: string;
    canContainChildren?: (itemId: string) => boolean;
    canMove?: (plan: ItemMovePlan) => boolean;
    disabled?: boolean;
    getItemLabel?: (itemId: string) => string;
    onMove(plan: ItemMovePlan): void;
    onSelectedItemIdsChange(itemIds: readonly string[]): void;
    renderItem(itemId: string): ReactNode;
    selectedItemIds: readonly string[];
    tree: SortableItemTree;
    visibleItemIds?: readonly string[];
}>;
export type SortableItemListsProps = Readonly<{
    ariaLabel?: string;
    canContainChildren?: (itemId: string, listId: string) => boolean;
    canMove?: (plan: SortableItemListMovePlan) => boolean;
    disabled?: boolean;
    getItemLabel?: (itemId: string, listId: string) => string;
    lists: readonly SortableItemList[];
    onMove(plan: SortableItemListMovePlan): void;
    onSelectedItemIdsChange(itemIds: readonly string[]): void;
    renderItem(itemId: string, listId: string): ReactNode;
    selectedItemIds: readonly string[];
    visibleItemIds?: readonly string[];
}>;
export type ResolvedSortableItemTreeProps = Readonly<{
    ariaLabel: string;
    canonicalTree: SortableItemTree;
    canContainChildren?: (itemId: string) => boolean;
    canMove?: (plan: ItemMovePlan) => boolean;
    disabled: boolean;
    filterProjection: SortableItemFilterProjection | null;
    getItemLabel(itemId: string): string;
    onMove(plan: ItemMovePlan): void;
    onSelectedItemIdsChange(itemIds: readonly string[]): void;
    renderItem(itemId: string): ReactNode;
    selectedItemIds: readonly string[];
    tree: SortableItemTree;
}>;
export type ResolvedSortableItemListsProps = Readonly<{
    ariaLabel: string;
    canonicalTree: SortableItemTree;
    canContainChildren?: (itemId: string, listId: string) => boolean;
    canMove?: (plan: SortableItemListMovePlan) => boolean;
    disabled: boolean;
    filterProjection: SortableItemFilterProjection | null;
    getItemLabel(itemId: string, listId: string): string;
    lists: readonly SortableItemList[];
    onMove(plan: SortableItemListMovePlan): void;
    onSelectedItemIdsChange(itemIds: readonly string[]): void;
    renderItem(itemId: string, listId: string): ReactNode;
    selectedItemIds: readonly string[];
    tree: SortableItemTree;
}>;
export declare function resolveSortableItemTreeProps(props: SortableItemTreeProps): ResolvedSortableItemTreeProps;
export declare function resolveSortableItemListsProps(props: SortableItemListsProps, index: SortableItemListsIndex): ResolvedSortableItemListsProps;
//# sourceMappingURL=sortable-item-tree-react-contract.d.ts.map
### internal/sortable-item-tree-session.d.ts

import type { ItemMovePlan, SortableItemDragBlock, SortableItemKeyboardCommand, SortableItemTree } from "./sortable-item-tree-contract.js";
export type SortableItemPointerTarget = Readonly<{
    itemId: string;
    rect: Readonly<{
        height: number;
        top: number;
    }>;
    type: "item";
}> | Readonly<{
    parentId: string;
    type: "parent";
}>;
export type SortableItemPreview = Readonly<{
    destinationIndex: number;
    destinationParentId: string;
    plan: ItemMovePlan;
    projectedTree: SortableItemTree;
}>;
export type SortableItemPreviewResolution = Readonly<{
    preview: SortableItemPreview;
    status: "planned";
}> | Readonly<{
    reason: string;
    status: "rejected";
}> | Readonly<{
    projectedTree?: SortableItemTree;
    reason: string;
    status: "unchanged";
}>;
export declare function sortableItemMovePlansMatch(left: ItemMovePlan | null, right: ItemMovePlan | null): boolean;
export declare function resolveSortableItemPointerPreview({ activeItemId, block, canContainChildren, canMove, clientY, target, tree, }: Readonly<{
    activeItemId: string;
    block: SortableItemDragBlock;
    canContainChildren?: (itemId: string) => boolean;
    canMove?: (plan: ItemMovePlan) => boolean;
    clientY: number;
    target: SortableItemPointerTarget;
    tree: SortableItemTree;
}>): SortableItemPreviewResolution;
export declare function resolveSortableItemKeyboardPreview({ activeItemId, block, canContainChildren, canMove, command, originalTree, projectedTree, }: Readonly<{
    activeItemId: string;
    block: SortableItemDragBlock;
    canContainChildren?: (itemId: string) => boolean;
    canMove?: (plan: ItemMovePlan) => boolean;
    command: SortableItemKeyboardCommand;
    originalTree: SortableItemTree;
    projectedTree: SortableItemTree;
}>): SortableItemPreviewResolution;
export declare function resolveSortableItemKeyboardDestinationPreview({ activeItemId, block, canContainChildren, canMove, destinationIndex, destinationParentId, originalTree, projectedTree, }: Readonly<{
    activeItemId: string;
    block: SortableItemDragBlock;
    canContainChildren?: (itemId: string) => boolean;
    canMove?: (plan: ItemMovePlan) => boolean;
    destinationIndex: number;
    destinationParentId: string;
    originalTree: SortableItemTree;
    projectedTree: SortableItemTree;
}>): SortableItemPreviewResolution;
export declare function sortableItemMoveStillAllowed({ canContainChildren, canMove, plan, tree, }: Readonly<{
    canContainChildren?: (itemId: string) => boolean;
    canMove?: (plan: ItemMovePlan) => boolean;
    plan: ItemMovePlan;
    tree: SortableItemTree;
}>): boolean;
//# sourceMappingURL=sortable-item-tree-session.d.ts.map
### internal/sortable-item-tree-validation.d.ts

import type { SortableItemTree } from "./sortable-item-tree-contract.js";
export type SortableItemTreeValidationCode = "cycle" | "duplicate-item" | "duplicate-placement" | "invalid-item" | "invalid-tree" | "root-placement" | "unknown-item" | "unknown-parent" | "unreachable-item";
export declare class SortableItemTreeValidationError extends TypeError {
    readonly code: SortableItemTreeValidationCode;
    readonly path: string;
    constructor(code: SortableItemTreeValidationCode, path: string, detail: string);
}
export type SortableItemTreeIndex = Readonly<{
    childrenByParent: ReadonlyMap<string, readonly string[]>;
    itemOrder: readonly string[];
    parentByItem: ReadonlyMap<string, string>;
    rootId: string;
}>;
export declare function createSortableItemTreeIndex(value: SortableItemTree): SortableItemTreeIndex;
export declare function validateSortableItemTree(value: unknown): asserts value is SortableItemTree;
export declare function deriveSortableItemParentLookup(tree: SortableItemTree): ReadonlyMap<string, string>;
export declare function getSortableItemOrder(tree: SortableItemTree): readonly string[];
//# sourceMappingURL=sortable-item-tree-validation.d.ts.map
### internal/sortable-item-tree.d.ts

import { type SortableItemListsProps, type SortableItemTreeProps } from "./sortable-item-tree-react-contract.js";
export declare function SortableItemTree(props: SortableItemTreeProps): import("react").JSX.Element;
export declare function SortableItemLists(props: SortableItemListsProps): import("react").JSX.Element;
//# sourceMappingURL=sortable-item-tree.d.ts.map
### internal/sorting-preview.d.ts

import type { ListOrientation } from "./collision-characterization.js";
import type { DragTransform, InteractionRect } from "./interaction-geometry.js";
export type SortingPreview = {
    destinationIndex: number;
    order: readonly string[];
    transformsById: Readonly<Record<string, DragTransform>>;
};
export declare function resolveSortingPreview({ activeId, ids, orientation, pastMidpoint, rectsById, targetId, }: {
    activeId: string;
    ids: readonly string[];
    orientation: ListOrientation;
    pastMidpoint: boolean;
    rectsById: Readonly<Record<string, InteractionRect>>;
    targetId: string;
}): SortingPreview | null;
//# sourceMappingURL=sorting-preview.d.ts.map
### internal/transient-root-projection.d.ts

import type { WorkspacePoint } from "./geometry-index.js";
import type { ViewportTransform } from "./interaction-geometry.js";
export type RootProjectionInput = {
    sectionId: string;
    position: WorkspacePoint;
    size: {
        width: number;
        height: number;
    };
};
export type RootProjectionSnapshot = Required<RootProjectionInput>;
export type RootProjectionChange = {
    type: "position";
    sectionId: string;
    position: WorkspacePoint;
    dragging: boolean;
} | {
    type: "dimensions";
    sectionId: string;
    size: {
        width: number;
        height: number;
    };
    resizing: boolean;
};
export type RootLayoutCommand = {
    type: "move-root-sections";
    positions: Readonly<Record<string, WorkspacePoint>>;
} | {
    type: "resize-root-section";
    position: WorkspacePoint;
    sectionId: string;
    size: {
        width: number;
        height: number;
    };
};
export type ViewportCommand = {
    type: "set-viewport";
    viewport: ViewportTransform;
};
export type AcceptedRootCommandHandler = (command: RootLayoutCommand) => void;
export declare class TransientRootProjection {
    #private;
    constructor(roots: readonly RootProjectionInput[], viewport: ViewportTransform, onAcceptedRootCommand?: AcceptedRootCommandHandler);
    roots(): readonly RootProjectionSnapshot[];
    viewport(): ViewportTransform;
    synchronizeRoots(roots: readonly RootProjectionInput[]): void;
    beginRootMove(sectionIds: readonly string[]): void;
    beginRootResize(sectionId: string): void;
    applyRootChanges(changes: readonly RootProjectionChange[]): void;
    completeRootGesture(): RootLayoutCommand | null;
    cancelRootGesture(): void;
    beginViewportGesture(): void;
    updateViewport(viewport: ViewportTransform): void;
    completeViewportGesture(): ViewportCommand | null;
    cancelViewportGesture(): void;
    resetAcceptedProjection(): void;
}
//# sourceMappingURL=transient-root-projection.d.ts.map
### internal/upstream-adapter-proof.d.ts

import { type WorkspacePoint } from "./geometry-index.js";
import { type SectionMoveDestination, type WorkspaceSectionMoveMode } from "./section-move-planning.js";
export type AdapterProofCommand = {
    type: "move-root-section";
    sectionId: string;
    position: WorkspacePoint;
} | {
    type: "reorder-nested-section";
    rootSectionId: string;
    sectionId: string;
    targetSectionId: string;
} | {
    type: "move-section-block";
    destination: SectionMoveDestination;
    mode: WorkspaceSectionMoveMode;
    previewKey: string;
    sectionIds: readonly string[];
};
export type UpstreamAdapterProofProps = {
    onCommand?(command: AdapterProofCommand): void;
};
export declare function UpstreamAdapterProof({ onCommand }: UpstreamAdapterProofProps): import("react").JSX.Element;
//# sourceMappingURL=upstream-adapter-proof.d.ts.map
### internal/upstream-dnd-adapter.d.ts

import { type ReactNode } from "react";
import type { InteractionPoint } from "./interaction-geometry.js";
export type AdapterDndInput = "keyboard" | "pointer" | "touch";
export type AdapterDndKeyboardDirection = "down" | "left" | "right" | "up";
export type AdapterDndEvent = {
    activatorPoint: InteractionPoint | null;
    clientPoint: InteractionPoint | null;
    keyboardDirection: AdapterDndKeyboardDirection | null;
    sourceId: string;
    targetId: string | null;
    input: AdapterDndInput;
    transform: InteractionPoint;
};
export type AdapterDndCompletion = AdapterDndEvent & {
    canceled: boolean;
};
export type AdapterDndCollisionRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};
export type UpstreamDndBoundaryProps = {
    children: ReactNode;
    manageAccessibility?: boolean;
    manageAutoScroll?: boolean;
    overlayClassName?: string;
    overlayLabel?(sourceId: string): string;
    /**
     * Activation-time veto evaluated by the sensors before a gesture starts.
     * Return true to refuse activation, e.g. while another workspace
     * interaction system already owns the current gesture.
     */
    preventActivation?(): boolean;
    renderOverlay?(sourceId: string): ReactNode;
    resolveCollisionRect?(sourceId: string, activatorPoint: InteractionPoint | null): AdapterDndCollisionRect | null;
    onMove?(event: AdapterDndEvent): void;
    onStart?(event: AdapterDndEvent): void;
    onPreviewTarget?(targetId: string | null): void;
    onComplete(completion: AdapterDndCompletion): void;
};
export declare function UpstreamDndBoundary({ children, manageAccessibility, manageAutoScroll, overlayClassName, overlayLabel, preventActivation, renderOverlay, resolveCollisionRect, onMove, onStart, onPreviewTarget, onComplete, }: UpstreamDndBoundaryProps): import("react").JSX.Element;
export type UpstreamDndDraggableOptions = Readonly<{
    data?: Readonly<Record<string, unknown>>;
    disabled: boolean;
    id: string;
    /**
     * Reading isDragSource subscribes this component to a synchronous rerender
     * inside the drag-start input dispatch. Callers that derive their active
     * state from a deferred source opt out to keep activation off the render
     * hot path.
     */
    trackActive?: boolean;
}>;
export declare function useUpstreamDndDraggable({ data, disabled, id, trackActive, }: UpstreamDndDraggableOptions): {
    active: boolean;
    elementRef: (element: Element | null) => void;
    handleRef: (element: Element | null) => void;
};
export type UpstreamDndDroppableOptions = Readonly<{
    collisionPriority?: number;
    data?: Readonly<Record<string, unknown>>;
    disabled: boolean;
    id: string;
}>;
export declare function useUpstreamDndDroppable({ collisionPriority, data, disabled, id, }: UpstreamDndDroppableOptions): {
    active: boolean;
    elementRef: (element: Element | null) => void;
};
export type UpstreamDndItemProps = {
    children?: ReactNode;
    id: string;
    label: string;
    onElement?(element: HTMLElement | null): void;
    onSelect(additive: boolean): void;
    parentSectionId: string;
    rootSectionId: string;
    selected: boolean;
    wide?: boolean;
};
export declare function UpstreamDndItem({ children, id, label, onElement, onSelect, parentSectionId, rootSectionId, selected, wide, }: UpstreamDndItemProps): import("react").JSX.Element;
export type UpstreamDndDropZoneProps = {
    children: ReactNode;
    className: string;
    id: string;
    onElement?(element: HTMLElement | null): void;
};
export declare function UpstreamDndDropZone({ children, className, id, onElement, }: UpstreamDndDropZoneProps): import("react").JSX.Element;
//# sourceMappingURL=upstream-dnd-adapter.d.ts.map
### internal/workspace-clipboard.d.ts

import type { SectionMoveDestination } from "./section-move-planning.js";
import { type WorkspaceDocument, type WorkspaceJsonValue, type WorkspacePoint, type WorkspaceSection } from "./workspace-document-contract.js";
import type { WorkspaceActionRejectionReason } from "./workspace-surface-contract.js";
export declare const WORKSPACE_CLIPBOARD_MIME_TYPE: "application/vnd.setta.workspace.sections+json";
export declare const WORKSPACE_CLIPBOARD_SCHEMA_VERSION: 1;
export type WorkspaceClipboardItem = Readonly<{
    mimeType: string;
    serialized: string;
}>;
export type WorkspaceClipboardCloneRequest = Readonly<{
    rootSectionIds: readonly string[];
    sections: readonly WorkspaceSection<unknown>[];
}>;
export type WorkspaceClipboardSectionClone<TSectionData = WorkspaceJsonValue> = Readonly<{
    data: TSectionData;
    id: string;
    sourceSectionId: string;
}>;
export type WorkspaceClipboardCloneRejectionCode = "invalid" | "unauthorized" | "unsupported";
export type WorkspaceClipboardCloneDecision<TSectionData = WorkspaceJsonValue> = Readonly<{
    allowed: false;
    code: WorkspaceClipboardCloneRejectionCode;
    reason: string;
}> | Readonly<{
    allowed: true;
    sections: readonly WorkspaceClipboardSectionClone<TSectionData>[];
}>;
export type WorkspaceClipboardAdapter<TSectionData = WorkspaceJsonValue> = Readonly<{
    cloneSections(request: WorkspaceClipboardCloneRequest): Promise<WorkspaceClipboardCloneDecision<TSectionData>> | WorkspaceClipboardCloneDecision<TSectionData>;
    read(): Promise<WorkspaceClipboardItem | null>;
    write(item: WorkspaceClipboardItem): Promise<void>;
}>;
export type WorkspaceTextClipboard = Readonly<{
    readText(): Promise<string>;
    writeText(value: string): Promise<void>;
}>;
export type WorkspaceJsonClipboardDataValidationRequest = Readonly<{
    data: unknown;
    kind: string;
    sourceSectionId: string;
}>;
export type WorkspaceJsonClipboardAdapterOptions = Readonly<{
    allocateSectionId(request: Readonly<{
        kind: string;
        sourceSectionId: string;
    }>): string;
    clipboard: WorkspaceTextClipboard;
    validateSectionData(request: WorkspaceJsonClipboardDataValidationRequest): boolean;
}>;
type WorkspaceClipboardRect = WorkspacePoint & Readonly<{
    height: number;
    width: number;
}>;
type WorkspaceClipboardFrameRoot = Readonly<{
    position: WorkspacePoint;
    sectionId: string;
    size: Readonly<{
        height: number;
        width: number;
    }>;
}>;
type WorkspaceClipboardFrame = Readonly<{
    mimeType: typeof WORKSPACE_CLIPBOARD_MIME_TYPE;
    rootSections: readonly WorkspaceClipboardFrameRoot[];
    schemaVersion: typeof WORKSPACE_CLIPBOARD_SCHEMA_VERSION;
    sections: Readonly<Record<string, WorkspaceSection<unknown>>>;
}>;
export type WorkspaceClipboardCopyPreparation = Readonly<{
    item: WorkspaceClipboardItem;
    rootCount: number;
    sectionCount: number;
    status: "ready";
}> | Readonly<{
    reason: Extract<WorkspaceActionRejectionReason, "clipboard-selection-empty" | "section-geometry-unavailable">;
    status: "rejected";
}>;
export type WorkspaceClipboardReadResult = Readonly<{
    frame: WorkspaceClipboardFrame;
    status: "ready";
}> | Readonly<{
    detail?: string;
    reason: Extract<WorkspaceActionRejectionReason, "clipboard-empty" | "clipboard-format-unsupported" | "clipboard-invalid" | "clipboard-version-unsupported">;
    status: "rejected";
}>;
export type WorkspaceClipboardMaterialized<TSectionData> = Readonly<{
    roots: readonly WorkspaceClipboardFrameRoot[];
    sectionCount: number;
    sections: Readonly<Record<string, WorkspaceSection<TSectionData>>>;
}>;
export type WorkspaceClipboardCloneResult<TSectionData> = Readonly<{
    paste: WorkspaceClipboardMaterialized<TSectionData>;
    status: "ready";
}> | Readonly<{
    detail?: string;
    reason: Extract<WorkspaceActionRejectionReason, "clipboard-clone-invalid" | "clipboard-clone-partial" | "clipboard-data-invalid" | "clipboard-data-unsupported" | "clipboard-unauthorized" | "section-id-exists">;
    status: "rejected";
}>;
export type WorkspaceClipboardPlacementInput = Readonly<{
    destination: Readonly<{
        parentId: string | null;
        placement: Readonly<{
            index: number;
            type: "ordered";
        }> | Readonly<{
            position: WorkspacePoint;
            type: "freeform";
        }>;
    }>;
    existingRects: readonly WorkspaceClipboardRect[];
    grid: readonly [number, number] | null;
}>;
export type WorkspaceClipboardPlacedSections<TSectionData> = Readonly<{
    destination: SectionMoveDestination;
    rootSectionIds: readonly string[];
    sections: Readonly<Record<string, WorkspaceSection<TSectionData>>>;
}>;
export declare function prepareWorkspaceClipboardCopy(document: WorkspaceDocument<unknown>, selectedSectionIds: readonly string[], getSectionRect: (sectionId: string) => WorkspaceClipboardRect | undefined): WorkspaceClipboardCopyPreparation;
export declare function readWorkspaceClipboardItem(value: unknown): WorkspaceClipboardReadResult;
export declare function materializeWorkspaceClipboardClone<TSectionData>(frame: WorkspaceClipboardFrame, decisionValue: unknown, existingSectionIds: ReadonlySet<string>): WorkspaceClipboardCloneResult<TSectionData>;
export declare function workspaceClipboardCloneRequest(frame: WorkspaceClipboardFrame): WorkspaceClipboardCloneRequest;
export declare function workspaceClipboardFrameDocument(frame: WorkspaceClipboardFrame): WorkspaceDocument<unknown>;
export declare function placeWorkspaceClipboardSections<TSectionData>(paste: WorkspaceClipboardMaterialized<TSectionData>, input: WorkspaceClipboardPlacementInput): WorkspaceClipboardPlacedSections<TSectionData>;
export declare function createWorkspaceJsonClipboardAdapter<TSectionData extends WorkspaceJsonValue>(value: WorkspaceJsonClipboardAdapterOptions): WorkspaceClipboardAdapter<TSectionData>;
export declare function resolveWorkspaceClipboardShortcut(event: Readonly<{
    altKey: boolean;
    ctrlKey: boolean;
    key: string;
    metaKey: boolean;
    shiftKey: boolean;
}>): "copySelection" | "paste" | null;
export {};
//# sourceMappingURL=workspace-clipboard.d.ts.map
### internal/workspace-connections.d.ts

import type { WorkspaceDocument, WorkspacePoint } from "./workspace-document-contract.js";
export declare const WORKSPACE_CONNECTIONS_SCHEMA_VERSION: 1;
export type WorkspacePortSide = "bottom" | "left" | "right" | "top";
export type WorkspacePort = Readonly<{
    id: string;
    label: string;
    offset: number;
    sectionId: string;
    side: WorkspacePortSide;
}>;
export type WorkspaceEdgeEndpoint = Readonly<{
    portId: string;
    sectionId: string;
}>;
export type WorkspaceEdge = Readonly<{
    directed: boolean;
    id: string;
    label: string;
    source: WorkspaceEdgeEndpoint;
    target: WorkspaceEdgeEndpoint;
}>;
export type WorkspaceConnections = Readonly<{
    edges: readonly WorkspaceEdge[];
    ports: readonly WorkspacePort[];
    schemaVersion: typeof WORKSPACE_CONNECTIONS_SCHEMA_VERSION;
}>;
export type WorkspaceConnectionRect = WorkspacePoint & Readonly<{
    height: number;
    width: number;
}>;
export declare function validateWorkspaceConnections(document: WorkspaceDocument<unknown>, value: unknown): asserts value is WorkspaceConnections;
export declare function createEmptyWorkspaceConnections(): WorkspaceConnections;
export declare function parseWorkspaceConnections(document: WorkspaceDocument<unknown>, serialized: string): WorkspaceConnections;
export declare function serializeWorkspaceConnections(document: WorkspaceDocument<unknown>, connections: WorkspaceConnections): string;
export declare function resolveWorkspacePortPosition(rect: WorkspaceConnectionRect, port: Pick<WorkspacePort, "offset" | "side">): WorkspacePoint;
//# sourceMappingURL=workspace-connections.d.ts.map
### internal/workspace-document-contract.d.ts

export declare const WORKSPACE_DOCUMENT_SCHEMA_VERSION: 2;
export type WorkspaceJsonValue = boolean | null | number | string | readonly WorkspaceJsonValue[] | {
    readonly [key: string]: WorkspaceJsonValue;
};
export type WorkspacePoint = Readonly<{
    x: number;
    y: number;
}>;
export type WorkspaceViewport = WorkspacePoint & Readonly<{
    zoom: number;
}>;
export type SectionOrientation = "horizontal" | "vertical";
export type SectionOverflow = "grow" | "scroll";
export type SectionChrome = "compact" | "default" | "none" | "transparent";
export type SectionDimensionMode = "content" | "fixed";
export type SectionChildPositioning = "freeform" | "ordered";
export type SectionDimension = Readonly<{
    mode: SectionDimensionMode;
    value: number;
}>;
export type WorkspaceSectionSize = Readonly<{
    height: SectionDimension;
    width: SectionDimension;
}>;
export type WorkspaceSectionPresentation = Readonly<{
    accentColor: string | null;
    chrome: SectionChrome;
    tagColor: string | null;
}>;
export type WorkspaceOrderedChildLayout = Readonly<{
    orientation: SectionOrientation;
    overflow: SectionOverflow;
    positioning: "ordered";
    sectionIds: readonly string[];
}>;
export type WorkspaceFreeformChildLayout = Readonly<{
    overflow: SectionOverflow;
    positioning: "freeform";
    positions: Readonly<Record<string, WorkspacePoint>>;
    sectionIds: readonly string[];
}>;
export type WorkspaceChildLayout = WorkspaceFreeformChildLayout | WorkspaceOrderedChildLayout;
export type WorkspaceChildLayoutPositioningChange = Readonly<{
    orientation: SectionOrientation;
    positioning: "ordered";
}> | Readonly<{
    positioning: "freeform";
    positions: Readonly<Record<string, WorkspacePoint>>;
}>;
export type WorkspaceSection<TSectionData = WorkspaceJsonValue> = Readonly<{
    childLayout: WorkspaceChildLayout | null;
    data: TSectionData;
    id: string;
    isMinimized: boolean;
    kind: string;
    positionAndSizeLocked: boolean;
    presentation: WorkspaceSectionPresentation;
    size: WorkspaceSectionSize;
    title: string;
}>;
export type WorkspaceRootSection = Readonly<{
    position: WorkspacePoint;
    sectionId: string;
}>;
export type WorkspaceDocument<TSectionData = WorkspaceJsonValue> = Readonly<{
    rootSections: readonly WorkspaceRootSection[];
    schemaVersion: typeof WORKSPACE_DOCUMENT_SCHEMA_VERSION;
    sections: Readonly<Record<string, WorkspaceSection<TSectionData>>>;
    viewport: WorkspaceViewport;
}>;
export type WorkspaceParentLookup = ReadonlyMap<string, string | null>;
//# sourceMappingURL=workspace-document-contract.d.ts.map
### internal/workspace-document-validation.d.ts

import { type WorkspaceDocument, type WorkspaceRootSection, type WorkspaceSection } from "./workspace-document-contract.js";
export type WorkspaceDocumentValidationCode = "cycle" | "duplicate-placement" | "invalid-color" | "invalid-json" | "invalid-section" | "invalid-value" | "unknown-section" | "unreachable-section" | "unsupported-schema-version";
export declare class WorkspaceDocumentValidationError extends TypeError {
    readonly code: WorkspaceDocumentValidationCode;
    readonly path: string;
    constructor(code: WorkspaceDocumentValidationCode, path: string, detail: string);
}
export declare function validateWorkspaceViewport(value: unknown): asserts value is WorkspaceDocument<unknown>["viewport"];
export declare function isValidWorkspaceColor(value: string): boolean;
export declare function buildWorkspaceParentLookup(roots: readonly WorkspaceRootSection[], sections: Readonly<Record<string, WorkspaceSection<unknown>>>): Map<string, string | null>;
export declare function validateWorkspaceDocument(value: unknown): asserts value is WorkspaceDocument<unknown>;
export declare function parseWorkspaceDocument(serialized: string): WorkspaceDocument<unknown>;
export declare function serializeWorkspaceDocument<TSectionData>(document: WorkspaceDocument<TSectionData>): string;
//# sourceMappingURL=workspace-document-validation.d.ts.map
### internal/workspace-document.d.ts

import { type WorkspaceDocument, type WorkspaceJsonValue, type WorkspaceParentLookup } from "./workspace-document-contract.js";
export declare function createEmptyWorkspaceDocument<TSectionData = WorkspaceJsonValue>(): WorkspaceDocument<TSectionData>;
export declare function deriveWorkspaceParentLookup(document: WorkspaceDocument<unknown>): WorkspaceParentLookup;
export declare function getWorkspaceSectionOrder(document: WorkspaceDocument<unknown>): readonly string[];
export declare function getWorkspaceNavigationOrder(document: WorkspaceDocument<unknown>): readonly string[];
export declare function getAdjacentWorkspaceSectionId(document: WorkspaceDocument<unknown>, sectionId: string, direction: "next" | "previous"): string | null;
export declare function isWorkspaceSectionDescendant(parentLookup: WorkspaceParentLookup, sectionId: string, possibleAncestorId: string): boolean;
//# sourceMappingURL=workspace-document.d.ts.map
### internal/workspace-geometry-service.d.ts

import { type MeasuredWorkspaceFrame, type ScreenPoint, type ScreenRect, type WorkspaceGeometryIndex, type WorkspacePoint, type WorkspaceRect } from "./geometry-index.js";
import type { ViewportTransform } from "./interaction-geometry.js";
export type MeasuredWorkspaceElement = Omit<MeasuredWorkspaceFrame, "rect"> & {
    element: HTMLElement;
};
export type MeasuredWorkspaceChildRegionElement = Readonly<{
    element: HTMLElement;
    parentSectionId: string;
}>;
export type MeasuredWorkspaceChildRegion = Readonly<{
    columnGap: number | null;
    direction: "ltr" | "rtl";
    element: HTMLElement;
    parentSectionId: string;
    rowGap: number | null;
    surface: HTMLElement | null;
    surfaceWorkspaceRect: WorkspaceRect | null;
    workspaceRect: WorkspaceRect;
}>;
export declare class WorkspaceGeometryMeasurements {
    #private;
    constructor(geometryIndex: WorkspaceGeometryIndex, viewport?: {
        x: number;
        y: number;
        zoom: number;
    });
    register(measuredElement: MeasuredWorkspaceElement): () => void;
    /**
     * Track one section's child drop region so structural-move sessions can
     * source region geometry from the measurement cache instead of forcing
     * layout with direct DOM reads inside the drag-activation dispatch.
     */
    registerChildRegion(regionElement: MeasuredWorkspaceChildRegionElement): () => void;
    childRegions(): ReadonlyMap<string, MeasuredWorkspaceChildRegion | null>;
    setRetainedSectionIds(sectionIds: readonly string[]): void;
    setCanvasElement(element: HTMLElement | null): void;
    setViewport(viewport: ViewportTransform): void;
    completeViewport(viewport: ViewportTransform): void;
    waitForViewport(viewport: ViewportTransform): Promise<boolean>;
    requestMeasurement(): void;
    flushMeasurement(): void;
    /**
     * Flush only when a measurement pass is scheduled. Every geometry
     * invalidation (registration, resize, scroll, viewport change) schedules a
     * pass, so an empty schedule means the index already reflects the DOM and a
     * synchronous full re-measure would be redundant forced-layout work.
     */
    settleMeasurement(): void;
    clientPointToWorkspace(point: ScreenPoint): WorkspacePoint;
    workspacePointToClient(point: WorkspacePoint): ScreenPoint;
    currentViewport(): ViewportTransform;
    canvasElement(): HTMLElement | null;
    workspaceRect(sectionId: string): WorkspaceRect | undefined;
    visibleWorkspaceRect(): WorkspaceRect;
    canvasBounds(): ScreenRect;
    /**
     * The client-space anchor for the workspace-space geometry index: canvas
     * bounds captured by the most recent measurement pass and re-anchored in
     * capture phase before every section-movement activation. Unlike
     * canvasBounds(), reading these bounds never forces style or layout, so
     * drag activation can build its session inside the pointer-down dispatch
     * without paying a synchronous full style recalculation after the upstream
     * drag machinery dirties document styles. Call settleMeasurement() first so
     * any scheduled geometry invalidation is applied before reading.
     */
    measuredCanvasBounds(): ScreenRect;
    boundsWhenReady(sectionIds: readonly string[]): Promise<WorkspaceRect>;
    focusSection(sectionId: string): void;
    captureFocus(): Element | null;
    focusSectionWhenReady(sectionId: string): Promise<boolean>;
    focusSelectionControlWhenReady(sectionId: string): Promise<boolean>;
    recoverFocus(sectionId: string | null, focusAnchor: Element | null): Promise<boolean>;
}
//# sourceMappingURL=workspace-geometry-service.d.ts.map
### internal/workspace-outline.d.ts

import { type HTMLAttributes, type ReactNode } from "react";
import { type WorkspaceController, type WorkspaceDocument, type WorkspaceJsonValue } from "../core.js";
export type WorkspaceOutlineProps<TSectionData = WorkspaceJsonValue> = Omit<HTMLAttributes<HTMLElement>, "aria-label" | "children"> & Readonly<{
    ariaLabel?: string;
    controller: WorkspaceController<TSectionData>;
    defaultExpandedSectionIds?: readonly string[];
    emptyState?: ReactNode;
    heading?: string;
}>;
export type WorkspaceOutlineRow = Readonly<{
    expanded: boolean;
    hasChildren: boolean;
    level: number;
    parentSectionId: string | null;
    positionInSet: number;
    sectionId: string;
    setSize: number;
    title: string;
}>;
export type WorkspaceOutlineKeyboardAction = Readonly<{
    sectionId: string;
    type: "collapse" | "expand" | "focus";
}> | Readonly<{
    type: "activate";
}>;
export declare function resolveWorkspaceOutlineRows(document: WorkspaceDocument<unknown>, expandedSectionIds: readonly string[]): readonly WorkspaceOutlineRow[];
export declare function planWorkspaceOutlineKeyboardAction(rows: readonly WorkspaceOutlineRow[], sectionId: string, key: string, direction: "ltr" | "rtl"): WorkspaceOutlineKeyboardAction | null;
export declare function WorkspaceOutline<TSectionData = WorkspaceJsonValue>({ ariaLabel, className, controller, defaultExpandedSectionIds, emptyState, heading, ...props }: WorkspaceOutlineProps<TSectionData>): import("react").JSX.Element;
//# sourceMappingURL=workspace-outline.d.ts.map
### internal/workspace-panes.d.ts

import { type ReactNode } from "react";
import type { WorkspaceController, WorkspaceJsonValue } from "../core.js";
export type WorkspacePanePlacement = "end" | "start";
export type WorkspacePaneRegistration<TSectionData = WorkspaceJsonValue> = Readonly<{
    icon: ReactNode;
    id: string;
    label: string;
    placement: WorkspacePanePlacement;
    render(controller: WorkspaceController<TSectionData>): ReactNode;
}>;
export type WorkspaceActivePaneChangeHandler = (paneId: string | null) => void;
export type WorkspacePaneToolbarControl = Readonly<{
    ariaControls: string;
    controlId: string;
    expanded: boolean;
    icon: ReactNode;
    label: string;
    onPress(): void;
    paneId: string;
}>;
type ResolvedWorkspacePane<TSectionData> = WorkspacePaneRegistration<TSectionData> & Readonly<{
    panelId: string;
}>;
type WorkspacePaneState<TSectionData> = Readonly<{
    activePane: ResolvedWorkspacePane<TSectionData> | null;
    closeActivePane(): void;
    controls: readonly WorkspacePaneToolbarControl[];
}>;
export declare function resolveWorkspacePaneRegistrations<TSectionData>(registrations: readonly WorkspacePaneRegistration<TSectionData>[] | undefined): readonly WorkspacePaneRegistration<TSectionData>[];
export declare function useWorkspacePanes<TSectionData>({ activePaneId, defaultActivePaneId, onActivePaneChange, registrations, }: Readonly<{
    activePaneId: string | null | undefined;
    defaultActivePaneId: string | null | undefined;
    onActivePaneChange: WorkspaceActivePaneChangeHandler | undefined;
    registrations: readonly WorkspacePaneRegistration<TSectionData>[];
}>): WorkspacePaneState<TSectionData>;
export declare function WorkspacePaneLayout<TSectionData>({ activePane, children, controller, onClose, }: Readonly<{
    activePane: ResolvedWorkspacePane<TSectionData> | null;
    children: ReactNode;
    controller: WorkspaceController<TSectionData>;
    onClose(): void;
}>): import("react").JSX.Element;
export {};
//# sourceMappingURL=workspace-panes.d.ts.map
### internal/workspace-policy.d.ts

export declare const WORKSPACE_MIN_ZOOM = 0.1;
export declare const WORKSPACE_MAX_ZOOM = 10;
export declare const WORKSPACE_DEFAULT_ZOOM = 1;
export type WorkspacePanOnScrollMode = "free" | "horizontal" | "vertical";
export type WorkspaceActivationKey = string | readonly string[] | null;
export type WorkspaceGestureOptions = Readonly<{
    initialZoom: number;
    maxZoom: number;
    minZoom: number;
    panActivationKey: WorkspaceActivationKey;
    panOnDrag: boolean | readonly number[];
    panOnScroll: boolean;
    panOnScrollMode: WorkspacePanOnScrollMode;
    panOnScrollSpeed: number;
    zoomActivationKey: WorkspaceActivationKey;
    zoomOnDoubleClick: boolean;
    zoomOnPinch: boolean;
    zoomOnScroll: boolean;
}>;
export type WorkspaceGestureOptionOverrides = Partial<WorkspaceGestureOptions>;
export declare const WORKSPACE_DEFAULT_GESTURE_OPTIONS: WorkspaceGestureOptions;
export type WorkspaceCapabilities = Readonly<{
    editLayout: boolean;
    editPresentation: boolean;
    editStructure: boolean;
}>;
export type WorkspaceCapabilityOverrides = Partial<WorkspaceCapabilities>;
export declare const WORKSPACE_DEFAULT_CAPABILITIES: WorkspaceCapabilities;
export declare function resolveWorkspaceCapabilities(overrides?: WorkspaceCapabilityOverrides, readOnly?: boolean): WorkspaceCapabilities;
export declare function resolveWorkspaceGestureOptions(options?: WorkspaceGestureOptionOverrides): WorkspaceGestureOptions;
//# sourceMappingURL=workspace-policy.d.ts.map
### internal/workspace-react-contract.d.ts

import type { HTMLAttributes, ReactNode, Ref } from "react";
import { type WorkspaceAppearanceOptionOverrides, type WorkspaceCapabilities, type WorkspaceCapabilityOverrides, type WorkspaceClipboardAdapter, type WorkspaceConnections, type WorkspaceController, type WorkspaceDocument, type WorkspaceDocumentChange, type WorkspaceGestureOptionOverrides, type WorkspaceGestureOptions, type WorkspaceGridOptionOverrides, type WorkspaceJsonValue, type WorkspacePoint } from "../core.js";
import type { WorkspaceSectionMoveMode, WorkspaceSectionMoveValidator } from "./section-move-planning.js";
import type { WorkspaceActivePaneChangeHandler, WorkspacePaneRegistration } from "./workspace-panes.js";
import type { SectionDefinition, WorkspaceGroupFactory, WorkspaceSectionColorOption, WorkspaceSectionFactory, WorkspaceSectionTitleValidator } from "./workspace-section-contract.js";
import type { WorkspaceSectionRegistry } from "./workspace-section-registry.js";
import type { WorkspaceViewportCullingOptions } from "./workspace-viewport-culling.js";
export type WorkspaceDocumentChangeHandler<TSectionData = WorkspaceJsonValue> = (document: WorkspaceDocument<TSectionData>, change: WorkspaceDocumentChange) => void;
export type WorkspaceToolbarControlPlacement = "project" | "utility" | "viewport";
export type WorkspaceToolbarControl<TSectionData = WorkspaceJsonValue> = Readonly<{
    disabled?: boolean;
    icon: ReactNode;
    id: string;
    label: string;
    onPress(controller: WorkspaceController<TSectionData>): void;
    placement: WorkspaceToolbarControlPlacement;
    pressed?: boolean;
}>;
export type WorkspaceOverlayPlacement = WorkspaceToolbarControlPlacement | "canvas";
export type WorkspaceOverlayRenderer<TSectionData = WorkspaceJsonValue> = (controller: WorkspaceController<TSectionData>) => ReactNode;
export type WorkspaceOverlaySlots<TSectionData = WorkspaceJsonValue> = Partial<Record<WorkspaceOverlayPlacement, WorkspaceOverlayRenderer<TSectionData>>>;
export type WorkspaceMinimapPlacement = "left" | "right";
export type WorkspaceMinimapOptions = Readonly<{
    placement?: WorkspaceMinimapPlacement;
    visible?: boolean;
}>;
export type WorkspaceMarqueeSelectionMode = "full" | "partial";
export type { SectionMoveDestination, SectionMovePlacement, SectionMovePlan, WorkspaceSectionMoveDecision, WorkspaceSectionMoveMode, WorkspaceSectionMoveValidationRequest, WorkspaceSectionMoveValidator, } from "./section-move-planning.js";
export type WorkspaceSelectionOptions = Readonly<{
    marqueeMode?: WorkspaceMarqueeSelectionMode;
}>;
export type WorkspaceExternalDropPlacement = Readonly<{
    index: number;
    type: "ordered";
}> | Readonly<{
    position: WorkspacePoint;
    type: "freeform";
}>;
export type WorkspaceExternalDropCandidate = Readonly<{
    parentSectionId: string | null;
    placement: WorkspaceExternalDropPlacement;
}>;
export type WorkspaceExternalDropEventMetadata = Readonly<{
    altKey: boolean;
    clientPosition: WorkspacePoint;
    ctrlKey: boolean;
    dataTransferTypes: readonly string[];
    fileCount: number;
    metaKey: boolean;
    phase: "preview" | "drop";
    shiftKey: boolean;
}>;
export type WorkspaceExternalDropRequest = Readonly<{
    candidate: WorkspaceExternalDropCandidate;
    dataTransfer: DataTransfer;
    event: WorkspaceExternalDropEventMetadata;
    position: WorkspacePoint;
}>;
export type WorkspaceExternalDropDecision = Readonly<{
    allowed: false;
    reason: string;
}> | Readonly<{
    allowed: true;
    label?: string;
}>;
export type WorkspaceExternalDropValidator = (request: WorkspaceExternalDropRequest) => WorkspaceExternalDropDecision;
export type WorkspaceExternalDropHandler = (request: WorkspaceExternalDropRequest) => Promise<void> | void;
export type WorkspaceBooleanPreferenceChangeHandler = (value: boolean) => void;
export type ResolvedWorkspaceMinimapOptions = Readonly<{
    placement: WorkspaceMinimapPlacement;
    visible: boolean;
}>;
export type ResolvedWorkspaceSelectionOptions = Readonly<{
    marqueeMode: WorkspaceMarqueeSelectionMode;
}>;
export type ResolvedWorkspaceOverlaySlots = Partial<Record<WorkspaceOverlayPlacement, ReactNode>>;
type SharedWorkspaceProps<TSectionData> = Omit<HTMLAttributes<HTMLElement>, "aria-label" | "children"> & {
    activePaneId?: string | null;
    ariaLabel?: string;
    appearanceOptions?: WorkspaceAppearanceOptionOverrides;
    capabilities?: WorkspaceCapabilityOverrides;
    clipboardAdapter?: WorkspaceClipboardAdapter<TSectionData>;
    connections?: WorkspaceConnections;
    controllerRef?: Ref<WorkspaceController<TSectionData>>;
    defaultActivePaneId?: string | null;
    emptyState?: ReactNode;
    gestureOptions?: WorkspaceGestureOptionOverrides;
    groupFactory?: WorkspaceGroupFactory<TSectionData>;
    gridOptions?: WorkspaceGridOptionOverrides;
    minimapOptions?: WorkspaceMinimapOptions;
    onExternalDrop?: WorkspaceExternalDropHandler;
    onGridSnapChange?: WorkspaceBooleanPreferenceChangeHandler;
    onMinimapVisibilityChange?: WorkspaceBooleanPreferenceChangeHandler;
    onActivePaneChange?: WorkspaceActivePaneChangeHandler;
    overlaySlots?: WorkspaceOverlaySlots<TSectionData>;
    panes?: readonly WorkspacePaneRegistration<TSectionData>[];
    readOnly?: boolean;
    sectionColorPalette?: readonly WorkspaceSectionColorOption[];
    sectionDefinitions?: readonly SectionDefinition<TSectionData>[];
    sectionFactory?: WorkspaceSectionFactory<TSectionData>;
    sectionMoveMode?: WorkspaceSectionMoveMode;
    selectionOptions?: WorkspaceSelectionOptions;
    toolbarControls?: readonly WorkspaceToolbarControl<TSectionData>[];
    validateExternalDrop?: WorkspaceExternalDropValidator;
    validateSectionMove?: WorkspaceSectionMoveValidator<TSectionData>;
    validateSectionTitle?: WorkspaceSectionTitleValidator;
    viewportCullingOptions?: WorkspaceViewportCullingOptions;
};
type ControlledWorkspaceProps<TSectionData> = {
    defaultDocument?: never;
    document: WorkspaceDocument<TSectionData>;
    onDocumentChange: WorkspaceDocumentChangeHandler<TSectionData>;
};
type UncontrolledWorkspaceProps<TSectionData> = {
    defaultDocument?: WorkspaceDocument<TSectionData>;
    document?: never;
    onDocumentChange?: WorkspaceDocumentChangeHandler<TSectionData>;
};
export type WorkspaceProps<TSectionData = WorkspaceJsonValue> = SharedWorkspaceProps<TSectionData> & (ControlledWorkspaceProps<TSectionData> | UncontrolledWorkspaceProps<TSectionData>);
export type WorkspaceMode<TSectionData> = Readonly<{
    document: WorkspaceDocument<TSectionData>;
    type: "controlled";
}> | Readonly<{
    document: WorkspaceDocument<TSectionData>;
    type: "uncontrolled";
}>;
export declare function resolveWorkspaceToolbarControls<TSectionData>(controls: readonly WorkspaceToolbarControl<TSectionData>[] | undefined): readonly WorkspaceToolbarControl<TSectionData>[];
export declare function resolveWorkspaceOverlayRenderers<TSectionData>(slots: WorkspaceOverlaySlots<TSectionData> | undefined): WorkspaceOverlaySlots<TSectionData>;
export declare function renderWorkspaceOverlaySlots<TSectionData>(slots: WorkspaceOverlaySlots<TSectionData>, controller: WorkspaceController<TSectionData>): ResolvedWorkspaceOverlaySlots;
export declare function resolveWorkspaceMinimapOptions(options: WorkspaceMinimapOptions | undefined): ResolvedWorkspaceMinimapOptions;
export declare function resolveWorkspaceSelectionOptions(options: WorkspaceSelectionOptions | undefined): ResolvedWorkspaceSelectionOptions;
export declare function resolveWorkspaceSectionMoveMode(value: unknown): WorkspaceSectionMoveMode;
export declare function resolveWorkspaceMode<TSectionData>(document: WorkspaceDocument<TSectionData> | undefined, defaultDocument: WorkspaceDocument<TSectionData> | undefined, initialZoom: number, onDocumentChange: WorkspaceDocumentChangeHandler<TSectionData> | undefined): WorkspaceMode<TSectionData>;
export declare function assertStableWorkspaceMode(initialMode: WorkspaceMode<unknown>["type"], currentMode: string): void;
export declare function assertWorkspaceViewportWithinGestureBounds(document: WorkspaceDocument<unknown>, gestureOptions: WorkspaceGestureOptions): void;
export declare function assertWorkspaceAccessibleName(ariaLabel: unknown): asserts ariaLabel is string;
export declare function assertWorkspaceSectionTitleValidator(value: unknown): asserts value is WorkspaceSectionTitleValidator | undefined;
export declare function assertWorkspaceClipboardAdapter<TSectionData>(value: unknown): asserts value is WorkspaceClipboardAdapter<TSectionData> | undefined;
export declare function assertWorkspaceSectionMoveValidator(value: unknown): asserts value is WorkspaceSectionMoveValidator | undefined;
export declare function assertWorkspaceSectionFactory<TSectionData>(value: unknown): asserts value is WorkspaceSectionFactory<TSectionData> | undefined;
export declare function assertWorkspaceGroupFactory<TSectionData>(value: unknown): asserts value is WorkspaceGroupFactory<TSectionData> | undefined;
export declare function assertWorkspaceExternalDropCallbacks(onExternalDrop: unknown, validateExternalDrop: unknown): asserts onExternalDrop is WorkspaceExternalDropHandler | undefined;
export declare function workspaceCapabilitiesAreReadOnly(capabilities: WorkspaceCapabilities): boolean;
export declare function workspaceCreationAvailability<TSectionData>(factory: WorkspaceSectionFactory<TSectionData> | undefined, registry: WorkspaceSectionRegistry<TSectionData>, capabilities: WorkspaceCapabilities, canvasReady: boolean): Readonly<{
    configured: boolean;
    enabled: boolean;
}>;
//# sourceMappingURL=workspace-react-contract.d.ts.map
### internal/workspace-root-auto-layout.d.ts

import type { WorkspacePoint } from "./workspace-document-contract.js";
export type WorkspacePackingRectangle = Readonly<{
    height: number;
    sectionId: string;
    width: number;
}>;
export type WorkspacePackedRectangle = WorkspacePackingRectangle & WorkspacePoint;
export type WorkspaceRectanglePackingInput = Readonly<{
    gap?: number;
    origin?: WorkspacePoint;
    rectangles: readonly WorkspacePackingRectangle[];
}>;
export type WorkspaceRootAutoLayoutRectangle = WorkspacePackingRectangle & WorkspacePoint;
export type WorkspaceRootAutoLayoutInput = Readonly<{
    gap?: number;
    rootRects: readonly WorkspaceRootAutoLayoutRectangle[];
}>;
export type WorkspaceRootAutoLayoutPlan = Readonly<{
    positions: Readonly<Record<string, WorkspacePoint>>;
}>;
export declare function packWorkspaceRectangles(value: WorkspaceRectanglePackingInput): readonly WorkspacePackedRectangle[];
export declare function planWorkspaceRootAutoLayout(value: WorkspaceRootAutoLayoutInput): WorkspaceRootAutoLayoutPlan;
//# sourceMappingURL=workspace-root-auto-layout.d.ts.map
### internal/workspace-root.d.ts

import { type WorkspaceJsonValue } from "../core.js";
import { type WorkspaceProps } from "./workspace-react-contract.js";
export declare function Workspace<TSectionData = WorkspaceJsonValue>(props: WorkspaceProps<TSectionData>): import("react").JSX.Element;
//# sourceMappingURL=workspace-root.d.ts.map
### internal/workspace-section-contract.d.ts

import type { ComponentType, ReactNode } from "react";
import type { SectionChrome, SectionDimensionMode, SectionOrientation, SectionOverflow, WorkspaceJsonValue } from "../core.js";
export type SectionResizeAxes = "both" | "horizontal" | "none" | "vertical";
export type SectionDefaultSize = Readonly<{
    height: number;
    width: number;
}>;
export type SectionDefaultSizeMode = Readonly<{
    height: SectionDimensionMode;
    width: SectionDimensionMode;
}>;
export type SectionContentSizing = Readonly<{
    height: boolean;
    width: boolean;
}>;
export type SectionResizeOptions = Readonly<{
    axes: SectionResizeAxes;
    maxSize?: Partial<SectionDefaultSize>;
    minSize?: Partial<SectionDefaultSize>;
    preserveAspectRatio?: boolean;
}>;
export type SectionCreationMetadata = Readonly<{
    group?: string;
    icon?: ReactNode;
    keywords?: readonly string[];
}>;
export type WorkspaceSectionColorOption = Readonly<{
    color: string;
    label: string;
}>;
export type WorkspaceSectionTitleValidationRequest = Readonly<{
    currentTitle: string;
    sectionId: string;
    title: string;
}>;
export type WorkspaceSectionTitleValidator = (request: WorkspaceSectionTitleValidationRequest) => Promise<string | null> | string | null;
export type WorkspaceSectionFactoryRequest = Readonly<{
    kind: string;
}>;
export type WorkspaceSectionFactoryResult<TSectionData = WorkspaceJsonValue> = Readonly<{
    data: TSectionData;
    id: string;
    title?: string;
}>;
export type WorkspaceSectionFactory<TSectionData = WorkspaceJsonValue> = (request: WorkspaceSectionFactoryRequest) => WorkspaceSectionFactoryResult<TSectionData>;
export type WorkspaceGroupFactoryRequest = Readonly<{
    parentSectionId: string | null;
    sectionIds: readonly string[];
}>;
export type WorkspaceGroupFactoryResult<TSectionData = WorkspaceJsonValue> = Readonly<{
    data: TSectionData;
    id: string;
    kind: string;
    title: string;
}>;
export type WorkspaceGroupFactory<TSectionData = WorkspaceJsonValue> = (request: WorkspaceGroupFactoryRequest) => WorkspaceGroupFactoryResult<TSectionData>;
export declare const WORKSPACE_DEFAULT_SECTION_COLOR_PALETTE: readonly WorkspaceSectionColorOption[];
export declare function resolveWorkspaceSectionColorPalette(palette: readonly WorkspaceSectionColorOption[] | undefined): readonly WorkspaceSectionColorOption[];
export type SectionRenderProps<TSectionData = WorkspaceJsonValue> = Readonly<{
    appearance: "dark" | "light";
    data: TSectionData;
    readOnly: boolean;
    sectionId: string;
}>;
export type SectionMinimizeScope = "body" | "subtree";
export type SectionDefinition<TSectionData = WorkspaceJsonValue> = Readonly<{
    canContainSections?: boolean;
    chrome?: SectionChrome;
    contentSizing?: SectionContentSizing;
    creation?: SectionCreationMetadata;
    defaultChildOrientation?: SectionOrientation;
    defaultChildOverflow?: SectionOverflow;
    defaultSize: SectionDefaultSize;
    defaultSizeMode?: SectionDefaultSizeMode;
    defaultTitle?: string;
    detachable?: boolean;
    displayName: string;
    kind: string;
    minimizeScope?: SectionMinimizeScope;
    minimizable?: boolean;
    render: ComponentType<SectionRenderProps<TSectionData>>;
    resize?: SectionResizeOptions;
}>;
//# sourceMappingURL=workspace-section-contract.d.ts.map
### internal/workspace-section-detachment-contract.d.ts

import type { ReactNode } from "react";
export type WorkspaceDetachmentRequest = Readonly<{
    kind: string;
    sectionId: string;
    title: string;
}>;
export type WorkspaceDetachmentDecision = Readonly<{
    allowed: false;
    reason: string;
}> | Readonly<{
    allowed: true;
}>;
export type WorkspaceDetachmentValidator = (request: WorkspaceDetachmentRequest) => WorkspaceDetachmentDecision;
export type WorkspaceDetachedWindowInitialBounds = Readonly<{
    height?: number;
    width?: number;
    x?: number;
    y?: number;
}>;
export type WorkspaceDetachedWindowBounds = Readonly<{
    height: number;
    width: number;
    x: number;
    y: number;
}>;
export type WorkspaceDetachedWindowBoundsResolver = (request: WorkspaceDetachmentRequest) => WorkspaceDetachedWindowInitialBounds | null | undefined;
export type WorkspaceDetachedWindowChange = WorkspaceDetachmentRequest & Readonly<{
    bounds: WorkspaceDetachedWindowBounds;
    open: boolean;
}>;
export type WorkspaceDetachedWindowChangeHandler = (change: WorkspaceDetachedWindowChange) => void;
export type WorkspaceDetachedWindowHeadRenderer = (request: WorkspaceDetachmentRequest) => ReactNode;
export type WorkspaceDetachmentProviderProps = Readonly<{
    children: ReactNode;
    getInitialWindowBounds?: WorkspaceDetachedWindowBoundsResolver;
    onWindowChange?: WorkspaceDetachedWindowChangeHandler;
    renderWindowHead?: WorkspaceDetachedWindowHeadRenderer;
    validateDetachment?: WorkspaceDetachmentValidator;
}>;
export declare function assertWorkspaceDetachmentProviderCallbacks(getInitialWindowBounds: unknown, onWindowChange: unknown, renderWindowHead: unknown, validateDetachment: unknown): void;
export declare function resolveWorkspaceDetachmentDecision(value: unknown): WorkspaceDetachmentDecision;
export declare function resolveWorkspaceDetachedWindowInitialBounds(value: unknown): WorkspaceDetachedWindowInitialBounds;
export declare function workspaceDetachedWindowFeatures(bounds: WorkspaceDetachedWindowInitialBounds): string;
//# sourceMappingURL=workspace-section-detachment-contract.d.ts.map
### internal/workspace-section-detachment.d.ts

import { type RefObject } from "react";
import type { WorkspaceSection } from "../core.js";
import { type WorkspaceDetachmentProviderProps } from "./workspace-section-detachment-contract.js";
import type { ResolvedSectionDefinition } from "./workspace-section-registry.js";
export declare function WorkspaceDetachmentProvider({ children, getInitialWindowBounds, onWindowChange, renderWindowHead, validateDetachment, }: WorkspaceDetachmentProviderProps): import("react").JSX.Element;
export declare function useWorkspaceDetachedSectionIds(): readonly string[];
export declare function useWorkspaceSectionDetached(sectionId: string): boolean;
export declare function WorkspaceSectionDetachmentControl({ contentId, contentRef, controlRef, definition, frameRef, section, }: Readonly<{
    contentId: string;
    contentRef: RefObject<HTMLDivElement | null>;
    controlRef: RefObject<HTMLButtonElement | null>;
    definition: ResolvedSectionDefinition<unknown>;
    frameRef: RefObject<HTMLElement | null>;
    section: WorkspaceSection<unknown>;
}>): import("react").JSX.Element | null;
type WorkspaceSectionContentProps = Readonly<{
    appearance: "dark" | "light";
    contentId: string;
    contentRef: RefObject<HTMLDivElement | null>;
    definition: ResolvedSectionDefinition<unknown>;
    frameRef: RefObject<HTMLElement | null>;
    inactive: boolean;
    readOnly: boolean;
    section: WorkspaceSection<unknown>;
}>;
export declare function WorkspaceSectionContent(props: WorkspaceSectionContentProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=workspace-section-detachment.d.ts.map
### internal/workspace-section-registry.d.ts

import type { ComponentType, ReactNode } from "react";
import { type SectionChrome, type SectionOrientation, type SectionOverflow, type WorkspaceDocument, type WorkspaceJsonValue } from "../core.js";
import type { SectionContentSizing, SectionDefaultSize, SectionDefaultSizeMode, SectionDefinition, SectionMinimizeScope, SectionRenderProps, SectionResizeAxes } from "./workspace-section-contract.js";
type ResolvedSectionCreationMetadata = Readonly<{
    group: string | null;
    icon: ReactNode;
    keywords: readonly string[];
}>;
type ResolvedSectionResizeOptions = Readonly<{
    axes: SectionResizeAxes;
    maxSize: Partial<SectionDefaultSize>;
    minSize: Partial<SectionDefaultSize>;
    preserveAspectRatio: boolean;
}>;
export type ResolvedSectionDefinition<TSectionData = WorkspaceJsonValue> = Readonly<{
    canContainSections: boolean;
    chrome: SectionChrome;
    contentSizing: SectionContentSizing;
    creation: ResolvedSectionCreationMetadata;
    defaultChildOrientation: SectionOrientation;
    defaultChildOverflow: SectionOverflow;
    defaultSize: SectionDefaultSize;
    defaultSizeMode: SectionDefaultSizeMode;
    defaultTitle: string;
    detachable: boolean;
    displayName: string;
    kind: string;
    minimizeScope: SectionMinimizeScope;
    minimizable: boolean;
    render: ComponentType<SectionRenderProps<TSectionData>>;
    resize: ResolvedSectionResizeOptions;
}>;
export declare class WorkspaceSectionRegistry<TSectionData = WorkspaceJsonValue> {
    #private;
    constructor(definitions: readonly ResolvedSectionDefinition<TSectionData>[]);
    definition(kind: string): ResolvedSectionDefinition<TSectionData> | undefined;
    definitions(): readonly ResolvedSectionDefinition<TSectionData>[];
}
export type WorkspaceSectionVisibility = Readonly<{
    collapsedAncestorBySectionId: ReadonlyMap<string, string>;
    visibleSectionIds: readonly string[];
}>;
export declare function resolveWorkspaceSectionVisibility<TSectionData>(document: WorkspaceDocument<TSectionData>, registry: WorkspaceSectionRegistry<TSectionData>): WorkspaceSectionVisibility;
export declare function resolveSectionDefinitions<TSectionData>(definitions: readonly SectionDefinition<TSectionData>[] | undefined): WorkspaceSectionRegistry<TSectionData>;
export declare function validateWorkspaceSectionDefinitions<TSectionData>(document: WorkspaceDocument<TSectionData>, registry: WorkspaceSectionRegistry<TSectionData>): void;
export {};
//# sourceMappingURL=workspace-section-registry.d.ts.map
### internal/workspace-smart-placement.d.ts

import type { WorkspacePoint } from "./workspace-document-contract.js";
export type WorkspacePlacementRect = WorkspacePoint & Readonly<{
    height: number;
    width: number;
}>;
export type WorkspacePlacementSize = Readonly<{
    height: number;
    width: number;
}>;
export type WorkspaceSmartPlacementInput = Readonly<{
    grid?: readonly [x: number, y: number] | null;
    padding?: number;
    rootRects: readonly WorkspacePlacementRect[];
    size: WorkspacePlacementSize;
    viewport: WorkspacePlacementRect;
}>;
export type WorkspaceSmartPlacementResult = Readonly<{
    panTarget: WorkspacePoint | null;
    position: WorkspacePoint;
}>;
export declare function planWorkspaceSectionPlacement(value: WorkspaceSmartPlacementInput): WorkspaceSmartPlacementResult;
//# sourceMappingURL=workspace-smart-placement.d.ts.map
### internal/workspace-surface-contract.d.ts

import type { SectionOrientation, WorkspaceChildLayoutPositioningChange, WorkspaceDocument, WorkspaceJsonValue, WorkspacePoint, WorkspaceSectionPresentation, WorkspaceViewport } from "./workspace-document-contract.js";
import type { WorkspaceCapabilities } from "./workspace-policy.js";
export type WorkspaceGridPattern = "cross" | "dots" | "lines";
export type WorkspaceGridOptions = Readonly<{
    markSize?: number;
    pattern?: WorkspaceGridPattern;
    snap: boolean;
    spacing: readonly [x: number, y: number];
    visible: boolean;
}>;
export type WorkspaceGridOptionOverrides = Partial<WorkspaceGridOptions>;
export type WorkspaceAppearance = "dark" | "light" | "system";
export type WorkspaceThemeTokens = Readonly<{
    canvasBackground: string;
    connection: string;
    controlBackground: string;
    focus: string;
    gridColor: string;
    groupBackground: string;
    invalid: string;
    minimapBackground: string;
    sectionBackground: string;
    sectionBorder: string;
    sectionHeaderBackground: string;
    sectionMutedText: string;
    sectionText: string;
    selection: string;
    toolbarBackground: string;
}>;
export type WorkspaceAppearanceOptions = Readonly<{
    appearance: WorkspaceAppearance;
    dark?: Partial<WorkspaceThemeTokens>;
    light?: Partial<WorkspaceThemeTokens>;
}>;
export type WorkspaceAppearanceOptionOverrides = Partial<WorkspaceAppearanceOptions>;
export type WorkspaceActionRejectionReason = "canvas-unavailable" | "clipboard-busy" | "clipboard-clone-failed" | "clipboard-clone-invalid" | "clipboard-clone-partial" | "clipboard-data-invalid" | "clipboard-data-unsupported" | "clipboard-empty" | "clipboard-format-unsupported" | "clipboard-invalid" | "clipboard-read-failed" | "clipboard-selection-empty" | "clipboard-unauthorized" | "clipboard-unavailable" | "clipboard-version-unsupported" | "clipboard-write-failed" | "group-kind-cannot-contain-sections" | "group-selection-too-small" | "grouping-unavailable" | "layout-edit-disabled" | "mixed-parent-selection" | "presentation-edit-disabled" | "section-creation-unavailable" | "section-descendants-collapsed" | "section-geometry-unavailable" | "section-id-exists" | "section-locked" | "section-layout-not-ordered" | "section-layout-unsupported" | "section-minimized" | "section-move-invalid" | "section-not-minimizable" | "section-not-container" | "section-not-root" | "structure-edit-disabled" | "unknown-section-kind";
export type WorkspaceActionResult = Readonly<{
    status: "applied" | "unchanged";
}> | Readonly<{
    reason: WorkspaceActionRejectionReason;
    status: "rejected";
}>;
export type WorkspaceFitOptions = Readonly<{
    padding?: number;
}>;
export type WorkspaceCreateSectionOptions = Readonly<{
    position?: WorkspacePoint;
}>;
export type WorkspaceRootAutoLayoutOptions = Readonly<{
    gap?: number;
}>;
export type WorkspaceDocumentChangeReason = "history-redo" | "history-undo" | "section-create" | "section-delete" | "section-group" | "section-lock" | "section-minimize" | "section-move" | "section-orientation" | "section-overflow" | "section-positioning" | "section-paste" | "section-presentation" | "section-resize" | "section-size-mode" | "section-stack" | "section-title" | "section-ungroup" | "viewport";
export type WorkspaceDocumentChange = Readonly<{
    reason: WorkspaceDocumentChangeReason;
}>;
export type WorkspaceHistoryState = Readonly<{
    canRedo: boolean;
    canUndo: boolean;
}>;
export type WorkspaceController<TSectionData = WorkspaceJsonValue> = Readonly<{
    autoLayoutRootSections(options?: WorkspaceRootAutoLayoutOptions): WorkspaceActionResult;
    bringForward(sectionIds: readonly string[]): WorkspaceActionResult;
    bringToFront(sectionIds: readonly string[]): WorkspaceActionResult;
    clearSelection(): WorkspaceActionResult;
    copySelection(): Promise<WorkspaceActionResult>;
    createSection(kind: string, options?: WorkspaceCreateSectionOptions): WorkspaceActionResult;
    deleteSections(sectionIds: readonly string[]): WorkspaceActionResult;
    fitSection(sectionId: string, options?: WorkspaceFitOptions): Promise<WorkspaceActionResult>;
    fitSections(sectionIds: readonly string[], options?: WorkspaceFitOptions): Promise<WorkspaceActionResult>;
    groupSections(sectionIds: readonly string[]): WorkspaceActionResult;
    paste(): Promise<WorkspaceActionResult>;
    focusNextSection(sectionId: string): Promise<WorkspaceActionResult>;
    focusPreviousSection(sectionId: string): Promise<WorkspaceActionResult>;
    focusSection(sectionId: string): Promise<WorkspaceActionResult>;
    getCapabilities(): WorkspaceCapabilities;
    getDocument(): WorkspaceDocument<TSectionData>;
    getHistoryState(): WorkspaceHistoryState;
    getSelectedSectionIds(): readonly string[];
    redo(): WorkspaceActionResult;
    selectSections(sectionIds: readonly string[]): WorkspaceActionResult;
    sendBackward(sectionIds: readonly string[]): WorkspaceActionResult;
    sendToBack(sectionIds: readonly string[]): WorkspaceActionResult;
    setSectionChildOrientation(sectionId: string, orientation: SectionOrientation): WorkspaceActionResult;
    setSectionChildPositioning(sectionId: string, change: WorkspaceChildLayoutPositioningChange): WorkspaceActionResult;
    setSectionMinimized(sectionId: string, isMinimized: boolean): WorkspaceActionResult;
    setSectionPresentation(sectionId: string, presentation: WorkspaceSectionPresentation): WorkspaceActionResult;
    setSectionTitle(sectionId: string, title: string): WorkspaceActionResult;
    setSectionsLocked(sectionIds: readonly string[], locked: boolean): WorkspaceActionResult;
    setViewport(viewport: WorkspaceViewport): WorkspaceActionResult;
    undo(): WorkspaceActionResult;
    ungroupSection(sectionId: string): WorkspaceActionResult;
}>;
//# sourceMappingURL=workspace-surface-contract.d.ts.map
### internal/workspace-viewport-culling.d.ts

import { type CSSProperties, type FocusEvent, type ReactElement, type ReactNode, type RefCallback, type RefObject } from "react";
import type { WorkspaceParentLookup } from "../core.js";
import type { WorkspaceGeometryMeasurements } from "./workspace-geometry-service.js";
export type WorkspaceViewportCullingOptions = Readonly<{
    enabled?: boolean;
    overscan?: number;
}>;
export type ResolvedWorkspaceViewportCullingOptions = Readonly<{
    enabled: boolean;
    overscan: number;
}>;
type WorkspaceCullingSize = Readonly<{
    height: number;
    width: number;
}>;
type WorkspaceCullingSnapshot = Readonly<{
    render: boolean;
    size: WorkspaceCullingSize | null;
}>;
type WorkspaceCullingRegistration = Readonly<{
    element: HTMLElement;
    measureSize(): WorkspaceCullingSize;
    sectionId: string;
}>;
export declare function resolveWorkspaceViewportCullingOptions(value: WorkspaceViewportCullingOptions | undefined): ResolvedWorkspaceViewportCullingOptions;
export declare class WorkspaceViewportCulling {
    #private;
    setOptions(options: ResolvedWorkspaceViewportCullingOptions): void;
    setParentLookup(parentLookup: WorkspaceParentLookup): void;
    setCanvasElement(element: HTMLElement | null): void;
    register(registration: WorkspaceCullingRegistration): () => void;
    subscribe(sectionId: string, listener: () => void): () => void;
    snapshot(sectionId: string): WorkspaceCullingSnapshot;
    setSectionFocusWithin(sectionId: string, focusWithin: boolean): void;
    readonly revealSection: (sectionId: string) => (() => void);
}
export declare function renderWorkspaceCulledSectionFrame({ depth, headingId, onBlurCapture, onFocusCapture, parentSectionId, registerElement, sectionId, style, title, }: Readonly<{
    depth: number;
    headingId: string;
    onBlurCapture(event: FocusEvent<HTMLElement>): void;
    onFocusCapture(): void;
    parentSectionId: string | null;
    registerElement: RefCallback<HTMLElement>;
    sectionId: string;
    style: CSSProperties;
    title: string;
}>): ReactElement;
export declare function registerWorkspaceSectionCullingFrame({ depth, element, frameElementRef, geometry, order, parentSectionId, sectionDndElementRef, sectionId, viewportCulling, }: Readonly<{
    depth: number;
    element: HTMLElement | null;
    frameElementRef: RefObject<HTMLElement | null>;
    geometry: WorkspaceGeometryMeasurements;
    order: number;
    parentSectionId: string | null;
    sectionDndElementRef(element: HTMLElement | null): void;
    sectionId: string;
    viewportCulling: WorkspaceViewportCulling;
}>): (() => void) | undefined;
export declare function workspaceSectionCullingPinned(detached: boolean, moving: boolean, resizing: boolean, structuralMoving: boolean, editingTitle: boolean, presentationOpen: boolean): boolean;
export declare function optionalWorkspaceCullingSize(size: WorkspaceCullingSize | null): WorkspaceCullingSize | undefined;
export declare function WorkspaceSectionCullingSurface({ children, culled, culledFrameProps, size, }: Readonly<{
    children: ReactNode;
    culled: boolean;
    culledFrameProps: Parameters<typeof renderWorkspaceCulledSectionFrame>[0];
    size: WorkspaceCullingSize | null;
}>): ReactNode;
export declare function useWorkspaceSectionCulling(culling: WorkspaceViewportCulling, sectionId: string, pinned: boolean): {
    culled: boolean;
    handleBlurCapture: (event: FocusEvent<HTMLElement>) => void;
    handleFocusCapture: () => void;
    size: Readonly<{
        height: number;
        width: number;
    }> | null;
};
export {};
//# sourceMappingURL=workspace-viewport-culling.d.ts.map
### internal/workspace-viewport-presets-react.d.ts

import { type HTMLAttributes, type ReactNode } from "react";
import { type WorkspaceController, type WorkspaceJsonValue, type WorkspaceViewport, type WorkspaceViewportPreset } from "../core.js";
export type WorkspaceViewportPresetCreateRequest = Readonly<{
    name: string;
    viewport: WorkspaceViewport;
}>;
export type WorkspaceViewportPresetRenameRequest = Readonly<{
    name: string;
    presetId: string;
}>;
export type WorkspaceViewportPresetsProps<TSectionData = WorkspaceJsonValue> = Omit<HTMLAttributes<HTMLElement>, "aria-label" | "children"> & Readonly<{
    ariaLabel?: string;
    controller: WorkspaceController<TSectionData>;
    emptyState?: ReactNode;
    heading?: string;
    onCreatePreset?(request: WorkspaceViewportPresetCreateRequest): void;
    onDeletePreset?(presetId: string): void;
    onRenamePreset?(request: WorkspaceViewportPresetRenameRequest): void;
    presets: readonly WorkspaceViewportPreset[];
}>;
export declare function WorkspaceViewportPresets<TSectionData = WorkspaceJsonValue>({ ariaLabel, className, controller, emptyState, heading, onCreatePreset, onDeletePreset, onRenamePreset, presets, ...props }: WorkspaceViewportPresetsProps<TSectionData>): import("react").JSX.Element;
//# sourceMappingURL=workspace-viewport-presets-react.d.ts.map
### internal/workspace-viewport-presets.d.ts

import type { WorkspaceViewport } from "./workspace-document-contract.js";
export declare const WORKSPACE_VIEWPORT_PRESETS_SCHEMA_VERSION: 1;
export type WorkspaceViewportPreset = Readonly<{
    id: string;
    name: string;
    viewport: WorkspaceViewport;
}>;
export declare function validateWorkspaceViewportPresets(value: unknown): asserts value is readonly WorkspaceViewportPreset[];
export declare function parseWorkspaceViewportPresets(serialized: string): readonly WorkspaceViewportPreset[];
export declare function serializeWorkspaceViewportPresets(presets: readonly WorkspaceViewportPreset[]): string;
//# sourceMappingURL=workspace-viewport-presets.d.ts.map
### react.d.ts

import type { HTMLAttributes } from "react";
export type { SortableItemListsProps, SortableItemTreeProps, } from "./internal/sortable-item-tree-react-contract.js";
export { SortableItemLists, SortableItemTree } from "./internal/sortable-item-tree.js";
export { WorkspaceOutline } from "./internal/workspace-outline.js";
export type { WorkspaceOutlineProps } from "./internal/workspace-outline.js";
export type { WorkspaceActivePaneChangeHandler, WorkspacePanePlacement, WorkspacePaneRegistration, } from "./internal/workspace-panes.js";
export type { SectionMoveDestination, SectionMovePlacement, SectionMovePlan, WorkspaceBooleanPreferenceChangeHandler, WorkspaceDocumentChangeHandler, WorkspaceExternalDropCandidate, WorkspaceExternalDropDecision, WorkspaceExternalDropEventMetadata, WorkspaceExternalDropHandler, WorkspaceExternalDropPlacement, WorkspaceExternalDropRequest, WorkspaceExternalDropValidator, WorkspaceMarqueeSelectionMode, WorkspaceMinimapOptions, WorkspaceMinimapPlacement, WorkspaceOverlayPlacement, WorkspaceOverlayRenderer, WorkspaceOverlaySlots, WorkspaceProps, WorkspaceSectionMoveDecision, WorkspaceSectionMoveMode, WorkspaceSectionMoveValidationRequest, WorkspaceSectionMoveValidator, WorkspaceSelectionOptions, WorkspaceToolbarControl, WorkspaceToolbarControlPlacement, } from "./internal/workspace-react-contract.js";
export { Workspace } from "./internal/workspace-root.js";
export { WORKSPACE_DEFAULT_SECTION_COLOR_PALETTE } from "./internal/workspace-section-contract.js";
export type { SectionContentSizing, SectionCreationMetadata, SectionDefaultSize, SectionDefaultSizeMode, SectionDefinition, SectionMinimizeScope, SectionRenderProps, SectionResizeAxes, SectionResizeOptions, WorkspaceGroupFactory, WorkspaceGroupFactoryRequest, WorkspaceGroupFactoryResult, WorkspaceSectionColorOption, WorkspaceSectionFactory, WorkspaceSectionFactoryRequest, WorkspaceSectionFactoryResult, WorkspaceSectionTitleValidationRequest, WorkspaceSectionTitleValidator, } from "./internal/workspace-section-contract.js";
export type { WorkspaceDetachedWindowBounds, WorkspaceDetachedWindowBoundsResolver, WorkspaceDetachedWindowChange, WorkspaceDetachedWindowChangeHandler, WorkspaceDetachedWindowHeadRenderer, WorkspaceDetachedWindowInitialBounds, WorkspaceDetachmentDecision, WorkspaceDetachmentProviderProps, WorkspaceDetachmentRequest, WorkspaceDetachmentValidator, } from "./internal/workspace-section-detachment-contract.js";
export { WorkspaceDetachmentProvider } from "./internal/workspace-section-detachment.js";
export type { WorkspaceViewportCullingOptions } from "./internal/workspace-viewport-culling.js";
export { WorkspaceViewportPresets } from "./internal/workspace-viewport-presets-react.js";
export type { WorkspaceViewportPresetCreateRequest, WorkspaceViewportPresetRenameRequest, WorkspaceViewportPresetsProps, } from "./internal/workspace-viewport-presets-react.js";
export type WorkspaceInteractionBoundaryProps = HTMLAttributes<HTMLDivElement> & Readonly<{
    preventExternalDrop?: boolean;
    preventPan?: boolean;
    preventWheel?: boolean;
}>;
export declare function WorkspaceInteractionBoundary({ className, preventExternalDrop, preventPan, preventWheel, ...props }: WorkspaceInteractionBoundaryProps): import("react").JSX.Element;
//# sourceMappingURL=react.d.ts.map
### testing.d.ts

import { type WorkspaceCapabilityOverrides, type WorkspaceController, type WorkspaceDocument, type WorkspaceDocumentChange, type WorkspaceSection } from "./core.js";
export * from "./internal/adapter-proof-drag-planning.js";
export * from "./internal/adapter-proof-model.js";
export * from "./internal/collision-characterization.js";
export * from "./internal/geometry-index.js";
export * from "./internal/interaction-geometry.js";
export * from "./internal/interaction-owner.js";
export * from "./internal/nested-freeform-representation-proof.js";
export * from "./internal/section-move-planning.js";
export * from "./internal/selection-planning.js";
export * from "./internal/sortable-item-tree-geometry.js";
export * from "./internal/sortable-item-tree-session.js";
export * from "./internal/sorting-preview.js";
export * from "./internal/transient-root-projection.js";
export * from "./internal/upstream-adapter-proof.js";
export * from "./internal/upstream-dnd-adapter.js";
export type WorkspaceTestSection = Readonly<Pick<WorkspaceSection, "id" | "title">>;
export type WorkspaceInMemoryChange<TSectionData> = Readonly<{
    change: WorkspaceDocumentChange;
    document: WorkspaceDocument<TSectionData>;
}>;
export type WorkspaceInMemoryPolicy = Readonly<{
    capabilities?: WorkspaceCapabilityOverrides;
    readOnly?: boolean;
}>;
export declare class WorkspaceInMemoryHost<TSectionData> {
    #private;
    readonly controller: WorkspaceController<TSectionData>;
    constructor(document: WorkspaceDocument<TSectionData>, policy?: WorkspaceInMemoryPolicy);
    changes(): readonly WorkspaceInMemoryChange<TSectionData>[];
    document(): WorkspaceDocument<TSectionData>;
    setPolicy(policy: WorkspaceInMemoryPolicy): void;
}
export declare function createWorkspaceTestDocument(sections: readonly WorkspaceTestSection[]): WorkspaceDocument;
//# sourceMappingURL=testing.d.ts.map