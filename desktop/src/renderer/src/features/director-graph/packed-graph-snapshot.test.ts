import { describe, expect, it } from "vitest";

import {
  buildPackedGraphSnapshot,
  emptyPackedGraphSnapshot,
  extendPackedGraphSnapshot,
  type PackedGraphBatch,
  type PackedGraphEdgeInput,
  type PackedGraphNodeInput,
  type PackedGraphSnapshot,
  type PackedGraphTurnInput,
} from "./packed-graph-snapshot";
import {
  packedGraphLimits,
  packedGraphModeCode,
  packedGraphNever,
  packedGraphRoleCode,
  packedValueAt,
} from "./packed-graph-vocabulary";

const stepDefaults = {
  turn: 0,
  role: "step",
  mode: "do",
  glyph: "edit",
  emphasis: "fact",
  detail: "detailed",
  lane: 0,
  settleAt: 10,
  terminalAt: null,
  label: "step",
  labelPlacement: "below",
} satisfies Omit<PackedGraphNodeInput, "id" | "row" | "bornAt">;

function makeNode(
  id: string,
  row: number,
  bornAt: number,
  overrides: Partial<PackedGraphNodeInput> = {},
): PackedGraphNodeInput {
  return { ...stepDefaults, id, row, bornAt, ...overrides };
}

function makeEdge(
  fromNodeId: string,
  toNodeId: string,
  overrides: Partial<PackedGraphEdgeInput> = {},
): PackedGraphEdgeInput {
  return {
    fromNodeId,
    toNodeId,
    mode: "do",
    channel: "flow",
    confidence: 0.9,
    terminated: false,
    ...overrides,
  };
}

function runningTurn(rowSpan: number): PackedGraphTurnInput {
  return {
    index: 0,
    column: 0,
    columnTop: 0,
    workstreamId: "fixture",
    inputNodeId: "input",
    outcomeNodeId: null,
    rowSpan,
    outcome: "running",
    answerAt: null,
    compactAt: null,
  };
}

function firstBatch(overrides: Partial<PackedGraphBatch> = {}): PackedGraphBatch {
  return {
    cursorSequence: 3,
    hasEarlier: false,
    nodes: [
      makeNode("input", 0, 0, {
        role: "input",
        mode: "listening",
        glyph: "microphone",
        label: "why is the frame late?",
      }),
      makeNode("step-1", 1, 1),
    ],
    edges: [makeEdge("input", "step-1")],
    turns: [runningTurn(2)],
    ...overrides,
  };
}

const secondBatch: PackedGraphBatch = {
  cursorSequence: 5,
  hasEarlier: false,
  nodes: [makeNode("step-2", 2, 2)],
  edges: [makeEdge("step-1", "step-2")],
  turns: [runningTurn(3)],
};

function started(): PackedGraphSnapshot {
  return extendPackedGraphSnapshot(emptyPackedGraphSnapshot("workstream-1"), firstBatch());
}

