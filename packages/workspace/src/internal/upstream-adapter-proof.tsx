import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  applyNodeChanges,
  type Node,
  type NodeProps,
  type NodeTypes,
  type OnNodesChange,
} from "@xyflow/react";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ADAPTER_PROOF_CANVAS_TARGET_ID,
  adapterProofSelectionBounds,
  adapterProofWorkspaceRects,
  resolveAdapterProofDragPreview,
} from "./adapter-proof-drag-planning.js";
import {
  ADAPTER_PROOF_SECTIONS,
  INITIAL_ADAPTER_PROOF_HIERARCHY,
  adapterProofOrientation,
  buildAdapterProofNestedSections,
  requireAdapterProofSection,
  type AdapterProofNestedSection,
} from "./adapter-proof-model.js";
import { EMPTY_COLLISION_TRACKER_STATE } from "./collision-characterization.js";
import {
  WorkspaceGeometryIndex,
  workspaceRectToClient,
  type MarqueeSelectionMode,
  type WorkspacePoint,
  type WorkspaceRect,
} from "./geometry-index.js";
import {
  createInteractionRect,
  type InteractionRect,
  type ViewportTransform,
} from "./interaction-geometry.js";
import {
  IDLE_INTERACTION_OWNERSHIP,
  transitionInteractionOwnership,
  type InteractionOwnershipState,
} from "./interaction-owner.js";
import {
  applySectionMovePlan,
  type SectionMoveDestination,
  type WorkspaceSectionMoveMode,
} from "./section-move-planning.js";
import { resolveSelectionBlock, type SectionHierarchySnapshot } from "./selection-planning.js";
import {
  AdapterProofDragDiagnostics,
  AdapterProofDragPlaceholders,
  AdapterProofDragStore,
} from "./upstream-adapter-drag-proof.js";
import {
  AdapterProofCanvasControls,
  AdapterProofGeometryCount,
  AdapterProofGeometryMeasurements,
  AdapterProofInitialGeometryFit,
  AdapterProofMarqueeSelection,
  AdapterProofSelectedFrameOverlay,
  AdapterProofViewportObserver,
  refreshAdapterProofTargetClientRect,
  resolveAdapterProofPointerTarget,
  type ActiveAdapterProofDrag,
} from "./upstream-adapter-geometry-proof.js";
import { ProofDiagnostics, ProofDiagnosticsStore } from "./upstream-adapter-proof-diagnostics.js";
import {
  UpstreamDndBoundary,
  UpstreamDndDropZone,
  UpstreamDndItem,
  type AdapterDndCompletion,
  type AdapterDndEvent,
} from "./upstream-dnd-adapter.js";

type ProofRootData = {
  sectionId: string;
  title: string;
};

type ProofRootNode = Node<ProofRootData, "proof-root">;

export type AdapterProofCommand =
  | {
      type: "move-root-section";
      sectionId: string;
      position: WorkspacePoint;
    }
  | {
      type: "reorder-nested-section";
      rootSectionId: string;
      sectionId: string;
      targetSectionId: string;
    }
  | {
      type: "move-section-block";
      destination: SectionMoveDestination;
      mode: WorkspaceSectionMoveMode;
      previewKey: string;
      sectionIds: readonly string[];
    };

export type UpstreamAdapterProofProps = {
  onCommand?(command: AdapterProofCommand): void;
};

type ProofContextValue = {
  dragMode: WorkspaceSectionMoveMode;
  geometryMeasurements: AdapterProofGeometryMeasurements;
  hierarchy: SectionHierarchySnapshot;
  nestedByRoot: Readonly<Record<string, readonly AdapterProofNestedSection[]>>;
  selectedSectionIds: ReadonlySet<string>;
  wideSectionIds: ReadonlySet<string>;
  selectSection(sectionId: string, additive: boolean): void;
  toggleNestedWidth(sectionId: string): void;
};

const ProofContext = createContext<ProofContextValue | null>(null);

