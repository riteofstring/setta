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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  WorkspaceGeometryIndex,
  clientRectToWorkspace,
  type MeasuredWorkspaceFrame,
  type ScreenRect,
  type WorkspacePoint,
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
  selectedNestedId: string | null;
  wideSectionIds: ReadonlySet<string>;
  selectNested(sectionId: string): void;
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
  const { selectedNestedId, selectNested, toggleNestedWidth, wideSectionIds } = useProofContext();
  const elementRef = useMeasuredFrame(section.id, parentSectionId, depth, order);
  const selected = selectedNestedId === section.id;
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
        onSelect={() => selectNested(section.id)}
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
          onClick={() => selectNested(section.id)}
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
    const { nestedByRoot } = useProofContext();
    const rootOrder = id === "root-alpha" ? 0 : 1;
    const elementRef = useMeasuredFrame(id, null, 0, rootOrder);

    return (
      <article
        className="setta-adapter-proof__root-section"
        data-proof-section-id={id}
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
  selectedNestedId: string | null;
};

function ProofCanvasControls({
  canvasElement,
  geometryIndex,
  selectedNestedId,
}: ProofCanvasControlsProps) {
  const instance = useReactFlow<ProofRootNode>();
  const viewport = useViewport();
  useGeometryRevision(geometryIndex);
  const selectedFrame = selectedNestedId ? geometryIndex.get(selectedNestedId) : undefined;

  const focusSelected = () => {
    if (!canvasElement || !selectedFrame || !selectedNestedId) {
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
        `[data-proof-section-id="${selectedNestedId}"]`,
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
          onClick={() => void instance.fitView({ duration: 0, nodes: [{ id: "root-alpha" }] })}
          type="button"
        >
          Fit planning section
        </button>
      </div>
    </Panel>
  );
}

function SelectedFrameOverlay({
  geometryIndex,
  selectedNestedId,
}: Pick<ProofCanvasControlsProps, "geometryIndex" | "selectedNestedId">) {
  useGeometryRevision(geometryIndex);
  const frame = selectedNestedId ? geometryIndex.get(selectedNestedId) : undefined;
  if (!frame) {
    return null;
  }

  return (
    <ViewportPortal>
      <div
        aria-hidden="true"
        className="setta-adapter-proof__selection-overlay"
        style={{
          height: frame.rect.height,
          transform: `translate(${frame.rect.x}px, ${frame.rect.y}px)`,
          width: frame.rect.width,
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
  const [selectedNestedId, setSelectedNestedId] = useState<string | null>("nested-note-b");
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

  const selectNested = useCallback(
    (sectionId: string) => {
      setSelectedNestedId(sectionId);
      diagnostics.setStatus(`${sectionId} selected through the package selection model.`);
    },
    [diagnostics],
  );

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
      selectedNestedId,
      wideSectionIds,
      selectNested,
      toggleNestedWidth,
    }),
    [
      canvasElement,
      geometryIndex,
      nestedByRoot,
      selectNested,
      selectedNestedId,
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
                selectedNestedId={selectedNestedId}
              />
              <SelectedFrameOverlay
                geometryIndex={geometryIndex}
                selectedNestedId={selectedNestedId}
              />
            </ReactFlow>
          </div>
        </UpstreamDndBoundary>
      </ProofContext.Provider>
    </section>
  );
}