describe("packed graph snapshot", () => {
  it("starts empty and frozen", () => {
    const snapshot = emptyPackedGraphSnapshot("workstream-1");
    expect(snapshot.nodeCount).toBe(0);
    expect(snapshot.edgeCount).toBe(0);
    expect(snapshot.turnCount).toBe(0);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it("packs nodes in durable order with their visual codes", () => {
    const snapshot = started();
    expect(snapshot.nodeCount).toBe(2);
    expect(snapshot.nodes.ids).toEqual(["input", "step-1"]);
    expect(packedValueAt(snapshot.nodes.role, 0)).toBe(packedGraphRoleCode.input);
    expect(packedValueAt(snapshot.nodes.mode, 0)).toBe(packedGraphModeCode.listening);
    expect(snapshot.nodeIndexById.get("step-1")).toBe(1);
    expect(snapshot.cursorSequence).toBe(3);
  });

  it("grows an edge from its child's birth", () => {
    const snapshot = started();
    expect(packedValueAt(snapshot.edges.bornAt, 0)).toBe(1);
    expect(packedValueAt(snapshot.edges.from, 0)).toBe(0);
    expect(packedValueAt(snapshot.edges.to, 0)).toBe(1);
  });

  it("settles a parent onto its earliest child and reports the change", () => {
    const snapshot = extendPackedGraphSnapshot(started(), secondBatch);
    expect(packedValueAt(snapshot.nodes.settleAt, 1)).toBe(2);
    expect(snapshot.changed.nodesFrom).toBe(1);
    expect(snapshot.changed.edgesFrom).toBe(1);
    expect(snapshot.changed.turnsFrom).toBe(0);
  });

  it("leaves the previous snapshot untouched", () => {
    const previous = started();
    const next = extendPackedGraphSnapshot(previous, secondBatch);
    expect(packedValueAt(previous.nodes.settleAt, 1)).toBe(10);
    expect(packedValueAt(next.nodes.settleAt, 1)).toBe(2);
    expect(previous.nodeCount).toBe(2);
  });

  it("reports an empty changed range when only a turn moves", () => {
    const snapshot = extendPackedGraphSnapshot(started(), {
      cursorSequence: 4,
      hasEarlier: true,
      nodes: [],
      edges: [],
      turns: [runningTurn(4)],
    });
    expect(snapshot.changed.nodesFrom).toBe(snapshot.nodeCount);
    expect(snapshot.changed.edgesFrom).toBe(snapshot.edgeCount);
    expect(snapshot.changed.turnsFrom).toBe(0);
    expect(snapshot.hasEarlier).toBe(true);
  });

  it("closes a turn onto its outcome node", () => {
    const snapshot = extendPackedGraphSnapshot(started(), {
      cursorSequence: 6,
      hasEarlier: false,
      nodes: [
        makeNode("done", 2, 4, {
          role: "outcome",
          mode: "success",
          glyph: "check",
          labelPlacement: "over",
        }),
      ],
      edges: [makeEdge("step-1", "done")],
      turns: [
        {
          index: 0,
          column: 0,
          columnTop: 0,
          workstreamId: "fixture",
          inputNodeId: "input",
          outcomeNodeId: "done",
          rowSpan: 3,
          outcome: "succeeded",
          answerAt: 4,
          compactAt: 6,
        },
      ],
    });
    expect(packedValueAt(snapshot.turns.outcomeNode, 0)).toBe(2);
    expect(packedValueAt(snapshot.turns.answerAt, 0)).toBe(4);
  });

  it("packs a terminated branch with its terminal time", () => {
    const snapshot = extendPackedGraphSnapshot(started(), {
      cursorSequence: 7,
      hasEarlier: false,
      nodes: [makeNode("dead", 2, 3, { terminalAt: 4 })],
      edges: [makeEdge("step-1", "dead", { terminated: true, channel: "branch" })],
      turns: [runningTurn(3)],
    });
    expect(packedValueAt(snapshot.nodes.terminal, 2)).toBe(1);
    expect(packedValueAt(snapshot.nodes.terminalAt, 2)).toBe(4);
    expect(packedValueAt(snapshot.nodes.settleAt, 2)).toBe(4);
    expect(packedValueAt(snapshot.nodes.terminalAt, 1)).toBe(packedGraphNever);
  });

  it("bounds a label that is longer than the canvas budget", () => {
    const long = "x".repeat(packedGraphLimits.maxLabelCharacters + 40);
    const snapshot = extendPackedGraphSnapshot(
      emptyPackedGraphSnapshot("workstream-1"),
      firstBatch({
        nodes: [makeNode("input", 0, 0, { role: "input", label: `  ${long}  ` })],
        edges: [],
        turns: [runningTurn(1)],
      }),
    );
    const label = snapshot.nodes.labels[0] ?? "";
    expect(Array.from(label)).toHaveLength(packedGraphLimits.maxLabelCharacters);
    expect(label.endsWith("…")).toBe(true);
    expect(packedValueAt(snapshot.nodes.labelTruncated, 0)).toBe(1);
  });

  it("applies a batch stream in order", () => {
    const snapshot = buildPackedGraphSnapshot("workstream-1", [firstBatch(), secondBatch]);
    expect(snapshot.nodeCount).toBe(3);
    expect(snapshot.cursorSequence).toBe(5);
  });
});

describe("packed graph batch validation", () => {
  const cases: readonly {
    name: string;
    batch: PackedGraphBatch;
    message: string;
  }[] = [
    {
      name: "a cursor that does not advance",
      batch: firstBatch({ cursorSequence: 0 }),
      message: "does not advance",
    },
    {
      name: "a duplicate node id",
      batch: firstBatch({
        nodes: [makeNode("input", 0, 0, { role: "input" }), makeNode("input", 1, 1)],
        edges: [],
      }),
      message: "already packed",
    },
    {
      name: "an unknown edge endpoint",
      batch: firstBatch({ edges: [makeEdge("input", "missing")] }),
      message: "unknown node missing",
    },
    {
      name: "an edge that runs backwards",
      batch: firstBatch({ edges: [makeEdge("step-1", "input")] }),
      message: "runs backwards",
    },
    {
      name: "a node born before the one packed ahead of it",
      batch: firstBatch({
        nodes: [makeNode("input", 0, 5, { role: "input" }), makeNode("step-1", 1, 1)],
      }),
      message: "before the previous node",
    },
    {
      name: "a row outside its turn",
      batch: firstBatch({ turns: [runningTurn(1)] }),
      message: "outside its turn",
    },
    {
      name: "a confidence outside the beam range",
      batch: firstBatch({
        edges: [makeEdge("input", "step-1", { confidence: 1.5 })],
      }),
      message: "outside 0..1",
    },
    {
      name: "an unknown visual vocabulary value",
      batch: firstBatch({
        nodes: [
          makeNode("input", 0, 0, { role: "input" }),
          makeNode("step-1", 1, 1, {
            mode: "provider-invented-mode" as PackedGraphNodeInput["mode"],
          }),
        ],
      }),
      message: "unsupported value",
    },
    {
      name: "a non-finite settle time",
      batch: firstBatch({
        nodes: [
          makeNode("input", 0, 0, { role: "input" }),
          makeNode("step-1", 1, 1, { settleAt: Number.POSITIVE_INFINITY }),
        ],
      }),
      message: "settleAt must be finite",
    },
    {
      name: "an edge whose terminal flag disagrees with its child",
      batch: firstBatch({
        edges: [makeEdge("input", "step-1", { terminated: true })],
      }),
      message: "terminated flag does not match",
    },
    {
      name: "a turn that runs and names an outcome",
      batch: firstBatch({
        turns: [{ ...runningTurn(2), outcomeNodeId: "step-1" }],
      }),
      message: "names an outcome node",
    },
    {
      name: "an outcome node that is not an outcome",
      batch: firstBatch({
        turns: [
          {
            index: 0,
            column: 0,
            columnTop: 0,
            workstreamId: "fixture",
            inputNodeId: "input",
            outcomeNodeId: "step-1",
            rowSpan: 2,
            outcome: "succeeded",
            answerAt: 1,
            compactAt: null,
          },
        ],
      }),
      message: "is not an outcome node",
    },
    {
      name: "a turn index that leaves a gap",
      batch: firstBatch({ turns: [{ ...runningTurn(2), index: 2 }] }),
      message: "leaves a gap",
    },
  ];

  it.each(cases)("rejects $name", ({ batch, message }) => {
    expect(() =>
      extendPackedGraphSnapshot(emptyPackedGraphSnapshot("workstream-1"), batch),
    ).toThrow(message);
  });

  it("accepts an edge that continues from a failed node", () => {
    // A conversation recovers from failures: the next run chains from the
    // failed outcome it answers, so a failed node may produce children.
    const snapshot = extendPackedGraphSnapshot(
      emptyPackedGraphSnapshot("workstream-1"),
      firstBatch({
        nodes: [
          makeNode("input", 0, 0, { role: "input" }),
          makeNode("step-1", 1, 1, { terminalAt: 2 }),
        ],
        edges: [makeEdge("input", "step-1", { terminated: true })],
      }),
    );
    const extended = extendPackedGraphSnapshot(snapshot, {
      cursorSequence: 9,
      hasEarlier: false,
      nodes: [makeNode("step-2", 2, 3)],
      edges: [makeEdge("step-1", "step-2")],
      turns: [runningTurn(3)],
    });
    expect(extended.nodeCount).toBe(3);
    expect(extended.edgeCount).toBe(2);
  });

  it("rejects an existing turn whose row span regresses", () => {
    expect(() =>
      extendPackedGraphSnapshot(started(), {
        cursorSequence: 4,
        hasEarlier: false,
        nodes: [],
        edges: [],
        turns: [runningTurn(1)],
      }),
    ).toThrow("row span regresses");
  });

  it("rejects an existing turn whose input identity changes", () => {
    expect(() =>
      extendPackedGraphSnapshot(started(), {
        cursorSequence: 4,
        hasEarlier: false,
        nodes: [
          makeNode("replacement-input", 0, 2, {
            role: "input",
            mode: "listening",
            glyph: "microphone",
          }),
        ],
        edges: [],
        turns: [{ ...runningTurn(2), inputNodeId: "replacement-input" }],
      }),
    ).toThrow("changes its input node");
  });

  it("rejects changes after a turn reaches a terminal outcome", () => {
    const closed = extendPackedGraphSnapshot(started(), {
      cursorSequence: 6,
      hasEarlier: false,
      nodes: [
        makeNode("done", 2, 4, {
          role: "outcome",
          mode: "success",
          glyph: "check",
          labelPlacement: "over",
        }),
      ],
      edges: [makeEdge("step-1", "done")],
      turns: [
        {
          index: 0,
          column: 0,
          columnTop: 0,
          workstreamId: "fixture",
          inputNodeId: "input",
          outcomeNodeId: "done",
          rowSpan: 3,
          outcome: "succeeded",
          answerAt: 4,
          compactAt: 6,
        },
      ],
    });
    expect(() =>
      extendPackedGraphSnapshot(closed, {
        cursorSequence: 7,
        hasEarlier: false,
        nodes: [],
        edges: [],
        turns: [
          {
            index: 0,
            column: 0,
            columnTop: 0,
            workstreamId: "fixture",
            inputNodeId: "input",
            outcomeNodeId: "done",
            rowSpan: 3,
            outcome: "failed",
            answerAt: 4,
            compactAt: 6,
          },
        ],
      }),
    ).toThrow("changes after reaching terminal outcome");
  });

  it("rejects edges that are not ordered by their target node", () => {
    expect(() =>
      extendPackedGraphSnapshot(started(), {
        cursorSequence: 7,
        hasEarlier: false,
        nodes: [makeNode("step-2", 2, 2), makeNode("step-3", 3, 3)],
        edges: [makeEdge("step-1", "step-3"), makeEdge("step-1", "step-2")],
        turns: [runningTurn(4)],
      }),
    ).toThrow("out of target order");
  });
});
