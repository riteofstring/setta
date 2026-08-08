import {
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  ReactFlow,
  ViewportPortal,
  applyNodeChanges,
  useReactFlow,
  useViewport,
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
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  WorkspaceGeometryIndex,
  clientPointToWorkspace,
  clientRectToWorkspace,
  type MarqueeSelectionMode,
  type MeasuredWorkspaceFrame,
  type ScreenRect,
  type WorkspacePoint,
  type WorkspaceRect,
} from "./geometry-index.js";
import {
  UpstreamDndBoundary,
  UpstreamDndItem,
  type AdapterDndCompletion,
} from "./upstream-dnd-adapter.js";

type ProofNestedSection = {
  id: string;
  title: string;
  children?: readonly ProofNestedSection[];
};

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
    };

export type UpstreamAdapterProofProps = {
  onCommand?(command: AdapterProofCommand): void;
};

type ProofContextValue = {
  canvasElement: HTMLElement | null;
  geometryIndex: WorkspaceGeometryIndex;
  nestedByRoot: Readonly<Record<string, readonly ProofNestedSection[]>>;
  selectedSectionIds: ReadonlySet<string>;
  wideSectionIds: ReadonlySet<string>;
  selectSection(sectionId: string, additive: boolean): void;
  toggleNestedWidth(sectionId: string): void;
};

type ProofDiagnosticsSnapshot = {
  commandCount: number;
  previewTargetId: string | null;
  status: string;
};

class ProofDiagnosticsStore {
  readonly #listeners = new Set<() => void>();
  #snapshot: ProofDiagnosticsSnapshot = {
    commandCount: 0,
    previewTargetId: null,
    status: "Adapter proof ready.",
  };

  getSnapshot = (): ProofDiagnosticsSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  recordCommand(): void {
    this.#set({ commandCount: this.#snapshot.commandCount + 1 });
  }

  setPreviewTarget(previewTargetId: string | null): void {
    this.#set({ previewTargetId });
  }

  setStatus(status: string): void {
    this.#set({ status });
  }

  #set(update: Partial<ProofDiagnosticsSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...update };
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

const ProofContext = createContext<ProofContextValue | null>(null);

const initialNestedByRoot: Readonly<Record<string, readonly ProofNestedSection[]>> = {
  "root-alpha": [
    { id: "nested-note-a", title: "Research note" },
    {
      id: "nested-container",
      title: "Horizontal container",
      children: [
        { id: "nested-note-b", title: "Decision note" },
        { id: "nested-note-c", title: "Follow-up note" },
      ],
    },
    { id: "nested-note-d", title: "Scrollable note" },
  ],
  "root-beta": [{ id: "nested-status", title: "Status summary" }],
};

const initialRootNodes: readonly ProofRootNode[] = [
  {
    id: "root-alpha",
    type: "proof-root",
    position: { x: 40, y: 45 },
    width: 330,
    data: { sectionId: "root-alpha", title: "Planning section" },
    dragHandle: ".setta-adapter-proof__root-handle",
    ariaLabel: "Planning section",
    zIndex: 0,
  },
  {
    id: "root-beta",
    type: "proof-root",
    position: { x: 470, y: 210 },
    width: 280,
    data: { sectionId: "root-beta", title: "Status section" },
    dragHandle: ".setta-adapter-proof__root-handle",
    ariaLabel: "Status section",
    zIndex: 0,
  },
];

function collectNestedIds(sections: readonly ProofNestedSection[]): readonly string[] {
  return sections.flatMap((section) => [section.id, ...collectNestedIds(section.children ?? [])]);
}

const allProofSectionIds = [
  ...initialRootNodes.map((node) => node.id),
  ...Object.values(initialNestedByRoot).flatMap(collectNestedIds),
];

function useProofContext(): ProofContextValue {
  const value = useContext(ProofContext);
  if (!value) {
    throw new Error("The upstream adapter proof context is missing.");
  }
  return value;
}

