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
  projectRealtimeGraph,
  reconnectRealtimeGraphOperations,
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
      first.edges.map((edge) => [edge.family, edge.source.sectionId, edge.target.sectionId]),
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
    const occupiedTarget = port(
      graph.ports,
      "output-main",
      "value",
      "target",
    );
    expect(
      canConnectRealtimeGraph(
        project,
        connection(displaySource, occupiedTarget),
      ),
    ).toBe(false);

    const eventSource = port(
      graph.ports,
      "button-main",
      "press",
      "source",
    );
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
});
