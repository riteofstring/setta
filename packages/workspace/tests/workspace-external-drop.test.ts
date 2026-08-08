import { describe, expect, it } from "vitest";

import type { WorkspaceDocument, WorkspaceSection } from "../src/core.js";
import { WorkspaceGeometryIndex } from "../src/internal/geometry-index.js";
import {
  resolveWorkspaceExternalDropCandidate,
  resolveWorkspaceExternalDropDecision,
  workspaceExternalDropDefaultLabel,
} from "../src/internal/workspace-external-drop-planning.js";
import { resolveSectionDefinitions } from "../src/internal/workspace-section-registry.js";
import { createWorkspaceTestDocument } from "../src/testing.js";

const registry = resolveSectionDefinitions([
  {
    canContainSections: true,
    defaultSize: { height: 180, width: 240 },
    displayName: "Container or note",
    kind: "test",
    render: () => null,
  },
]);

function externalDropDocument(): WorkspaceDocument {
  const flat = createWorkspaceTestDocument([
    { id: "root", title: "Root container" },
    { id: "first", title: "First child" },
    { id: "nested", title: "Nested container" },
    { id: "last", title: "Last child" },
    { id: "nested-first", title: "Nested first" },
    { id: "nested-last", title: "Nested last" },
  ]);
  const section = (sectionId: string) => flat.sections[sectionId] as WorkspaceSection;
  return {
    ...flat,
    rootSections: [flat.rootSections[0] as (typeof flat.rootSections)[number]],
    sections: {
      ...flat.sections,
      nested: {
        ...section("nested"),
        childLayout: {
          orientation: "horizontal",
          overflow: "grow",
          sectionIds: ["nested-first", "nested-last"],
        },
      },
      root: {
        ...section("root"),
        childLayout: {
          orientation: "vertical",
          overflow: "grow",
          sectionIds: ["first", "nested", "last"],
        },
      },
    },
  };
}

function externalDropGeometry(): WorkspaceGeometryIndex {
  const index = new WorkspaceGeometryIndex();
  for (const frame of [
    {
      depth: 0,
      order: 0,
      parentSectionId: null,
      rect: { height: 420, width: 420, x: 0, y: 0 },
      sectionId: "root",
    },
    {
      depth: 1,
      order: 0,
      parentSectionId: "root",
      rect: { height: 60, width: 360, x: 30, y: 40 },
      sectionId: "first",
    },
    {
      depth: 1,
      order: 1,
      parentSectionId: "root",
      rect: { height: 180, width: 360, x: 30, y: 140 },
      sectionId: "nested",
    },
    {
      depth: 1,
      order: 2,
      parentSectionId: "root",
      rect: { height: 60, width: 360, x: 30, y: 340 },
      sectionId: "last",
    },
    {
      depth: 2,
      order: 0,
      parentSectionId: "nested",
      rect: { height: 120, width: 120, x: 50, y: 170 },
      sectionId: "nested-first",
    },
    {
      depth: 2,
      order: 1,
      parentSectionId: "nested",
      rect: { height: 120, width: 120, x: 250, y: 170 },
      sectionId: "nested-last",
    },
  ]) {
    index.register(frame);
  }
  return index;
}

describe("workspace external-drop planning", () => {
  it("chooses the deepest container and an orientation-aware insertion index", () => {
    const document = externalDropDocument();
    const index = externalDropGeometry();

    expect(
      resolveWorkspaceExternalDropCandidate(document, index, registry, { x: 210, y: 220 }),
    ).toEqual({ insertionIndex: 1, parentSectionId: "nested" });
    expect(
      resolveWorkspaceExternalDropCandidate(document, index, registry, { x: 210, y: 120 }),
    ).toEqual({ insertionIndex: 1, parentSectionId: "root" });
  });

  it("falls back to a spatial root drop outside every measured container", () => {
    const document = externalDropDocument();
    const candidate = resolveWorkspaceExternalDropCandidate(
      document,
      externalDropGeometry(),
      registry,
      { x: 600, y: 600 },
    );

    expect(candidate).toEqual({ insertionIndex: 1, parentSectionId: null });
    expect(workspaceExternalDropDefaultLabel(document, candidate)).toBe("Drop on canvas");
    expect(
      workspaceExternalDropDefaultLabel(document, {
        insertionIndex: 1,
        parentSectionId: "root",
      }),
    ).toBe("Drop into Root container");
  });

  it("normalizes strict valid and invalid host decisions", () => {
    expect(
      resolveWorkspaceExternalDropDecision({ allowed: true, label: "  Import note  " }),
    ).toEqual({ allowed: true, label: "Import note" });
    expect(
      resolveWorkspaceExternalDropDecision({ allowed: false, reason: "  Unsupported type  " }),
    ).toEqual({ allowed: false, reason: "Unsupported type" });
  });

  it("rejects contradictory, blank, extra, and accessor-backed decisions", () => {
    expect(() =>
      resolveWorkspaceExternalDropDecision({
        allowed: true,
        reason: "Contradictory",
      } as unknown as { allowed: true }),
    ).toThrow("cannot provide a reason");
    expect(() => resolveWorkspaceExternalDropDecision({ allowed: false, reason: "  " })).toThrow(
      "reason must be a non-empty string",
    );
    expect(() =>
      resolveWorkspaceExternalDropDecision({
        allowed: true,
        source: "host",
      } as unknown as { allowed: true }),
    ).toThrow("external-drop decision field source");

    const accessor = {} as Record<string, unknown>;
    Object.defineProperty(accessor, "allowed", {
      enumerable: true,
      get: () => {
        throw new Error("The decision getter must not run.");
      },
    });
    expect(() =>
      resolveWorkspaceExternalDropDecision(accessor as unknown as { allowed: true }),
    ).toThrow("external-drop decision field allowed");
  });
});