function domRect(rect: DOMRect): ScreenRect {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function useGeometryRevision(index: WorkspaceGeometryIndex): number {
  const subscribe = useCallback((listener: () => void) => index.subscribe(listener), [index]);
  const getSnapshot = useCallback(() => index.revision, [index]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function ProofDiagnostics({ store }: { store: ProofDiagnosticsStore }) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return (
    <>
      <p data-proof-command-count="">Commands: {snapshot.commandCount}</p>
      <p data-proof-preview-target="">Preview target: {snapshot.previewTargetId ?? "none"}</p>
      <p aria-live="polite" role="status">
        {snapshot.status}
      </p>
    </>
  );
}

function ProofGeometryCount({ geometryIndex }: { geometryIndex: WorkspaceGeometryIndex }) {
  useGeometryRevision(geometryIndex);
  return <p data-proof-geometry-count="">Frames: {geometryIndex.size}</p>;
}

function useMeasuredFrame(
  sectionId: string,
  parentSectionId: string | null,
  depth: number,
  order: number,
): (element: HTMLElement | null) => void {
  const { canvasElement, geometryIndex } = useProofContext();
  const [element, setElement] = useState<HTMLElement | null>(null);
  const viewport = useViewport();

  useLayoutEffect(() => {
    if (!canvasElement || !element) {
      return;
    }

    const measure = (): MeasuredWorkspaceFrame => ({
      sectionId,
      parentSectionId,
      depth,
      order,
      rect: clientRectToWorkspace(
        domRect(element.getBoundingClientRect()),
        domRect(canvasElement.getBoundingClientRect()),
        viewport,
      ),
    });
    const registration = geometryIndex.register(measure());
    const update = () => registration.update(measure());
    const observer = new ResizeObserver(update);
    observer.observe(element);
    canvasElement.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);

    return () => {
      observer.disconnect();
      canvasElement.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      registration.dispose();
    };
  }, [canvasElement, depth, element, geometryIndex, order, parentSectionId, sectionId, viewport]);

  return setElement;
}

type NestedSectionProps = {
  depth: number;
  order: number;
  parentSectionId: string;
  rootSectionId: string;
  section: ProofNestedSection;
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

  if (depth === 1) {
    return (
      <UpstreamDndItem
        id={section.id}
        label={section.title}
        onElement={elementRef}
        onSelect={(additive) => selectSection(section.id, additive)}
        rootSectionId={rootSectionId}
        selected={selected}
      >
        {body}
      </UpstreamDndItem>
    );
  }

  return (
    <article
      className="setta-adapter-proof__nested-section"
      data-proof-section-id={section.id}
      data-selected={selected ? "true" : "false"}
      data-wide={wideSectionIds.has(section.id) ? "true" : "false"}
      ref={elementRef}
    >
      <div className="setta-adapter-proof__nested-header">
        <button
          aria-pressed={selected}
          className="nodrag nowheel nopan setta-adapter-proof__nested-select"
          onClick={(event) => selectSection(section.id, event.shiftKey)}
          type="button"
        >
          {section.title}
        </button>
      </div>
      {body}
    </article>
  );
}

const ProofRootSection = memo(
  function ProofRootSection({ data, id }: NodeProps<ProofRootNode>) {
    const { nestedByRoot, selectedSectionIds } = useProofContext();
    const rootOrder = id === "root-alpha" ? 0 : 1;
    const elementRef = useMeasuredFrame(id, null, 0, rootOrder);

    return (
      <article
        className="setta-adapter-proof__root-section"
        data-proof-section-id={id}
        data-selected={selectedSectionIds.has(id) ? "true" : "false"}
        ref={elementRef}
      >
        <header className="setta-adapter-proof__root-header">
          <h3>{data.title}</h3>
          <button
            aria-label={`Move ${data.title}`}
            className="setta-adapter-proof__root-handle"
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

type ProofCanvasControlsProps = {
  canvasElement: HTMLElement | null;
  geometryIndex: WorkspaceGeometryIndex;
  marqueeMode: MarqueeSelectionMode;
  selectedSectionIds: ReadonlySet<string>;
  onMarqueeModeChange(mode: MarqueeSelectionMode): void;
  onSelectionChange(sectionIds: readonly string[], source: "control" | "marquee"): void;
};

function measuredSelectionRoots(
  geometryIndex: WorkspaceGeometryIndex,
  selectedSectionIds: ReadonlySet<string>,
): readonly string[] {
  return geometryIndex.selectionRoots(
    [...selectedSectionIds].filter((sectionId) => geometryIndex.has(sectionId)),
  );
}

function ProofCanvasControls({
  canvasElement,
  geometryIndex,
  marqueeMode,
  onMarqueeModeChange,
  onSelectionChange,
  selectedSectionIds,
}: ProofCanvasControlsProps) {
  const instance = useReactFlow<ProofRootNode>();
  const viewport = useViewport();
  useGeometryRevision(geometryIndex);
  const selectionRoots = measuredSelectionRoots(geometryIndex, selectedSectionIds);
  const primarySectionId = selectionRoots.at(-1) ?? null;
  const selectedFrame = primarySectionId ? geometryIndex.get(primarySectionId) : undefined;
  const selectedBounds = geometryIndex.boundsWhenReady(selectionRoots);

  const focusSelected = () => {
    if (!canvasElement || !selectedFrame || !primarySectionId) {
      return;
    }
    const bounds = canvasElement.getBoundingClientRect();
    const centerX = selectedFrame.rect.x + selectedFrame.rect.width / 2;
    const centerY = selectedFrame.rect.y + selectedFrame.rect.height / 2;
    const nextViewport = {
      x: bounds.width / 2 - centerX * viewport.zoom,
      y: bounds.height / 2 - centerY * viewport.zoom,
      zoom: viewport.zoom,
    };
    void instance.setViewport(nextViewport, { duration: 0 }).then(() => {
      const sectionElement = canvasElement.querySelector<HTMLElement>(
        `[data-proof-section-id="${primarySectionId}"]`,
      );
      sectionElement?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    });
  };

  return (
    <Panel position="top-right">
      <div aria-label="Adapter proof controls" className="setta-adapter-proof__controls">
        <button disabled={!selectedFrame} onClick={focusSelected} type="button">
          Focus selected
        </button>
        <button
          disabled={!selectedBounds}
          onClick={() => {
            if (selectedBounds) {
              void instance.fitBounds(selectedBounds, { duration: 0, padding: 0.2 });
            }
          }}
          type="button"
        >
          Fit selection
        </button>
        <button
          onClick={() => onSelectionChange(["nested-note-b", "nested-note-c"], "control")}
          type="button"
        >
          Select deep notes
        </button>
        <button
          disabled={selectedSectionIds.size === 0}
          onClick={() => onSelectionChange([], "control")}
          type="button"
        >
          Clear selection
        </button>
        <button
          aria-pressed={marqueeMode === "full"}
          onClick={() => onMarqueeModeChange(marqueeMode === "full" ? "partial" : "full")}
          type="button"
        >
          Marquee: {marqueeMode}
        </button>
        {[0.5, 1, 2].map((zoom) => (
          <button
            aria-label={`Set zoom to ${String(zoom * 100)}%`}
            aria-pressed={Math.abs(viewport.zoom - zoom) < 0.001}
            key={zoom}
            onClick={() => void instance.zoomTo(zoom, { duration: 0 })}
            type="button"
          >
            {String(zoom * 100)}%
          </button>
        ))}
      </div>
    </Panel>
  );
}

function SelectedFrameOverlay({
  geometryIndex,
  selectedSectionIds,
}: Pick<ProofCanvasControlsProps, "geometryIndex" | "selectedSectionIds">) {
  useGeometryRevision(geometryIndex);
  const selectionRoots = measuredSelectionRoots(geometryIndex, selectedSectionIds);
  const bounds = geometryIndex.boundsWhenReady(selectionRoots);
  if (!bounds) {
    return null;
  }

  return (
    <ViewportPortal>
      <div
        aria-hidden="true"
        className="setta-adapter-proof__selection-overlay"
        data-proof-selection-roots={selectionRoots.join(",")}
        style={{
          height: bounds.height,
          transform: `translate(${bounds.x}px, ${bounds.y}px)`,
          width: bounds.width,
        }}
      />
    </ViewportPortal>
  );
}

function InitialGeometryFit({
  geometryIndex,
  onReady,
}: {
  geometryIndex: WorkspaceGeometryIndex;
  onReady(): void;
}) {
  const instance = useReactFlow<ProofRootNode>();
  const revision = useGeometryRevision(geometryIndex);
  const didFit = useRef(false);

  useEffect(() => {
    const bounds = geometryIndex.boundsWhenReady(allProofSectionIds);
    if (didFit.current || !bounds) {
      return;
    }
    didFit.current = true;
    void instance.fitBounds(bounds, { duration: 0, padding: 0.08 }).then(onReady);
  }, [geometryIndex, instance, onReady, revision]);

  return null;
}

function marqueeRect(start: WorkspacePoint, end: WorkspacePoint): WorkspaceRect {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.max(start.x, end.x) - x,
    height: Math.max(start.y, end.y) - y,
  };
}

function MarqueeSelectionController({
  canvasElement,
  geometryIndex,
  marqueeMode,
  onSelectionChange,
}: Pick<
  ProofCanvasControlsProps,
  "canvasElement" | "geometryIndex" | "marqueeMode" | "onSelectionChange"
>) {
  const viewport = useViewport();
  const [rect, setRect] = useState<WorkspaceRect | null>(null);

  useEffect(() => {
    if (!canvasElement) {
      return;
    }
    let activePointerId: number | null = null;
    let startPoint: WorkspacePoint | null = null;

    const toWorkspacePoint = (event: PointerEvent): WorkspacePoint =>
      clientPointToWorkspace(
        { x: event.clientX, y: event.clientY },
        domRect(canvasElement.getBoundingClientRect()),
        viewport,
      );
    const stopOwnedEvent = (event: PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };
    const releasePointer = (pointerId: number) => {
      if (canvasElement.hasPointerCapture(pointerId)) {
        canvasElement.releasePointerCapture(pointerId);
      }
      activePointerId = null;
      startPoint = null;
      setRect(null);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0 || !event.shiftKey) {
        return;
      }
      stopOwnedEvent(event);
      activePointerId = event.pointerId;
      startPoint = toWorkspacePoint(event);
      canvasElement.setPointerCapture(event.pointerId);
      setRect(marqueeRect(startPoint, startPoint));
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== activePointerId || !startPoint) {
        return;
      }
      stopOwnedEvent(event);
      setRect(marqueeRect(startPoint, toWorkspacePoint(event)));
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== activePointerId || !startPoint) {
        return;
      }
      stopOwnedEvent(event);
      const completedRect = marqueeRect(startPoint, toWorkspacePoint(event));
      const selectedIds = geometryIndex
        .framesInRect(completedRect, marqueeMode)
        .map(({ sectionId }) => sectionId);
      onSelectionChange(selectedIds, "marquee");
      releasePointer(event.pointerId);
    };
    const onPointerCancel = (event: PointerEvent) => {
      if (event.pointerId === activePointerId) {
        stopOwnedEvent(event);
        releasePointer(event.pointerId);
      }
    };

    canvasElement.addEventListener("pointerdown", onPointerDown, true);
    canvasElement.addEventListener("pointermove", onPointerMove, true);
    canvasElement.addEventListener("pointerup", onPointerUp, true);
    canvasElement.addEventListener("pointercancel", onPointerCancel, true);
    return () => {
      canvasElement.removeEventListener("pointerdown", onPointerDown, true);
      canvasElement.removeEventListener("pointermove", onPointerMove, true);
      canvasElement.removeEventListener("pointerup", onPointerUp, true);
      canvasElement.removeEventListener("pointercancel", onPointerCancel, true);
    };
  }, [canvasElement, geometryIndex, marqueeMode, onSelectionChange, viewport]);

  if (!rect) {
    return null;
  }
  return (
    <ViewportPortal>
      <div
        aria-hidden="true"
        className="setta-adapter-proof__marquee"
        data-proof-marquee=""
        style={{
          height: rect.height,
          transform: `translate(${rect.x}px, ${rect.y}px)`,
          width: rect.width,
        }}
      />
    </ViewportPortal>
  );
}

