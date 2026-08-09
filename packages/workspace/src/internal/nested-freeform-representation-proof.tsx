import {
  ReactFlow,
  ReactFlowProvider,
  useStoreApi,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

export type NestedFreeformRepresentationCandidateId =
  "all-sections-xyflow" | "nested-xyflow" | "recursive-dom";

export type NestedFreeformRepresentationCandidate = Readonly<{
  id: NestedFreeformRepresentationCandidateId;
  label: string;
  reasons: readonly string[];
  selected: boolean;
}>;

export const NESTED_FREEFORM_REPRESENTATION_CANDIDATES = Object.freeze([
  Object.freeze({
    id: "all-sections-xyflow",
    label: "One all-section XYFlow graph",
    reasons: Object.freeze([
      "XYFlow renders parent and child wrappers as siblings, so a child cannot participate in its parent's native scroll and clipping DOM.",
    ]),
    selected: false,
  }),
  Object.freeze({
    id: "nested-xyflow",
    label: "One fixed XYFlow viewport per freeform container",
    reasons: Object.freeze([
      "Every freeform container adds another viewport and store owner, so store, culling, and coordinate ownership grows with container count.",
    ]),
    selected: false,
  }),
  Object.freeze({
    id: "recursive-dom",
    label: "Absolutely positioned recursive DOM",
    reasons: Object.freeze([
      "One outer XYFlow viewport remains the only pan and zoom owner while recursive DOM keeps native containment, scrolling, focus, and package geometry ownership.",
    ]),
    selected: true,
  }),
] satisfies readonly NestedFreeformRepresentationCandidate[]);

const PROOF_CONTAINER_COUNT = 6;
const proofStoreIds = new WeakMap<object, number>();
let nextProofStoreId = 1;

function proofStoreId(store: object): number {
  const existing = proofStoreIds.get(store);
  if (existing) return existing;
  const id = nextProofStoreId;
  nextProofStoreId += 1;
  proofStoreIds.set(store, id);
  return id;
}

function StoreProbe({ onStore }: Readonly<{ onStore(id: number): void }>) {
  const store = useStoreApi();
  useEffect(() => onStore(proofStoreId(store)), [onStore, store]);
  return null;
}

function useStoreCount(): Readonly<{
  count: number;
  register(id: number): void;
}> {
  const [ids, setIds] = useState<ReadonlySet<number>>(() => new Set());
  const register = useCallback((id: number) => {
    setIds((current) => {
      if (current.has(id)) return current;
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }, []);
  return { count: ids.size, register };
}

function CandidateCard({
  candidate,
  children,
}: Readonly<{
  candidate: NestedFreeformRepresentationCandidate;
  children: ReactNode;
}>) {
  return (
    <section
      aria-labelledby={`nested-freeform-candidate-${candidate.id}`}
      className="setta-nested-freeform-proof__candidate"
      data-proof-candidate={candidate.id}
      data-proof-verdict={candidate.selected ? "selected" : "rejected"}
    >
      <header className="setta-nested-freeform-proof__candidate-heading">
        <div>
          <p className="setta-nested-freeform-proof__candidate-verdict">
            {candidate.selected ? "Selected owner" : "Rejected candidate"}
          </p>
          <h2 id={`nested-freeform-candidate-${candidate.id}`}>{candidate.label}</h2>
        </div>
        <span aria-hidden="true" className="setta-nested-freeform-proof__candidate-mark">
          {candidate.selected ? "✓" : "×"}
        </span>
      </header>
      {children}
      <p className="setta-nested-freeform-proof__reason">{candidate.reasons[0]}</p>
    </section>
  );
}

type FlatProofData = Readonly<{ label: string }>;
type FlatProofNode = Node<FlatProofData, "flat-proof">;

function FlatProofSection({ data, id }: NodeProps<FlatProofNode>) {
  return (
    <article className="setta-nested-freeform-proof__flat-frame" data-proof-flat-frame={id}>
      <h3>{data.label}</h3>
      {id === "flat-parent" ? (
        <div data-proof-native-child-region="">Native child region</div>
      ) : null}
    </article>
  );
}

const flatProofNodeTypes = { "flat-proof": FlatProofSection } satisfies NodeTypes;

function AllSectionsXyflowCandidate() {
  const stores = useStoreCount();
  const nodes = useMemo<FlatProofNode[]>(
    () => [
      {
        data: { label: "Parent section" },
        id: "flat-parent",
        position: { x: 32, y: 24 },
        style: { height: 184, width: 290 },
        type: "flat-proof",
      },
      {
        data: { label: "Child section" },
        extent: "parent",
        id: "flat-child",
        parentId: "flat-parent",
        position: { x: 22, y: 84 },
        style: { height: 76, width: 220 },
        type: "flat-proof",
      },
    ],
    [],
  );
  return (
    <>
      <div className="setta-nested-freeform-proof__flow" data-proof-flow="all-sections">
        <ReactFlow
          elementsSelectable={false}
          fitView
          nodes={nodes}
          nodesConnectable={false}
          nodesDraggable={false}
          nodeTypes={flatProofNodeTypes}
          panOnDrag={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
          zoomOnDoubleClick={false}
          zoomOnPinch={false}
          zoomOnScroll={false}
        >
          <StoreProbe onStore={stores.register} />
        </ReactFlow>
      </div>
      <dl className="setta-nested-freeform-proof__diagnostics">
        <div>
          <dt>XYFlow stores</dt>
          <dd data-proof-store-count="all-sections">{stores.count}</dd>
        </div>
        <div>
          <dt>Native containment</dt>
          <dd data-proof-native-containment="flat">Child wrapper is a sibling</dd>
        </div>
      </dl>
    </>
  );
}

type InnerProofData = Readonly<{ label: string }>;
type InnerProofNode = Node<InnerProofData>;

function InnerFixedFlow({
  containerId,
  onStore,
}: Readonly<{ containerId: string; onStore(id: number): void }>) {
  const nodes = useMemo<InnerProofNode[]>(
    () => [
      {
        data: { label: `Child ${containerId}` },
        id: `inner-child-${containerId}`,
        position: { x: 10, y: 10 },
      },
    ],
    [containerId],
  );
  return (
    <div className="setta-nested-freeform-proof__inner-flow" data-proof-inner-flow={containerId}>
      <ReactFlowProvider>
        <ReactFlow
          elementsSelectable={false}
          nodes={nodes}
          nodesConnectable={false}
          nodesDraggable={false}
          panOnDrag={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
          zoomOnDoubleClick={false}
          zoomOnPinch={false}
          zoomOnScroll={false}
        >
          <StoreProbe onStore={onStore} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}

type NestedFlowData = Readonly<{ containerId: string; onStore(id: number): void }>;
type NestedFlowNode = Node<NestedFlowData, "nested-flow-proof">;

function NestedFlowSection({ data }: NodeProps<NestedFlowNode>) {
  return (
    <article className="setta-nested-freeform-proof__nested-flow-frame">
      <h3>Container {data.containerId}</h3>
      <InnerFixedFlow containerId={data.containerId} onStore={data.onStore} />
    </article>
  );
}

const nestedFlowNodeTypes = { "nested-flow-proof": NestedFlowSection } satisfies NodeTypes;

function NestedXyflowCandidate() {
  const stores = useStoreCount();
  const nodes = useMemo<NestedFlowNode[]>(
    () =>
      Array.from({ length: PROOF_CONTAINER_COUNT }, (_, index) => ({
        data: { containerId: String(index + 1), onStore: stores.register },
        id: `nested-flow-${String(index + 1)}`,
        position: { x: (index % 3) * 184 + 18, y: Math.floor(index / 3) * 136 + 18 },
        style: { height: 116, width: 166 },
        type: "nested-flow-proof" as const,
      })),
    [stores.register],
  );
  return (
    <>
      <div className="setta-nested-freeform-proof__flow" data-proof-flow="nested-xyflow">
        <ReactFlow
          elementsSelectable={false}
          nodes={nodes}
          nodesConnectable={false}
          nodesDraggable={false}
          nodeTypes={nestedFlowNodeTypes}
          panOnDrag={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
          zoomOnDoubleClick={false}
          zoomOnPinch={false}
          zoomOnScroll={false}
        >
          <StoreProbe onStore={stores.register} />
        </ReactFlow>
      </div>
      <dl className="setta-nested-freeform-proof__diagnostics">
        <div>
          <dt>Freeform containers</dt>
          <dd data-proof-container-count="nested-xyflow">{PROOF_CONTAINER_COUNT}</dd>
        </div>
        <div>
          <dt>XYFlow stores</dt>
          <dd data-proof-store-count="nested-xyflow">{stores.count}</dd>
        </div>
      </dl>
    </>
  );
}

type ProofPosition = Readonly<{ x: number; y: number }>;
type RecursivePositioning = "freeform" | "ordered";

const initialPositions: Readonly<Record<string, ProofPosition>> = Object.freeze({
  alpha: Object.freeze({ x: 16, y: 18 }),
  beta: Object.freeze({ x: 176, y: 70 }),
  container: Object.freeze({ x: 344, y: 18 }),
});

function offsetPosition(position: ProofPosition | undefined): ProofPosition {
  return { x: (position?.x ?? 0) + 24, y: (position?.y ?? 0) + 16 };
}

function SpatialSection({
  children,
  id,
  position,
  positioning,
  selected = false,
  title,
}: Readonly<{
  children?: ReactNode;
  id: string;
  position: ProofPosition;
  positioning: RecursivePositioning;
  selected?: boolean;
  title: string;
}>) {
  const style =
    positioning === "freeform"
      ? ({ insetInlineStart: position.x, insetBlockStart: position.y } satisfies CSSProperties)
      : undefined;
  return (
    <article
      className="setta-nested-freeform-proof__recursive-section"
      data-proof-recursive-section={id}
      data-selected={String(selected)}
      style={style}
    >
      <h3>{title}</h3>
      {children}
    </article>
  );
}

function ScrollRegion({ betaNested }: Readonly<{ betaNested: boolean }>) {
  return (
    /* eslint-disable jsx-a11y/no-noninteractive-tabindex -- Native scroll regions need a keyboard focus stop. */
    <div
      aria-label="Nested ordered section list"
      className="setta-nested-freeform-proof__scroll-region nodrag nopan nowheel"
      data-proof-native-scroll=""
      role="region"
      tabIndex={0}
    >
      {betaNested ? (
        <button data-proof-recursive-section="beta" type="button">
          Beta section, reparented
        </button>
      ) : null}
      {Array.from({ length: 8 }, (_, index) => (
        <button key={index} type="button">
          Ordered child {index + 1}
        </button>
      ))}
    </div>
    /* eslint-enable jsx-a11y/no-noninteractive-tabindex */
  );
}

function RecursiveDomSurface() {
  const [positioning, setPositioning] = useState<RecursivePositioning>("ordered");
  const [positions, setPositions] = useState(initialPositions);
  const [betaNested, setBetaNested] = useState(false);
  const [commandCount, setCommandCount] = useState(0);
  const [status, setStatus] = useState("Recursive DOM proof ready.");
  const moveSelectedBlock = () => {
    setPositions((current) => ({
      ...current,
      alpha: offsetPosition(current.alpha),
      beta: offsetPosition(current.beta),
    }));
    setCommandCount((count) => count + 1);
    setStatus("Moved Alpha and Beta by one atomic local-space command.");
  };
  const toggleBetaParent = () => {
    setBetaNested((current) => !current);
    setCommandCount((count) => count + 1);
    setStatus(
      betaNested
        ? "Moved Beta from the ordered container to the freeform parent."
        : "Moved Beta from the freeform parent to the ordered container.",
    );
  };
  return (
    <div className="setta-nested-freeform-proof__recursive-surface">
      <div
        className="setta-nested-freeform-proof__controls"
        role="group"
        aria-label="Proof controls"
      >
        <button
          onClick={() => {
            const next = positioning === "ordered" ? "freeform" : "ordered";
            setPositioning(next);
            setStatus(`Switched direct children to ${next} positioning.`);
          }}
          type="button"
        >
          Use {positioning === "ordered" ? "freeform" : "ordered"} layout
        </button>
        <button
          disabled={positioning !== "freeform" || betaNested}
          onClick={moveSelectedBlock}
          type="button"
        >
          Move selected block
        </button>
        <button disabled={positioning !== "freeform"} onClick={toggleBetaParent} type="button">
          {betaNested ? "Move Beta to freeform parent" : "Move Beta into ordered container"}
        </button>
      </div>
      <div
        className="setta-nested-freeform-proof__recursive-region"
        data-proof-positioning={positioning}
      >
        <SpatialSection
          id="alpha"
          position={positions.alpha ?? { x: 0, y: 0 }}
          positioning={positioning}
          selected
          title="Alpha section"
        >
          <button type="button">Focus Alpha</button>
        </SpatialSection>
        {!betaNested ? (
          <SpatialSection
            id="beta"
            position={positions.beta ?? { x: 0, y: 0 }}
            positioning={positioning}
            selected
            title="Beta section"
          >
            <button type="button">Focus Beta</button>
          </SpatialSection>
        ) : null}
        <SpatialSection
          id="container"
          position={positions.container ?? { x: 0, y: 0 }}
          positioning={positioning}
          title="Nested container"
        >
          <ScrollRegion betaNested={betaNested} />
        </SpatialSection>
      </div>
      <div className="setta-nested-freeform-proof__container-bank" data-proof-container-bank="">
        {Array.from({ length: PROOF_CONTAINER_COUNT }, (_, index) => (
          <span data-proof-recursive-container={index + 1} key={index}>
            DOM region {index + 1}
          </span>
        ))}
      </div>
      <dl className="setta-nested-freeform-proof__diagnostics">
        <div>
          <dt>Atomic commands</dt>
          <dd data-proof-command-count="recursive-dom">{commandCount}</dd>
        </div>
        <div>
          <dt>Movement owner</dt>
          <dd data-proof-movement-owner="recursive-dom">Package structural adapter</dd>
        </div>
      </dl>
      <p aria-live="polite" data-proof-status="recursive-dom" role="status">
        {status}
      </p>
    </div>
  );
}

type RecursiveRootData = Readonly<{ content: ReactNode }>;
type RecursiveRootNode = Node<RecursiveRootData, "recursive-proof">;

function RecursiveRootSection({ data }: NodeProps<RecursiveRootNode>) {
  return <article className="setta-nested-freeform-proof__root-frame">{data.content}</article>;
}

const recursiveProofNodeTypes = { "recursive-proof": RecursiveRootSection } satisfies NodeTypes;

function RecursiveDomCandidate() {
  const stores = useStoreCount();
  const nodes = useMemo<RecursiveRootNode[]>(
    () => [
      {
        data: { content: <RecursiveDomSurface /> },
        id: "recursive-root",
        position: { x: 18, y: 18 },
        style: { height: 540, width: "min(630px, calc(100vw - 84px))" },
        type: "recursive-proof",
      },
    ],
    [],
  );
  return (
    <>
      <div
        className="setta-nested-freeform-proof__flow setta-nested-freeform-proof__flow--selected"
        data-proof-flow="recursive-dom"
      >
        <ReactFlow
          elementsSelectable
          nodes={nodes}
          nodesConnectable={false}
          nodesDraggable={false}
          nodesFocusable={false}
          nodeTypes={recursiveProofNodeTypes}
          panOnDrag={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
          zoomOnDoubleClick={false}
          zoomOnPinch={false}
          zoomOnScroll={false}
        >
          <StoreProbe onStore={stores.register} />
        </ReactFlow>
      </div>
      <dl className="setta-nested-freeform-proof__diagnostics">
        <div>
          <dt>Recursive DOM regions</dt>
          <dd data-proof-container-count="recursive-dom">{PROOF_CONTAINER_COUNT}</dd>
        </div>
        <div>
          <dt>XYFlow stores</dt>
          <dd data-proof-store-count="recursive-dom">{stores.count}</dd>
        </div>
      </dl>
    </>
  );
}

function candidate(id: NestedFreeformRepresentationCandidateId) {
  const result = NESTED_FREEFORM_REPRESENTATION_CANDIDATES.find((entry) => entry.id === id);
  if (!result) throw new Error(`Unknown nested freeform representation candidate ${id}.`);
  return result;
}

export function NestedFreeformRepresentationProof() {
  return (
    <div className="setta-nested-freeform-proof">
      <p className="setta-nested-freeform-proof__intro">
        The comparison stops at the first failed invariant for each rejected candidate. The selected
        owner keeps one outer viewport and one recursive section DOM.
      </p>
      <div className="setta-nested-freeform-proof__candidates">
        <CandidateCard candidate={candidate("all-sections-xyflow")}>
          <AllSectionsXyflowCandidate />
        </CandidateCard>
        <CandidateCard candidate={candidate("nested-xyflow")}>
          <NestedXyflowCandidate />
        </CandidateCard>
        <CandidateCard candidate={candidate("recursive-dom")}>
          <RecursiveDomCandidate />
        </CandidateCard>
      </div>
    </div>
  );
}
