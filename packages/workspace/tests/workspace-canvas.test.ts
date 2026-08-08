import { describe, expect, it } from "vitest";

import type { WorkspaceDocument, WorkspaceSection } from "../src/core.js";
import { projectWorkspaceCanvasRoots } from "../src/internal/workspace-canvas-model.js";
import { WorkspaceViewportLifecycle } from "../src/internal/workspace-viewport-lifecycle.js";
import { createWorkspaceTestDocument } from "../src/testing.js";

function recursiveDocument(): WorkspaceDocument {
  const flat = createWorkspaceTestDocument([
    { id: "root", title: "Root" },
    { id: "nested", title: "Nested" },
    { id: "peer", title: "Peer" },
  ]);
  const root = flat.sections.root as WorkspaceSection;
  return {
    ...flat,
    rootSections: [
      flat.rootSections[0] as (typeof flat.rootSections)[number],
      flat.rootSections[2] as (typeof flat.rootSections)[number],
    ],
    sections: {
      ...flat.sections,
      root: {
        ...root,
        childLayout: {
          orientation: "vertical",
          overflow: "grow",
          sectionIds: ["nested"],
        },
      },
    },
  };
}

describe("workspace canvas root projection", () => {
  it("projects only canonical spatial roots without exposing upstream nodes", () => {
    const document = recursiveDocument();

    expect(projectWorkspaceCanvasRoots(document)).toEqual([
      {
        kind: "test",
        position: { x: 0, y: 0 },
        sectionId: "root",
        size: { height: 180, width: 240 },
        title: "Root",
      },
      {
        kind: "test",
        position: { x: 560, y: 0 },
        sectionId: "peer",
        size: { height: 180, width: 240 },
        title: "Peer",
      },
    ]);
    expect(document.sections.nested?.title).toBe("Nested");
  });
});

describe("workspace viewport lifecycle", () => {
  it("coalesces high-frequency movement into one completed viewport", () => {
    const lifecycle = new WorkspaceViewportLifecycle({ x: 0, y: 0, zoom: 1 });

    lifecycle.begin({ x: 0, y: 0, zoom: 1 });
    lifecycle.update({ x: 10, y: -4, zoom: 1 });
    lifecycle.update({ x: 24, y: -12, zoom: 1.25 });

    expect(lifecycle.complete()).toEqual({ x: 24, y: -12, zoom: 1.25 });
    expect(lifecycle.complete()).toBeNull();
    expect(lifecycle.current()).toEqual({ x: 24, y: -12, zoom: 1.25 });
  });

  it("retains the accepted baseline when a wheel start includes its first delta", () => {
    const lifecycle = new WorkspaceViewportLifecycle({ x: 0, y: 0, zoom: 1 });

    lifecycle.begin({ x: 0, y: -90, zoom: 1 });

    expect(lifecycle.complete()).toEqual({ x: 0, y: -90, zoom: 1 });
  });

  it("suppresses no-op completion and restores cancellation", () => {
    const lifecycle = new WorkspaceViewportLifecycle({ x: 5, y: 10, zoom: 1 });

    lifecycle.begin({ x: 5, y: 10, zoom: 1 });
    expect(lifecycle.complete({ x: 5, y: 10, zoom: 1 })).toBeNull();

    lifecycle.begin({ x: 5, y: 10, zoom: 1 });
    lifecycle.update({ x: 50, y: 100, zoom: 2 });
    expect(lifecycle.cancel()).toEqual({ x: 5, y: 10, zoom: 1 });
    expect(lifecycle.current()).toEqual({ x: 5, y: 10, zoom: 1 });
  });

  it("accepts canonical synchronization only while idle", () => {
    const lifecycle = new WorkspaceViewportLifecycle({ x: 0, y: 0, zoom: 1 });

    expect(lifecycle.synchronize({ x: 20, y: 30, zoom: 1.5 })).toBe(true);
    lifecycle.begin({ x: 20, y: 30, zoom: 1.5 });
    expect(lifecycle.synchronize({ x: 0, y: 0, zoom: 1 })).toBe(false);
    expect(lifecycle.current()).toEqual({ x: 20, y: 30, zoom: 1.5 });
  });

  it("rejects invalid and overlapping viewport sessions", () => {
    expect(() => new WorkspaceViewportLifecycle({ x: 0, y: 0, zoom: 0 })).toThrow("positive zoom");
    const lifecycle = new WorkspaceViewportLifecycle({ x: 0, y: 0, zoom: 1 });
    lifecycle.begin({ x: 0, y: 0, zoom: 1 });
    expect(() => lifecycle.begin({ x: 0, y: 0, zoom: 1 })).toThrow("already active");
  });
});
