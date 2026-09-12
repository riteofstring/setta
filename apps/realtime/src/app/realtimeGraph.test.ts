import { describe, expect, it } from "vitest";
import type {
  WorkspaceGraphConnection,
  WorkspaceGraphPort,
} from "@setta/workspace";

import type { Binding, Project } from "../backend/generatedContract";
import { makeProject } from "../testProject";
import {
  canConnectRealtimeGraph,
  connectRealtimeGraphOperations,
  deleteRealtimeGraphOperations,
  pruneRealtimeSelectedEdgeIds,
  projectRealtimeGraph,
  reconnectRealtimeGraphOperations,
  setRealtimeBindingOperations,
} from "./realtimeGraph";

function port(
  ports: WorkspaceGraphPort[],
  sectionId: string,
  label: string,
  type: WorkspaceGraphPort["type"],
): WorkspaceGraphPort {
  const result = ports.find(
    (candidate) =>
      candidate.sectionId === sectionId &&
      candidate.label === label &&
      candidate.type === type,
  );
  if (result === undefined) {
    throw new Error(`Missing ${type} port ${sectionId}.${label}.`);
  }
  return result;
}

function connection(
  source: WorkspaceGraphPort,
  target: WorkspaceGraphPort,
): WorkspaceGraphConnection {
  return {
    family: source.family,
    source: { portId: source.id, sectionId: source.sectionId },
    target: { portId: target.id, sectionId: target.sectionId },
  };
}

function withConsumer(project: Project): Project {
  const binding: Binding = {
    arguments: { other: null },
    handler: "combine",
    id: "binding-combine",
    outputs: { image: {} },
    scheduling: {
      concurrencyGroup: "combine",
      concurrencyLimit: 1,
      debounceMilliseconds: 0,
      mode: "latest",
    },
    trigger: {
      inputs: {
        input: { bindingId: "binding-main", output: "result" },
      },
      kind: "join",
      mode: "all",
    },
  };
  return {
    ...project,
    bindings: [
      { ...project.bindings[0]!, arguments: { feedback: null } },
      binding,
    ],
    layout: {
      ...project.layout,
      topLevelSections: {
        ...project.layout.topLevelSections,
        "handler-combine": {
          height: 190,
          width: 300,
          x: 920,
          y: 24,
          zIndex: 3,
        },
      },
    },
    sections: {
      ...project.sections,
      "handler-combine": {
        children: [],
        data: { bindingId: "binding-combine" },
        height: 190,
        id: "handler-combine",
        isHorizontalOrientation: false,
        kind: "handler",
        name: "Combine",
        overflowMode: false,
        positionAndSizeLocked: false,
        styleColor: null,
        tagColor: null,
        width: 300,
      },
    },
  };
}