const initialRootNodes: readonly ProofRootNode[] = [
  {
    id: "root-alpha",
    type: "proof-root",
    position: INITIAL_ADAPTER_PROOF_HIERARCHY.rootPositions["root-alpha"] ?? { x: 40, y: 45 },
    width: ADAPTER_PROOF_SECTIONS["root-alpha"]?.width ?? 330,
    data: {
      sectionId: "root-alpha",
      title: ADAPTER_PROOF_SECTIONS["root-alpha"]?.title ?? "Planning section",
    },
    dragHandle: ".setta-adapter-proof__root-handle",
    ariaLabel: "Planning section",
    zIndex: 0,
  },
  {
    id: "root-beta",
    type: "proof-root",
    position: INITIAL_ADAPTER_PROOF_HIERARCHY.rootPositions["root-beta"] ?? { x: 470, y: 210 },
    width: ADAPTER_PROOF_SECTIONS["root-beta"]?.width ?? 280,
    data: {
      sectionId: "root-beta",
      title: ADAPTER_PROOF_SECTIONS["root-beta"]?.title ?? "Status section",
    },
    dragHandle: ".setta-adapter-proof__root-handle",
    ariaLabel: "Status section",
    zIndex: 0,
  },
];

const allProofSectionIds = [...Object.keys(ADAPTER_PROOF_SECTIONS)];

function useProofContext(): ProofContextValue {
  const value = useContext(ProofContext);
  if (!value) {
    throw new Error("The upstream adapter proof context is missing.");
  }
  return value;
}

function useMeasuredFrame(
  sectionId: string,
  parentSectionId: string | null,
  depth: number,
  order: number,
): (element: HTMLElement | null) => void {
  const { geometryMeasurements } = useProofContext();
  const [element, setElement] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!element) {
      return;
    }
    return geometryMeasurements.register({
      element,
      sectionId,
      parentSectionId,
      depth,
      order,
    });
  }, [depth, element, geometryMeasurements, order, parentSectionId, sectionId]);

  return setElement;
}

type NestedSectionProps = {
  depth: number;
  order: number;
  parentSectionId: string;
  rootSectionId: string;
  section: AdapterProofNestedSection;
};

function NestedSection({
  depth,
  order,
  parentSectionId,
  rootSectionId,
  section,
}: NestedSectionProps) {
  const { selectedSectionIds, selectSection, toggleNestedWidth, wideSectionIds } =
    useProofContext();
  const elementRef = useMeasuredFrame(section.id, parentSectionId, depth, order);
  const selected = selectedSectionIds.has(section.id);
  const children = section.children?.map((child, childOrder) => (
    <NestedSection
      depth={depth + 1}
      key={child.id}
      order={childOrder}
      parentSectionId={section.id}
      rootSectionId={rootSectionId}
      section={child}
    />
  ));
  const body = (
    <>
      {section.children ? (
        <div className="setta-adapter-proof__nested-children">{children}</div>
      ) : (
        <p>Host-rendered proof content</p>
      )}
      {depth > 1 ? (
        <button
          aria-pressed={wideSectionIds.has(section.id)}
          className="nodrag nowheel nopan setta-adapter-proof__resize-control"
          onClick={() => toggleNestedWidth(section.id)}
          type="button"
        >
          {wideSectionIds.has(section.id) ? "Restore width" : "Widen section"}
        </button>
      ) : null}
    </>
  );

  return (
    <UpstreamDndItem
      id={section.id}
      label={section.title}
      onElement={elementRef}
      onSelect={(additive) => selectSection(section.id, additive)}
      parentSectionId={parentSectionId}
      rootSectionId={rootSectionId}
      selected={selected}
      wide={wideSectionIds.has(section.id)}
    >
      {body}
    </UpstreamDndItem>
  );
}