function rootForNested(
  nestedByRoot: Readonly<Record<string, readonly ProofNestedSection[]>>,
  sectionId: string,
): string | null {
  for (const [rootSectionId, sections] of Object.entries(nestedByRoot)) {
    if (sections.some((section) => section.id === sectionId)) {
      return rootSectionId;
    }
  }
  return null;
}

function reorderSections(
  sections: readonly ProofNestedSection[],
  sourceId: string,
  targetId: string,
): readonly ProofNestedSection[] {
  const sourceIndex = sections.findIndex((section) => section.id === sourceId);
  const targetIndex = sections.findIndex((section) => section.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return sections;
  }
  const next = [...sections];
  const [source] = next.splice(sourceIndex, 1);
  if (!source) {
    throw new Error(`Missing nested section ${sourceId} during reorder.`);
  }
  next.splice(targetIndex, 0, source);
  return next;
}

function liftRoot(nodes: readonly ProofRootNode[], activeRootId: string | null): ProofRootNode[] {
  return nodes.map((node) => ({ ...node, zIndex: node.id === activeRootId ? 1000 : 0 }));
}

export function UpstreamAdapterProof({ onCommand }: UpstreamAdapterProofProps) {
  const diagnostics = useMemo(() => new ProofDiagnosticsStore(), []);
  const geometryIndex = useMemo(() => new WorkspaceGeometryIndex(), []);
  const [canvasElement, setCanvasElement] = useState<HTMLElement | null>(null);
  const [nestedByRoot, setNestedByRoot] = useState(initialNestedByRoot);
  const [nodes, setNodes] = useState<ProofRootNode[]>(() =>
    initialRootNodes.map((node) => ({ ...node })),
  );
  const [initialFitReady, setInitialFitReady] = useState(false);
  const [marqueeMode, setMarqueeMode] = useState<MarqueeSelectionMode>("full");
  const [selectedSectionIds, setSelectedSectionIds] = useState<ReadonlySet<string>>(
    () => new Set(["nested-note-b"]),
  );
  const [wideSectionIds, setWideSectionIds] = useState<ReadonlySet<string>>(() => new Set());
  const rootDragStart = useRef<Readonly<Record<string, WorkspacePoint>>>({});

  const recordCommand = useCallback(
    (command: AdapterProofCommand) => {
      diagnostics.recordCommand();
      onCommand?.(command);
    },
    [diagnostics, onCommand],
  );

  const onNodesChange = useCallback<OnNodesChange<ProofRootNode>>((changes) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

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

  const completeNestedMove = useCallback(
    ({ canceled, sourceId, targetId }: AdapterDndCompletion) => {
      if (canceled || !targetId || sourceId === targetId) {
        diagnostics.setStatus(
          canceled ? "Nested move canceled without a command." : "Nested order unchanged.",
        );
        return;
      }
      const sourceRoot = rootForNested(nestedByRoot, sourceId);
      const targetRoot = rootForNested(nestedByRoot, targetId);
      if (!sourceRoot || sourceRoot !== targetRoot) {
        diagnostics.setStatus("The proof rejects a cross-root nested move specifically.");
        return;
      }
      setNestedByRoot((current) => ({
        ...current,
        [sourceRoot]: reorderSections(current[sourceRoot] ?? [], sourceId, targetId),
      }));
      recordCommand({
        type: "reorder-nested-section",
        rootSectionId: sourceRoot,
        sectionId: sourceId,
        targetSectionId: targetId,
      });
      diagnostics.setStatus(`${sourceId} moved before ${targetId}; one package command emitted.`);
    },
    [diagnostics, nestedByRoot, recordCommand],
  );

  const contextValue = useMemo<ProofContextValue>(
    () => ({
      canvasElement,
      geometryIndex,
      nestedByRoot,
      selectedSectionIds,
      wideSectionIds,
      selectSection,
      toggleNestedWidth,
    }),
    [
      canvasElement,
      geometryIndex,
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
        <ProofGeometryCount geometryIndex={geometryIndex} />
        <p data-proof-initial-fit="">Initial fit: {initialFitReady ? "ready" : "pending"}</p>
        <p data-proof-selection-ids="">Selection: {[...selectedSectionIds].join(", ") || "none"}</p>
      </div>
      <ProofContext.Provider value={contextValue}>
        <UpstreamDndBoundary
          onComplete={completeNestedMove}
          onPreviewTarget={(targetId) => diagnostics.setPreviewTarget(targetId)}
          onStart={(sourceId) => {
            diagnostics.setStatus(`${sourceId} structural movement is owned by dnd-kit.`);
          }}
        >
          <div className="setta-adapter-proof__canvas" ref={setCanvasElement}>
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
                rootDragStart.current = { [node.id]: { ...node.position } };
                setNodes((current) => liftRoot(current, node.id));
                diagnostics.setStatus(`${node.id} layout movement is owned by XYFlow.`);
              }}
              onNodeDragStop={(_, node) => {
                setNodes((current) => liftRoot(current, null));
                const start = rootDragStart.current[node.id];
                if (start && (start.x !== node.position.x || start.y !== node.position.y)) {
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
              proOptions={{ hideAttribution: false }}
              zoomOnDoubleClick={false}
            >
              <Background
                color="var(--setta-workspace-grid, #c8d2e1)"
                gap={24}
                variant={BackgroundVariant.Dots}
              />
              <Controls position="bottom-right" showInteractive={false} />
              <ProofCanvasControls
                canvasElement={canvasElement}
                geometryIndex={geometryIndex}
                marqueeMode={marqueeMode}
                onMarqueeModeChange={setMarqueeMode}
                onSelectionChange={replaceSelection}
                selectedSectionIds={selectedSectionIds}
              />
              <InitialGeometryFit geometryIndex={geometryIndex} onReady={completeInitialFit} />
              <MarqueeSelectionController
                canvasElement={canvasElement}
                geometryIndex={geometryIndex}
                marqueeMode={marqueeMode}
                onSelectionChange={replaceSelection}
              />
              <SelectedFrameOverlay
                geometryIndex={geometryIndex}
                selectedSectionIds={selectedSectionIds}
              />
            </ReactFlow>
          </div>
        </UpstreamDndBoundary>
      </ProofContext.Provider>
    </section>
  );
}
