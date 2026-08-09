import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  WORKSPACE_CONNECTIONS_SCHEMA_VERSION,
  createEmptyWorkspaceConnections,
  parseWorkspaceConnections,
  resolveWorkspacePortPosition,
  serializeWorkspaceConnections,
  validateWorkspaceConnections,
  type WorkspaceConnections,
  type WorkspaceDocument,
  type WorkspaceSection,
} from "../src/core.js";
import { workspaceEdgePath } from "../src/internal/workspace-connections-react.js";
import { Workspace } from "../src/react.js";
import { createWorkspaceTestDocument } from "../src/testing.js";

function connectionDocument(): WorkspaceDocument {
  const base = createWorkspaceTestDocument([
    { id: "source", title: "Source note" },
    { id: "container", title: "Review group" },
    { id: "target", title: "Target note" },
  ]);
  const source = base.sections.source as WorkspaceSection;
  const container = base.sections.container as WorkspaceSection;
  const target = base.sections.target as WorkspaceSection;
  return {
    ...base,
    rootSections: [
      { position: { x: 40, y: 60 }, sectionId: "source" },
      { position: { x: 520, y: 80 }, sectionId: "container" },
    ],
    sections: {
      container: {
        ...container,
        childLayout: {
          orientation: "vertical",
          overflow: "grow",
          positioning: "ordered",
          sectionIds: ["target"],
        },
      },
      source,
      target,
    },
  };
}

function workspaceConnections(): WorkspaceConnections {
  return {
    edges: [
      {
        directed: true,
        id: "source-to-target",
        label: "Review flow",
        source: { portId: "out", sectionId: "source" },
        target: { portId: "in", sectionId: "target" },
      },
    ],
    ports: [
      { id: "out", label: "Output", offset: 0.5, sectionId: "source", side: "right" },
      { id: "in", label: "Input", offset: 0.25, sectionId: "target", side: "left" },
      { id: "audit", label: "Audit", offset: 0.75, sectionId: "target", side: "bottom" },
    ],
    schemaVersion: WORKSPACE_CONNECTIONS_SCHEMA_VERSION,
  };
}