const ProofRootSection = memo(
  function ProofRootSection({ data, id }: NodeProps<ProofRootNode>) {
    const { dragMode, hierarchy, nestedByRoot, selectedSectionIds } = useProofContext();
    const renderCount = useRef(0);
    renderCount.current += 1;
    const rootOrder = hierarchy.rootSectionIds.indexOf(id);
    const elementRef = useMeasuredFrame(id, null, 0, rootOrder);

    return (
      <article
        className="setta-adapter-proof__root-section"
        data-proof-render-count={renderCount.current}
        data-proof-section-id={id}
        data-selected={selectedSectionIds.has(id) ? "true" : "false"}
        ref={elementRef}
        tabIndex={-1}
      >
        <header className="setta-adapter-proof__root-header">
          <h3>{data.title}</h3>
          <button
            aria-label={`Move ${data.title}`}
            className="setta-adapter-proof__root-handle"
            disabled={dragMode === "free"}
            type="button"
          >
            Drag
          </button>
        </header>
        {/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- Native scroll regions need a keyboard focus stop. */}
        <div
          aria-label={`${data.title} nested sections`}
          className="nodrag nowheel nopan setta-adapter-proof__nested-scroll"
          role="region"
          tabIndex={0}
        >
          {nestedByRoot[id]?.map((section, order) => (
            <NestedSection
              depth={1}
              key={section.id}
              order={order}
              parentSectionId={id}
              rootSectionId={id}
              section={section}
            />
          ))}
        </div>
        {/* eslint-enable jsx-a11y/no-noninteractive-tabindex */}
      </article>
    );
  },
  (previous, next) => previous.id === next.id && previous.data === next.data,
);

const proofNodeTypes = { "proof-root": ProofRootSection } satisfies NodeTypes;

function liftRoot(nodes: readonly ProofRootNode[], activeRootId: string | null): ProofRootNode[] {
  return nodes.map((node) => ({ ...node, zIndex: node.id === activeRootId ? 1000 : 0 }));
}

function nestedSectionsByRoot(
  hierarchy: SectionHierarchySnapshot,
): Readonly<Record<string, readonly AdapterProofNestedSection[]>> {
  return Object.fromEntries(
    hierarchy.rootSectionIds.map((rootSectionId) => [
      rootSectionId,
      buildAdapterProofNestedSections(hierarchy, rootSectionId),
    ]),
  );
}

function syncRootNodes(
  current: readonly ProofRootNode[],
  hierarchy: SectionHierarchySnapshot,
  geometryIndex: WorkspaceGeometryIndex,
): ProofRootNode[] {
  const currentById = new Map(current.map((node) => [node.id, node]));
  return hierarchy.rootSectionIds.map((sectionId) => {
    const section = requireAdapterProofSection(sectionId);
    const position = hierarchy.rootPositions[sectionId];
    if (!position) {
      throw new Error(`Root section ${sectionId} has no adapter-proof position.`);
    }
    const existing = currentById.get(sectionId);
    if (existing) {
      return { ...existing, position: { ...position }, zIndex: 0 };
    }
    return {
      id: sectionId,
      type: "proof-root",
      position: { ...position },
      width: geometryIndex.get(sectionId)?.rect.width ?? section.width,
      data: { sectionId, title: section.title },
      dragHandle: ".setta-adapter-proof__root-handle",
      ariaLabel: section.title,
      zIndex: 0,
    };
  });
}

type DragSessionResult =
  { allowed: true; session: ActiveAdapterProofDrag } | { allowed: false; reason: string };

function createDragSession({
  activatorPoint,
  canvasElement,
  geometryIndex,
  hierarchy,
  input,
  mode,
  selectedSectionIds,
  sourceId,
  viewport,
}: {
  activatorPoint: AdapterDndEvent["activatorPoint"];
  canvasElement: HTMLElement | null;
  geometryIndex: WorkspaceGeometryIndex;
  hierarchy: SectionHierarchySnapshot;
  input: AdapterDndEvent["input"];
  mode: WorkspaceSectionMoveMode;
  selectedSectionIds: ReadonlySet<string>;
  sourceId: string;
  viewport: ViewportTransform;
}): DragSessionResult {
  if (!canvasElement) {
    return { allowed: false, reason: "The adapter-proof canvas is not mounted." };
  }
  const requestedIds = selectedSectionIds.has(sourceId) ? [...selectedSectionIds] : [sourceId];
  const selection = resolveSelectionBlock(requestedIds, hierarchy);
  if (!selection.allowed) {
    return selection;
  }
  const clientRectsById = captureClientRects(geometryIndex, canvasElement, viewport);
  const workspaceRectsById = adapterProofWorkspaceRects(geometryIndex);
  const sourceClientBounds = adapterProofSelectionBounds(
    selection.block.sectionIds,
    clientRectsById,
  );
  const sourceWorkspaceBounds = adapterProofSelectionBounds(
    selection.block.sectionIds,
    workspaceRectsById,
  );
  if (!sourceClientBounds || !sourceWorkspaceBounds) {
    return { allowed: false, reason: "The selected drag block is not completely measured." };
  }
  return {
    allowed: true,
    session: {
      activatorPoint,
      clientRectsById,
      collisionState: EMPTY_COLLISION_TRACKER_STATE,
      hierarchy,
      input,
      mode,
      preview: null,
      sectionIds: selection.block.sectionIds,
      sourceClientBounds,
      sourceWorkspaceBounds,
      workspaceRectsById,
    },
  };
}

