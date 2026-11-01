import { describe, expect, it, vi } from "vitest";
import type { WorkspaceSection } from "../document/types";
import type {
  WorkspaceGraphConfiguration,
  WorkspaceGraphConnection,
  WorkspaceGraphPort,
  WorkspaceGraphReconnect,
} from "./types";
import {
  createWorkspaceGraphConnection,
  evaluateWorkspaceGraphConnection,
  getWorkspaceGraphPortPosition,
  getWorkspaceGraphPortSide,
  validateWorkspaceGraphConfiguration,
} from "./validation";

function createSection(id: string): WorkspaceSection {
  return {
    children: [],
    id,
    isHorizontalOrientation: false,
    isMinimized: false,
    kind: "leaf",
    name: id,
    overflowMode: false,
    positionAndSizeLocked: false,
    size: { height: 100, width: 180 },
    styleColor: null,
    tagColor: null,
  };
}

const sections = {
  nested: createSection("nested"),
  source: createSection("source"),
  target: createSection("target"),
};

const ports = [
  {
    family: "audio",
    id: "source-output",
    label: "Source output",
    sectionId: "source",
    type: "source",
  },
  {
    family: "audio",
    id: "target-input",
    label: "Target input",
    sectionId: "target",
    type: "target",
  },
  {
    family: "mod",
    id: "nested-mod-input",
    label: "Nested mod input",
    sectionId: "nested",
    type: "target",
  },
] as const satisfies ReadonlyArray<WorkspaceGraphPort>;

const families = {
  audio: { color: "#22d3ee" },
  mod: { color: "#a78bfa", pattern: "dotted" },
  notes: { color: "#f59e0b", pattern: "dashed" },
} as const satisfies WorkspaceGraphConfiguration["families"];

function createConfiguration(
  overrides: Partial<WorkspaceGraphConfiguration> = {},
): WorkspaceGraphConfiguration {
  return {
    canConnect: () => true,
    edges: [
      {
        family: "audio",
        id: "data-edge",
        source: { portId: "source-output", sectionId: "source" },
        target: { portId: "target-input", sectionId: "target" },
      },
    ],
    families,
    ports,
    selectedEdgeIds: new Set(["data-edge"]),
    ...overrides,
  };
}