describe("Realtime graph projection", () => {
  it("projects stable event, handler, output, and display topology", () => {
    const project = makeProject();

    const first = projectRealtimeGraph(project);
    const second = projectRealtimeGraph(project);

    expect(second).toEqual(first);
    expect(first.edges).toHaveLength(3);
    expect(
      first.edges.map((edge) => [
        edge.family,
        edge.source.sectionId,
        edge.target.sectionId,
      ]),
    ).toEqual([
      ["workflow", "button-main", "handler-main"],
      ["data", "handler-main", "output-main"],
      ["data", "handler-main", "status-main"],
    ]);
    expect(
      first.ports.some(
        (candidate) =>
          candidate.sectionId === "handler-main" &&
          candidate.label === "trigger" &&
          candidate.type === "target",
      ),
    ).toBe(true);
  });

  it("omits graph state for a handler removed from the live Workspace document", () => {
    const project = makeProject();
    const visible = new Set(Object.keys(project.sections));
    visible.delete("handler-main");

    const graph = projectRealtimeGraph(project, visible);

    expect(
      graph.ports.some((candidate) => candidate.sectionId === "handler-main"),
    ).toBe(false);
    expect(
      graph.edges.some(
        (candidate) =>
          candidate.source.sectionId === "handler-main" ||
          candidate.target.sectionId === "handler-main",
      ),
    ).toBe(false);
  });

  it("prunes selection before removed edges reach Workspace", () => {
    const graph = projectRealtimeGraph(makeProject());
    const selected = new Set([graph.edges[0]!.id, "removed-edge"]);

    expect([...pruneRealtimeSelectedEdgeIds(selected, graph.edges)]).toEqual([
      graph.edges[0]!.id,
    ]);
  });

  it("preserves a deleted join input as a static argument and reconnects atomically", () => {
    const project = withConsumer(makeProject());
    const graph = projectRealtimeGraph(project);
    const edge = graph.edges.find(
      (candidate) =>
        candidate.target.sectionId === "handler-combine" &&
        candidate.label === "input",
    )!;

    const deleted = deleteRealtimeGraphOperations(project, [edge.id]);

    expect(deleted).toHaveLength(1);
    const deletion = deleted[0]!;
    expect(deletion).toMatchObject({
      binding: {
        arguments: { input: null },
        id: "binding-combine",
        trigger: { kind: "disconnected" },
      },
      op: "setBinding",
    });
    if (deletion.op !== "setBinding") {
      throw new Error("Expected a binding mutation.");
    }
    const disconnected = {
      ...project,
      bindings: [project.bindings[0]!, deletion.binding],
    };
    const nextGraph = projectRealtimeGraph(disconnected);
    const joined = connectRealtimeGraphOperations(
      disconnected,
      connection(
        port(nextGraph.ports, "handler-main", "result", "source"),
        port(nextGraph.ports, "handler-combine", "input", "target"),
      ),
    );
    expect(joined).toHaveLength(1);
    expect(joined[0]).toMatchObject({
      binding: {
        arguments: { other: null },
        trigger: {
          inputs: {
            input: { bindingId: "binding-main", output: "result" },
          },
          kind: "join",
        },
      },
    });
  });

  it("reconnects a join edge as one candidate mutation", () => {
    const project = withConsumer(makeProject());
    const graph = projectRealtimeGraph(project);
    const edge = graph.edges.find(
      (candidate) =>
        candidate.target.sectionId === "handler-combine" &&
        candidate.label === "input",
    )!;
    const source = port(graph.ports, "handler-main", "result", "source");
    const target = port(graph.ports, "handler-combine", "other", "target");

    const operations = reconnectRealtimeGraphOperations(project, {
      connection: connection(source, target),
      edgeId: edge.id,
    });

    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({
      binding: {
        arguments: { input: null },
        trigger: {
          inputs: {
            other: { bindingId: "binding-main", output: "result" },
          },
          kind: "join",
        },
      },
      op: "setBinding",
    });
  });

  it("atomically disconnects joins orphaned by an event-edge edit", () => {
    const project = withConsumer(makeProject());
    const graph = projectRealtimeGraph(project);
    const triggerEdge = graph.edges.find(
      (candidate) =>
        candidate.family === "workflow" &&
        candidate.target.sectionId === "handler-main",
    )!;

    const deleted = deleteRealtimeGraphOperations(project, [triggerEdge.id]);

    expect(deleted).toHaveLength(2);
    expect(deleted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          binding: expect.objectContaining({
            id: "binding-main",
            trigger: { kind: "disconnected" },
          }),
          op: "setBinding",
        }),
        expect.objectContaining({
          binding: expect.objectContaining({
            arguments: { input: null, other: null },
            id: "binding-combine",
            trigger: { kind: "disconnected" },
          }),
          op: "setBinding",
        }),
      ]),
    );

    const drawingSource = port(
      graph.ports,
      "drawing-main",
      "snapshot",
      "source",
    );
    const triggerTarget = port(
      graph.ports,
      "handler-main",
      "trigger",
      "target",
    );
    const reconnected = reconnectRealtimeGraphOperations(project, {
      connection: connection(drawingSource, triggerTarget),
      edgeId: triggerEdge.id,
    });
    expect(reconnected).toHaveLength(2);
    expect(reconnected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          binding: expect.objectContaining({
            id: "binding-main",
            trigger: {
              event: "snapshot",
              kind: "event",
              sectionId: "drawing-main",
            },
          }),
        }),
        expect.objectContaining({
          binding: expect.objectContaining({
            id: "binding-combine",
            trigger: { kind: "disconnected" },
          }),
        }),
      ]),
    );
  });

  it("rejects occupied targets, mismatched families, and cycles", () => {
    const project = withConsumer(makeProject());
    const graph = projectRealtimeGraph(project);
    const source = port(graph.ports, "handler-combine", "image", "source");
    const cyclicTarget = port(
      graph.ports,
      "handler-main",
      "feedback",
      "target",
    );
    expect(
      canConnectRealtimeGraph(project, connection(source, cyclicTarget)),
    ).toBe(false);

    const displaySource = port(
      graph.ports,
      "handler-combine",
      "image",
      "source",
    );
    const occupiedTarget = port(graph.ports, "output-main", "value", "target");
    expect(
      canConnectRealtimeGraph(
        project,
        connection(displaySource, occupiedTarget),
      ),
    ).toBe(false);

    const eventSource = port(graph.ports, "button-main", "press", "source");
    const triggerTarget = port(
      graph.ports,
      "handler-main",
      "trigger",
      "target",
    );
    expect(
      canConnectRealtimeGraph(project, {
        ...connection(eventSource, triggerTarget),
        family: "data",
      }),
    ).toBe(false);
  });

  it("rejects a join between producers with different root events", () => {
    const project = withConsumer(makeProject());
    project.bindings.push({
      ...project.bindings[0]!,
      id: "binding-alternate",
      outputs: { alternate: {} },
      trigger: {
        event: "change",
        kind: "event",
        sectionId: "input-main",
      },
    });
    project.sections["handler-alternate"] = {
      ...project.sections["handler-main"]!,
      data: { bindingId: "binding-alternate" },
      id: "handler-alternate",
    };
    project.layout.topLevelSections["handler-alternate"] = {
      ...project.layout.topLevelSections["handler-main"]!,
      x: 1240,
    };
    const graph = projectRealtimeGraph(project);

    expect(
      canConnectRealtimeGraph(
        project,
        connection(
          port(graph.ports, "handler-alternate", "alternate", "source"),
          port(graph.ports, "handler-combine", "other", "target"),
        ),
      ),
    ).toBe(false);
  });

  it("requires reconnect to move an output that already has a display target", () => {
    const project = makeProject();
    const graph = projectRealtimeGraph(project);
    const source = port(graph.ports, "handler-main", "result", "source");
    const target = port(graph.ports, "status-main", "level", "target");
    const nextConnection = connection(source, target);

    expect(canConnectRealtimeGraph(project, nextConnection)).toBe(false);
    const edge = graph.edges.find(
      (candidate) =>
        candidate.source.portId === source.id &&
        candidate.target.sectionId === "output-main",
    )!;
    expect(
      reconnectRealtimeGraphOperations(project, {
        connection: nextConnection,
        edgeId: edge.id,
      }),
    ).toEqual([
      {
        binding: {
          ...project.bindings[0]!,
          outputs: {
            ...project.bindings[0]!.outputs,
            result: {
              target: { field: "level", sectionId: "status-main" },
            },
          },
        },
        op: "setBinding",
      },
    ]);
  });

  it("atomically prunes join consumers when an output is removed", () => {
    const project = withConsumer(makeProject());
    const producer = project.bindings[0]!;

    const operations = setRealtimeBindingOperations(project, {
      ...producer,
      outputs: { status: producer.outputs.status! },
    });

    expect(operations).toHaveLength(2);
    expect(operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          binding: expect.objectContaining({
            id: "binding-main",
            outputs: { status: producer.outputs.status },
          }),
          op: "setBinding",
        }),
        expect.objectContaining({
          binding: expect.objectContaining({
            arguments: { input: null, other: null },
            id: "binding-combine",
            trigger: { kind: "disconnected" },
          }),
          op: "setBinding",
        }),
      ]),
    );
  });

  it("makes automatic materialization manual when reconnected to a press root", () => {
    const project = makeProject();
    project.bindings[0] = {
      ...project.bindings[0]!,
      materialization: {
        retention: "lastSuccessful",
        startup: "whenStale",
      },
      trigger: {
        event: "change",
        kind: "event",
        sectionId: "input-main",
      },
    };
    const graph = projectRealtimeGraph(project);
    const triggerEdge = graph.edges.find(
      (candidate) => candidate.family === "workflow",
    )!;

    const operations = reconnectRealtimeGraphOperations(project, {
      connection: connection(
        port(graph.ports, "button-main", "press", "source"),
        port(graph.ports, "handler-main", "trigger", "target"),
      ),
      edgeId: triggerEdge.id,
    });

    expect(operations).toEqual([
      {
        binding: {
          ...project.bindings[0]!,
          materialization: {
            retention: "lastSuccessful",
            startup: "manual",
          },
          trigger: {
            event: "press",
            kind: "event",
            sectionId: "button-main",
          },
        },
        op: "setBinding",
      },
    ]);
  });
});