function captureClientRects(
  geometryIndex: WorkspaceGeometryIndex,
  canvasElement: HTMLElement,
  viewport: ViewportTransform,
): Readonly<Record<string, InteractionRect>> {
  const viewportBounds = interactionRect(canvasElement.getBoundingClientRect());
  return Object.fromEntries(
    geometryIndex
      .snapshot()
      .map(({ rect, sectionId }) => [
        sectionId,
        interactionRect(workspaceRectToClient(rect, viewportBounds, viewport)),
      ]),
  );
}

function interactionRect({ x, y, width, height }: WorkspaceRect): InteractionRect {
  return createInteractionRect(x, y, width, height);
}

function matchingDisplayedPreview(
  displayedPreview: ActiveAdapterProofDrag["preview"],
  resolution: ReturnType<typeof resolveAdapterProofDragPreview>,
): ActiveAdapterProofDrag["preview"] {
  if (
    !resolution.preview ||
    displayedPreview?.destinationKey !== resolution.preview.destinationKey
  ) {
    return null;
  }
  return resolution.preview;
}

function completionRejectionMessage(
  resolution: ReturnType<typeof resolveAdapterProofDragPreview>,
): string {
  if (resolution.preview) {
    return "Completion did not match the displayed preview; no command was emitted.";
  }
  return resolution.reason ?? "Nested order unchanged.";
}