describe("Workspace graph validation", () => {
  it("normalizes port defaults and retains deterministic edge order", () => {
    const snapshot = validateWorkspaceGraphConfiguration(
      createConfiguration({
        edges: [
          {
            family: "audio",
            id: "second",
            source: { portId: "source-output", sectionId: "source" },
            target: { portId: "target-input", sectionId: "target" },
          },
          {
            family: "audio",
            id: "first",
            source: { portId: "source-output", sectionId: "source" },
            target: { portId: "target-input", sectionId: "target" },
          },
        ],
        selectedEdgeIds: new Set(["first"]),
      }),
      sections,
    );
    if (!snapshot) {
      throw new Error("Workspace graph snapshot was not created.");
    }

    const source = snapshot.portsById.get("source-output");
    const target = snapshot.portsById.get("target-input");
    if (!source || !target) {
      throw new Error("Workspace graph ports were not retained.");
    }
    expect(getWorkspaceGraphPortSide(source)).toBe("right");
    expect(getWorkspaceGraphPortSide(target)).toBe("left");
    expect(getWorkspaceGraphPortPosition(source)).toBe(0.5);
    expect(snapshot.edges.map((edge) => edge.id)).toEqual(["second", "first"]);
    expect(snapshot.selectedEdgeIds).toEqual(new Set(["first"]));
    expect(snapshot.families.get("mod")).toEqual({
      color: "#a78bfa",
      pattern: "dotted",
    });
    expect(snapshot.families.get("audio")?.pattern).toBe("solid");
    expect(Object.isFrozen(snapshot.ports[0])).toBe(true);
    expect(Object.isFrozen(snapshot.edges[0])).toBe(true);
  });

  it("rejects incomplete snapshots before graph presentation", () => {
    expect(() =>
      validateWorkspaceGraphConfiguration(
        createConfiguration({
          ports: [
            ports[0],
            {
              ...ports[0],
              label: "Duplicated output",
              sectionId: "target",
            },
          ],
        }),
        sections,
      ),
    ).toThrow('duplicate port id "source-output"');

    expect(() =>
      validateWorkspaceGraphConfiguration(
        createConfiguration({
          ports: [
            {
              ...ports[0],
              sectionId: "missing-section",
            },
            ports[1],
          ],
        }),
        sections,
      ),
    ).toThrow('unknown section "missing-section"');

    expect(() =>
      validateWorkspaceGraphConfiguration(
        createConfiguration({
          edges: [
            {
              family: "notes",
              id: "wrong-family",
              source: { portId: "source-output", sectionId: "source" },
              target: { portId: "target-input", sectionId: "target" },
            },
          ],
          selectedEdgeIds: new Set(),
        }),
        sections,
      ),
    ).toThrow('family must match its source port "source-output"');

    expect(() =>
      validateWorkspaceGraphConfiguration(
        createConfiguration({
          edges: [
            {
              family: "audio",
              id: "wrong-direction",
              source: { portId: "target-input", sectionId: "target" },
              target: { portId: "source-output", sectionId: "source" },
            },
          ],
          selectedEdgeIds: new Set(),
        }),
        sections,
      ),
    ).toThrow('source port "target-input" must be a source port');
  });

  it("ignores selected edge ids that no longer match a controlled edge", () => {
    const snapshot = validateWorkspaceGraphConfiguration(
      createConfiguration({
        edges: [],
        selectedEdgeIds: new Set(["data-edge"]),
      }),
      sections,
    );
    expect(snapshot?.selectedEdgeIds).toEqual(new Set());
  });

  it("requires every port and edge family to be declared by the host", () => {
    expect(() =>
      validateWorkspaceGraphConfiguration(
        createConfiguration({
          edges: [],
          ports: [{ ...ports[0], family: "control" }],
          selectedEdgeIds: new Set(),
        }),
        sections,
      ),
    ).toThrow(
      'Workspace graph port at index 0 family "control" is not declared in Workspace graph families.',
    );

    expect(() =>
      validateWorkspaceGraphConfiguration(
        createConfiguration({ families: { mod: families.mod } }),
        sections,
      ),
    ).toThrow('family "audio" is not declared');

    expect(() =>
      validateWorkspaceGraphConfiguration(
        {
          ...createConfiguration(),
          families: undefined,
        } as unknown as WorkspaceGraphConfiguration,
        sections,
      ),
    ).toThrow("families must be a record");

    expect(() =>
      validateWorkspaceGraphConfiguration(
        createConfiguration({
          families: { ...families, audio: { color: " " } },
        }),
        sections,
      ),
    ).toThrow(
      'Workspace graph family "audio" color must be a non-empty string',
    );

    expect(() =>
      validateWorkspaceGraphConfiguration(
        {
          ...createConfiguration(),
          families: { ...families, audio: { color: "red", pattern: "wavy" } },
        } as unknown as WorkspaceGraphConfiguration,
        sections,
      ),
    ).toThrow("pattern must be solid, dashed, or dotted");
  });

  it("rejects malformed callback and placement input", () => {
    expect(() =>
      validateWorkspaceGraphConfiguration(
        {
          ...createConfiguration(),
          canConnect: "yes",
        } as unknown as WorkspaceGraphConfiguration,
        sections,
      ),
    ).toThrow("canConnect must be a synchronous function");

    expect(() =>
      validateWorkspaceGraphConfiguration(
        createConfiguration({
          ports: [{ ...ports[0], position: Number.NaN }, ports[1]],
        }),
        sections,
      ),
    ).toThrow("position must be a finite number from 0 through 1");
  });

  it("accepts status overlays on any declared family", () => {
    const snapshot = validateWorkspaceGraphConfiguration(
      createConfiguration({
        edges: [
          {
            family: "audio",
            id: "running-audio",
            source: { portId: "source-output", sectionId: "source" },
            status: "running",
            target: { portId: "target-input", sectionId: "target" },
          },
          {
            family: "audio",
            id: "missing-audio",
            source: { portId: "source-output", sectionId: "source" },
            status: "missing",
            target: { portId: "target-input", sectionId: "target" },
          },
        ],
        selectedEdgeIds: new Set(),
      }),
      sections,
    );
    expect(snapshot?.edges.map((edge) => edge.status)).toEqual([
      "running",
      "missing",
    ]);
  });

  it("normalizes target-originated drags and passes detached connections to validation", () => {
    const source = ports[0];
    const target = ports[1];
    const connection = createWorkspaceGraphConnection(target, source);
    expect(connection).toEqual({
      family: "audio",
      source: { portId: "source-output", sectionId: "source" },
      target: { portId: "target-input", sectionId: "target" },
    });
    expect(Object.isFrozen(connection)).toBe(true);

    let callbackConnection: WorkspaceGraphConnection | undefined;
    const canConnect = (candidate: WorkspaceGraphConnection) => {
      callbackConnection = candidate;
      return true;
    };
    const snapshot = validateWorkspaceGraphConfiguration(
      createConfiguration({ canConnect }),
      sections,
    );
    if (!snapshot) {
      throw new Error("Workspace graph snapshot was not created.");
    }
    const evaluation = evaluateWorkspaceGraphConnection(
      snapshot,
      "target-input",
      "source-output",
    );
    expect(evaluation.valid).toBe(true);
    expect(evaluation.connection).toEqual(connection);
    expect(callbackConnection).toEqual(connection);
    expect(callbackConnection).not.toBe(evaluation.connection);
    expect(Object.isFrozen(callbackConnection)).toBe(true);
  });

  it("uses replacement-aware policy for reconnect candidates", () => {
    const canConnect = vi.fn(() => false);
    const canReconnect = vi.fn((_reconnect: WorkspaceGraphReconnect) => true);
    const snapshot = validateWorkspaceGraphConfiguration(
      createConfiguration({ canConnect, canReconnect }),
      sections,
    );
    if (!snapshot) {
      throw new Error("Workspace graph snapshot was not created.");
    }

    expect(
      evaluateWorkspaceGraphConnection(
        snapshot,
        "source-output",
        "target-input",
        "data-edge",
      ).valid,
    ).toBe(true);
    expect(canConnect).not.toHaveBeenCalled();
    expect(canReconnect).toHaveBeenCalledWith({
      connection: {
        family: "audio",
        source: { portId: "source-output", sectionId: "source" },
        target: { portId: "target-input", sectionId: "target" },
      },
      edgeId: "data-edge",
    });
    const callbackReconnect = canReconnect.mock.calls[0]?.[0];
    if (callbackReconnect === undefined) {
      throw new Error("Workspace graph reconnect policy was not called.");
    }
    expect(Object.isFrozen(callbackReconnect)).toBe(true);
    expect(Object.isFrozen(callbackReconnect.connection)).toBe(true);
  });

  it("uses a synchronous host policy for self-connections", () => {
    const selfPorts: ReadonlyArray<WorkspaceGraphPort> = [
      {
        family: "notes",
        id: "loop-source",
        label: "Loop source",
        sectionId: "source",
        type: "source",
      },
      {
        family: "notes",
        id: "loop-target",
        label: "Loop target",
        sectionId: "source",
        type: "target",
      },
    ];
    const snapshot = validateWorkspaceGraphConfiguration(
      createConfiguration({
        canConnect: (connection) =>
          connection.source.sectionId !== connection.target.sectionId,
        edges: [],
        ports: selfPorts,
        selectedEdgeIds: new Set(),
      }),
      sections,
    );
    if (!snapshot) {
      throw new Error("Workspace graph snapshot was not created.");
    }
    expect(
      evaluateWorkspaceGraphConnection(snapshot, "loop-source", "loop-target"),
    ).toEqual({
      connection: {
        family: "notes",
        source: { portId: "loop-source", sectionId: "source" },
        target: { portId: "loop-target", sectionId: "source" },
      },
      valid: false,
    });
  });
});