describe("workspace connections", () => {
  it("round-trips a strict, versioned, immutable host-owned collection", () => {
    const document = connectionDocument();
    const connections = workspaceConnections();
    const serialized = serializeWorkspaceConnections(document, connections);

    expect(JSON.parse(serialized)).toEqual(connections);
    const parsed = parseWorkspaceConnections(document, serialized);
    expect(parsed).toEqual(connections);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.edges)).toBe(true);
    expect(Object.isFrozen(parsed.ports)).toBe(true);
    expect(Object.isFrozen(parsed.edges[0]?.source)).toBe(true);
    expect(Object.isFrozen(parsed.edges[0]?.target)).toBe(true);
    expect(createEmptyWorkspaceConnections()).toEqual({
      edges: [],
      ports: [],
      schemaVersion: WORKSPACE_CONNECTIONS_SCHEMA_VERSION,
    });
  });

  it("rejects malformed collections, fields, labels, sides, offsets, and versions specifically", () => {
    const document = connectionDocument();
    const connections = workspaceConnections();
    expect(() =>
      validateWorkspaceConnections(document, { ...connections, ports: Array(1) }),
    ).toThrow("Workspace ports must be a dense array without extra fields");
    expect(() =>
      validateWorkspaceConnections(document, {
        ...connections,
        ports: [{ ...connections.ports[0], extra: true }],
      }),
    ).toThrow("Unknown workspace port field extra");
    expect(() =>
      validateWorkspaceConnections(document, {
        ...connections,
        ports: [{ ...connections.ports[0], label: " Output" }],
      }),
    ).toThrow("label must not start or end with whitespace");
    expect(() =>
      validateWorkspaceConnections(document, {
        ...connections,
        ports: [{ ...connections.ports[0], offset: 1.1 }],
      }),
    ).toThrow("offset must be a finite number from 0 through 1");
    expect(() =>
      validateWorkspaceConnections(document, {
        ...connections,
        ports: [{ ...connections.ports[0], side: "center" }],
      }),
    ).toThrow("side must be bottom, left, right, or top");
    expect(() =>
      validateWorkspaceConnections(document, { ...connections, schemaVersion: 2 }),
    ).toThrow("unsupported schema version");
    expect(() => parseWorkspaceConnections(document, "{")).toThrow(
      "Workspace connections must contain valid JSON",
    );
  });

  it("rejects duplicate or dangling section, port, and edge references", () => {
    const document = connectionDocument();
    const connections = workspaceConnections();
    const firstEdge = connections.edges[0];
    if (!firstEdge) throw new Error("The connection fixture must contain an edge.");
    expect(() =>
      validateWorkspaceConnections(document, {
        ...connections,
        ports: [connections.ports[0], { ...connections.ports[0], label: "Duplicate" }],
      }),
    ).toThrow('Workspace port "out" is duplicated in section "source"');
    expect(() =>
      validateWorkspaceConnections(document, {
        ...connections,
        ports: [{ ...connections.ports[0], sectionId: "missing" }],
      }),
    ).toThrow("references an unknown section");
    expect(() =>
      validateWorkspaceConnections(document, {
        ...connections,
        edges: [
          {
            ...firstEdge,
            target: { portId: "missing", sectionId: "target" },
          },
        ],
      }),
    ).toThrow("target references an unknown port");
    expect(() =>
      validateWorkspaceConnections(document, {
        ...connections,
        edges: [firstEdge, firstEdge],
      }),
    ).toThrow('Workspace edge id "source-to-target" is duplicated');
    expect(() =>
      validateWorkspaceConnections(document, {
        ...connections,
        edges: [
          {
            ...firstEdge,
            target: { ...firstEdge.source },
          },
        ],
      }),
    ).toThrow("source and target must be different ports");
  });

  it("rejects accessor-backed connection fields without evaluating them", () => {
    const document = connectionDocument();
    const connections = workspaceConnections();
    let labelRead = false;
    const port = Object.defineProperty({ ...connections.ports[0], label: undefined }, "label", {
      enumerable: true,
      get: () => {
        labelRead = true;
        return "Unsafe";
      },
    });

    expect(() =>
      validateWorkspaceConnections(document, { ...connections, edges: [], ports: [port] }),
    ).toThrow("Unknown workspace port field label");
    expect(labelRead).toBe(false);
  });

  it("projects every physical side and creates stable side-aware cubic routes", () => {
    const rect = { height: 80, width: 200, x: -40, y: 20 };
    expect(resolveWorkspacePortPosition(rect, { offset: 0.25, side: "top" })).toEqual({
      x: 10,
      y: 20,
    });
    expect(resolveWorkspacePortPosition(rect, { offset: 0.5, side: "right" })).toEqual({
      x: 160,
      y: 60,
    });
    expect(resolveWorkspacePortPosition(rect, { offset: 0.75, side: "bottom" })).toEqual({
      x: 110,
      y: 100,
    });
    expect(resolveWorkspacePortPosition(rect, { offset: 0, side: "left" })).toEqual({
      x: -40,
      y: 20,
    });
    expect(workspaceEdgePath({ x: 10, y: 20 }, "right", { x: 210, y: 120 }, "left", 48)).toBe(
      "M 10 20 C 110.62305898749054 20, 109.37694101250946 120, 210 120",
    );
  });

  it("adds non-interactive visual relationships and complete screen-reader descriptions", () => {
    const markup = renderToStaticMarkup(
      <Workspace
        ariaLabel="Review workspace"
        connections={workspaceConnections()}
        defaultDocument={connectionDocument()}
        sectionDefinitions={[
          {
            canContainSections: true,
            defaultSize: { height: 180, width: 240 },
            displayName: "Test section",
            kind: "test",
            render: () => null,
          },
        ]}
      />,
    );

    expect(markup).toContain('aria-label="Review workspace connections"');
    expect(markup).toContain("3 ports and 1 edge.");
    expect(markup).toContain("Source note, Output, right side.");
    expect(markup).toContain("Review flow: Source note, Output to Target note, Input. Directed.");
  });
});