export function UpstreamAdapterProof({ onCommand }: UpstreamAdapterProofProps) {
  const diagnostics = useMemo(() => new ProofDiagnosticsStore(), []);
  const dragStore = useMemo(() => new AdapterProofDragStore(), []);
  const geometryIndex = useMemo(() => new WorkspaceGeometryIndex(), []);
  const geometryMeasurements = useMemo(
    () => new AdapterProofGeometryMeasurements(geometryIndex),
    [geometryIndex],
  );
  const [canvasElement, setCanvasElement] = useState<HTMLElement | null>(null);
  const [hierarchy, setHierarchy] = useState(INITIAL_ADAPTER_PROOF_HIERARCHY);
  const [nodes, setNodes] = useState<ProofRootNode[]>(() =>
    initialRootNodes.map((node) => ({ ...node })),
  );
  const [initialFitReady, setInitialFitReady] = useState(false);
  const [dragMode, setDragMode] = useState<"free" | "sort">("sort");
  const [marqueeMode, setMarqueeMode] = useState<MarqueeSelectionMode>("full");
  const [selectedSectionIds, setSelectedSectionIds] = useState<ReadonlySet<string>>(
    () => new Set(["nested-note-b"]),
  );
  const [wideSectionIds, setWideSectionIds] = useState<ReadonlySet<string>>(() => new Set());
  const activeDrag = useRef<ActiveAdapterProofDrag | null>(null);
  const interactionOwnership = useRef<InteractionOwnershipState>(IDLE_INTERACTION_OWNERSHIP);
  const rootDragStart = useRef<Readonly<Record<string, WorkspacePoint>>>({});
  const viewport = useRef<ViewportTransform>({ x: 0, y: 0, zoom: 1 });
  const nestedByRoot = useMemo(() => nestedSectionsByRoot(hierarchy), [hierarchy]);

  const recordCommand = useCallback(
    (command: AdapterProofCommand) => {
      diagnostics.recordCommand();
      onCommand?.(command);
    },
    [diagnostics, onCommand],
  );

  const onNodesChange = useCallback<OnNodesChange<ProofRootNode>>(
    (changes) => {
      setNodes((current) => applyNodeChanges(changes, current));
      geometryMeasurements.requestMeasurement();
    },
    [geometryMeasurements],
  );

  const registerCanvasElement = useCallback(
    (element: HTMLElement | null) => {
      geometryMeasurements.setCanvasElement(element);
      setCanvasElement(element);
    },
    [geometryMeasurements],
  );

  const selectSection = useCallback(
    (sectionId: string, additive: boolean) => {
      setSelectedSectionIds((current) => {
        if (!additive) {
          return new Set([sectionId]);
        }
        const next = new Set(current);
        if (next.has(sectionId)) {
          next.delete(sectionId);
        } else {
          next.add(sectionId);
        }
        return next;
      });
      diagnostics.setStatus(
        additive
          ? `${sectionId} toggled in the package multi-selection model.`
          : `${sectionId} selected through the package selection model.`,
      );
    },
    [diagnostics],
  );

  const replaceSelection = useCallback(
    (sectionIds: readonly string[], source: "control" | "marquee") => {
      setSelectedSectionIds(new Set(sectionIds));
      diagnostics.setStatus(
        `${String(sectionIds.length)} measured section${sectionIds.length === 1 ? "" : "s"} selected by ${source}.`,
      );
    },
    [diagnostics],
  );

  const completeInitialFit = useCallback(() => {
    setInitialFitReady(true);
    diagnostics.setStatus("All-depth geometry became ready and initial fit completed.");
  }, [diagnostics]);

  const toggleNestedWidth = useCallback(
    (sectionId: string) => {
      setWideSectionIds((current) => {
        const next = new Set(current);
        if (next.has(sectionId)) {
          next.delete(sectionId);
        } else {
          next.add(sectionId);
        }
        return next;
      });
      diagnostics.setStatus(`${sectionId} transient size changed; geometry will remeasure.`);
    },
    [diagnostics],
  );

  const createCurrentDragSession = useCallback(
    (event: Pick<AdapterDndEvent, "activatorPoint" | "input" | "sourceId">) => {
      geometryMeasurements.flushMeasurement();
      return createDragSession({
        activatorPoint: event.activatorPoint,
        canvasElement,
        geometryIndex,
        hierarchy,
        input: event.input,
        mode: dragMode,
        selectedSectionIds,
        sourceId: event.sourceId,
        viewport: viewport.current,
      });
    },
    [canvasElement, dragMode, geometryIndex, geometryMeasurements, hierarchy, selectedSectionIds],
  );

  const resolveCollisionRect = useCallback(
    (sourceId: string) => {
      const result = createCurrentDragSession({
        activatorPoint: null,
        input: "pointer",
        sourceId,
      });
      return result.allowed ? result.session.sourceClientBounds : null;
    },
    [createCurrentDragSession],
  );

  const startStructuralMove = useCallback(
    (event: AdapterDndEvent) => {
      const result = createCurrentDragSession(event);
      if (!result.allowed) {
        diagnostics.setStatus(result.reason);
        return;
      }
      interactionOwnership.current = transitionInteractionOwnership(interactionOwnership.current, {
        type: "start",
        request: {
          input: event.input,
          itemMovementEnabled: false,
          layoutEnabled: true,
          sectionMode: result.session.mode,
          structureEnabled: true,
          surface: "nested-section-handle",
          viewportOverride: false,
        },
      });
      activeDrag.current = result.session;
      dragStore.start({
        input: event.input,
        mode: result.session.mode,
        owner: "section-structure",
        sectionIds: result.session.sectionIds,
        sourceBounds: result.session.sourceWorkspaceBounds,
      });
      diagnostics.setStatus(
        `${String(result.session.sectionIds.length)}-section ${result.session.mode} movement is owned by dnd-kit for ${event.input} input.`,
      );
    },
    [createCurrentDragSession, diagnostics, dragStore],
  );

  const updateStructuralPreview = useCallback(
    (event: AdapterDndEvent) => {
      const session = activeDrag.current;
      if (!session) {
        return;
      }
      const targetId = resolveAdapterProofPointerTarget(
        event,
        session,
        canvasElement,
        geometryIndex,
        viewport.current,
      );
      const planningSession = refreshAdapterProofTargetClientRect(
        session,
        targetId,
        canvasElement,
        geometryIndex,
        viewport.current,
      );
      const resolution = resolveAdapterProofDragPreview({
        orientation: adapterProofOrientation,
        screenDelta: event.transform,
        session: planningSession,
        targetId,
        zoom: viewport.current.zoom,
      });
      activeDrag.current = {
        ...planningSession,
        collisionState: resolution.collisionState,
        preview: resolution.preview,
      };
      dragStore.preview(resolution.preview, {
        reason: resolution.reason,
        targetId,
        transform: event.transform,
      });
      diagnostics.setPreviewTarget(resolution.preview?.targetId ?? event.targetId);
    },
    [canvasElement, diagnostics, dragStore, geometryIndex],
  );

  const completeStructuralMove = useCallback(
    (completion: AdapterDndCompletion) => {
      const session = activeDrag.current;
      interactionOwnership.current = transitionInteractionOwnership(interactionOwnership.current, {
        type: completion.canceled ? "cancel" : "complete",
      });
      if (!session || completion.canceled) {
        dragStore.complete(null);
        activeDrag.current = null;
        diagnostics.setStatus("Nested move canceled without a command.");
        return;
      }
      const targetId = resolveAdapterProofPointerTarget(
        completion,
        session,
        canvasElement,
        geometryIndex,
        viewport.current,
      );
      const planningSession = refreshAdapterProofTargetClientRect(
        session,
        targetId,
        canvasElement,
        geometryIndex,
        viewport.current,
      );
      const resolution = resolveAdapterProofDragPreview({
        orientation: adapterProofOrientation,
        screenDelta: completion.transform,
        session: planningSession,
        targetId,
        zoom: viewport.current.zoom,
      });
      const preview = matchingDisplayedPreview(session.preview, resolution);
      if (!preview) {
        dragStore.complete(null);
        activeDrag.current = null;
        diagnostics.setStatus(completionRejectionMessage(resolution));
        return;
      }
      const nextHierarchy = applySectionMovePlan(planningSession.hierarchy, preview.plan);
      setHierarchy(nextHierarchy);
      setNodes((current) => syncRootNodes(current, nextHierarchy, geometryIndex));
      geometryMeasurements.requestMeasurement();
      recordCommand({
        type: "move-section-block",
        destination: preview.plan.destination,
        mode: preview.plan.mode,
        previewKey: preview.destinationKey,
        sectionIds: preview.plan.sectionIds,
      });
      dragStore.preview(preview);
      dragStore.complete(preview.destinationKey);
      activeDrag.current = null;
      diagnostics.setStatus(
        `${String(preview.plan.sectionIds.length)}-section ${preview.plan.mode} move committed from the displayed preview; one package command emitted.`,
      );
    },
    [canvasElement, diagnostics, dragStore, geometryIndex, geometryMeasurements, recordCommand],
  );

  const changeDragMode = useCallback(
    (nextMode: WorkspaceSectionMoveMode) => {
      if (interactionOwnership.current.phase === "active") {
        interactionOwnership.current = transitionInteractionOwnership(
          interactionOwnership.current,
          { type: "mode-change", sectionMode: nextMode },
        );
      }
      setDragMode(nextMode);
      diagnostics.setStatus(
        activeDrag.current
          ? `Move mode changed to ${nextMode}; the active ${activeDrag.current.mode} owner was retained.`
          : `Move mode changed to ${nextMode}.`,
      );
    },
    [diagnostics],
  );

  const contextValue = useMemo<ProofContextValue>(
    () => ({
      dragMode,
      geometryMeasurements,
      hierarchy,
      nestedByRoot,
      selectedSectionIds,
      wideSectionIds,
      selectSection,
      toggleNestedWidth,
    }),
    [
      dragMode,
      geometryMeasurements,
      hierarchy,
      nestedByRoot,
      selectedSectionIds,
      selectSection,
      toggleNestedWidth,
      wideSectionIds,
    ],
  );

  return (
    <section aria-label="Upstream adapter proof" className="setta-adapter-proof">
      <h2 className="setta-adapter-proof__visually-hidden">Interactive adapter surface</h2>
      <div className="setta-adapter-proof__summary">
        <p>
          Root sections are XYFlow nodes. Ordered descendants remain recursive package DOM and share
          one geometry index.
        </p>
        <ProofDiagnostics store={diagnostics} />
        <AdapterProofDragDiagnostics store={dragStore} />
        <AdapterProofGeometryCount geometryIndex={geometryIndex} />
        <p data-proof-initial-fit="">Initial fit: {initialFitReady ? "ready" : "pending"}</p>
        <p data-proof-selection-ids="">Selection: {[...selectedSectionIds].join(", ") || "none"}</p>
      </div>
      <ProofContext.Provider value={contextValue}>
        <UpstreamDndBoundary
          onComplete={completeStructuralMove}
          onMove={updateStructuralPreview}
          onPreviewTarget={(targetId) => diagnostics.setPreviewTarget(targetId)}
          onStart={startStructuralMove}
          overlayLabel={() => {
            const count = dragStore.getSnapshot().activeSectionIds.length;
            return `Moving ${String(count || 1)} section${count === 1 ? "" : "s"}`;
          }}
          resolveCollisionRect={resolveCollisionRect}
        >
          <UpstreamDndDropZone
            className="setta-adapter-proof__canvas"
            id={ADAPTER_PROOF_CANVAS_TARGET_ID}
            onElement={registerCanvasElement}
          >
            <ReactFlow<ProofRootNode>
              aria-label="Adapter proof workbench"
              edges={[]}
              elementsSelectable={false}
              elevateNodesOnSelect={false}
              maxZoom={2}
              minZoom={0.5}
              nodeTypes={proofNodeTypes}
              nodes={nodes}
              nodesConnectable={false}
              onNodeDragStart={(_, node) => {
                interactionOwnership.current = transitionInteractionOwnership(
                  interactionOwnership.current,
                  {
                    type: "start",
                    request: {
                      input: "pointer",
                      itemMovementEnabled: false,
                      layoutEnabled: true,
                      sectionMode: "sort",
                      structureEnabled: true,
                      surface: "root-section-handle",
                      viewportOverride: false,
                    },
                  },
                );
                rootDragStart.current = { [node.id]: { ...node.position } };
                setNodes((current) => liftRoot(current, node.id));
                diagnostics.setStatus(`${node.id} layout movement is owned by XYFlow.`);
              }}
              onNodeDragStop={(_, node) => {
                interactionOwnership.current = transitionInteractionOwnership(
                  interactionOwnership.current,
                  { type: "complete" },
                );
                setNodes((current) => liftRoot(current, null));
                const start = rootDragStart.current[node.id];
                if (start && (start.x !== node.position.x || start.y !== node.position.y)) {
                  setHierarchy((current) => ({
                    ...current,
                    rootPositions: {
                      ...current.rootPositions,
                      [node.id]: { ...node.position },
                    },
                  }));
                  recordCommand({
                    type: "move-root-section",
                    sectionId: node.id,
                    position: { ...node.position },
                  });
                  diagnostics.setStatus(`${node.id} move completed; one package command emitted.`);
                }
                rootDragStart.current = {};
              }}
              onNodesChange={onNodesChange}
              panOnScroll
              proOptions={{ hideAttribution: true }}
              zoomOnDoubleClick={false}
            >
              <Background
                color="var(--setta-workspace-grid, #c8d2e1)"
                gap={24}
                variant={BackgroundVariant.Dots}
              />
              <Controls position="bottom-right" showInteractive={false} />
              <AdapterProofCanvasControls
                canvasElement={canvasElement}
                dragMode={dragMode}
                geometryIndex={geometryIndex}
                marqueeMode={marqueeMode}
                onDragModeChange={changeDragMode}
                onMarqueeModeChange={setMarqueeMode}
                onSelectionChange={replaceSelection}
                selectedSectionIds={selectedSectionIds}
              />
              <AdapterProofInitialGeometryFit
                geometryIndex={geometryIndex}
                onReady={completeInitialFit}
                sectionIds={allProofSectionIds}
              />
              <AdapterProofMarqueeSelection
                canvasElement={canvasElement}
                geometryIndex={geometryIndex}
                marqueeMode={marqueeMode}
                onSelectionChange={replaceSelection}
              />
              <AdapterProofSelectedFrameOverlay
                geometryIndex={geometryIndex}
                selectedSectionIds={selectedSectionIds}
              />
              <AdapterProofDragPlaceholders store={dragStore} />
              <AdapterProofViewportObserver
                onViewport={(nextViewport) => {
                  viewport.current = nextViewport;
                  geometryMeasurements.setViewport(nextViewport);
                }}
              />
            </ReactFlow>
          </UpstreamDndDropZone>
        </UpstreamDndBoundary>
      </ProofContext.Provider>
    </section>
  );
}
