import { describe, expect, it } from "vitest";

import type { WorkspaceDocument, WorkspaceSection } from "../src/core.js";
import { WorkspaceGeometryIndex } from "../src/internal/geometry-index.js";
import { projectWorkspaceCanvasRoots } from "../src/internal/workspace-canvas-model.js";
import {
  projectNodes,
  setActiveRoots,
  setResizingRoot,
  synchronizeNodes,
} from "../src/internal/workspace-canvas-root-node.js";
import { WorkspaceGeometryMeasurements } from "../src/internal/workspace-geometry-service.js";
import { resolveSectionDefinitions } from "../src/internal/workspace-section-registry.js";
import {
  projectWorkspaceSectionChildren,
  synchronizeWorkspaceSectionTrees,
} from "../src/internal/workspace-section-tree.js";
import { WorkspaceViewportCulling } from "../src/internal/workspace-viewport-culling.js";
import { WorkspaceViewportLifecycle } from "../src/internal/workspace-viewport-lifecycle.js";
import { createWorkspaceTestDocument } from "../src/testing.js";

const unchanged = () => ({ status: "unchanged" }) as const;
const doNothing = () => undefined;
const validTitle = () => null;
const colorPalette = [] as const;
const resizeBindings = {
  onContentSizeRequest: doNothing,
  onKeyboardResize: doNothing,
  onPointerResize: doNothing,
  onPointerResizeEnd: doNothing,
};
const sectionRegistry = resolveSectionDefinitions([
  {
    defaultSize: { height: 180, width: 240 },
    displayName: "Test section",
    kind: "test",
    render: () => null,
  },
]);
const recursiveSectionRegistry = resolveSectionDefinitions([
  {
    canContainSections: true,
    defaultSize: { height: 180, width: 240 },
    displayName: "Test section",
    kind: "test",
    render: () => null,
  },
]);
const geometry = new WorkspaceGeometryMeasurements(new WorkspaceGeometryIndex());
const viewportCulling = new WorkspaceViewportCulling();

function largeDocument(): WorkspaceDocument {
  return createWorkspaceTestDocument(
    Array.from({ length: 128 }, (_, index) => ({
      id: `section-${String(index)}`,
      title: `Section ${String(index)}`,
    })),
  );
}

function projectedNodes(document: WorkspaceDocument, selectedSectionIds: readonly string[] = []) {
  return projectNodes(
    document,
    geometry,
    sectionRegistry,
    colorPalette,
    "light",
    false,
    true,
    true,
    doNothing,
    unchanged,
    unchanged,
    unchanged,
    unchanged,
    unchanged,
    doNothing,
    unchanged,
    validTitle,
    viewportCulling,
    resizeBindings,
    {
      movementBlocked: false,
      selectedSectionIds: new Set(selectedSectionIds),
      structuralMovementBlocked: false,
    },
  );
}

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
        order: 0,
        position: { x: 0, y: 0 },
        sectionId: "root",
        size: { height: 180, width: 240 },
        title: "Root",
      },
      {
        kind: "test",
        order: 1,
        position: { x: 560, y: 0 },
        sectionId: "peer",
        size: { height: 180, width: 240 },
        title: "Peer",
      },
    ]);
    expect(document.sections.nested?.title).toBe("Nested");
  });

  it("leaves intrinsic root axes to one upstream measurement pass", () => {
    const document = createWorkspaceTestDocument([{ id: "content", title: "Content" }]);
    const section = document.sections.content as WorkspaceSection;
    const contentDocument = {
      ...document,
      sections: {
        ...document.sections,
        content: {
          ...section,
          size: {
            height: { mode: "content", value: 240 },
            width: { mode: "content", value: 320 },
          },
        },
      },
    } satisfies WorkspaceDocument;
    const projected = projectedNodes(contentDocument);
    const node = projected[0];
    if (!node) {
      throw new Error("Content projection did not create its root node.");
    }

    expect(node?.height).toBeUndefined();
    expect(node?.initialHeight).toBeUndefined();
    expect(node?.width).toBeUndefined();
    expect(node?.initialWidth).toBeUndefined();
    expect(node?.style).toMatchObject({ height: "max-content", width: "max-content" });

    const synchronized = synchronizeNodes(
      [{ ...node, initialHeight: 240, initialWidth: 320 }],
      projected,
    );
    expect(synchronized[0]?.initialHeight).toBeUndefined();
    expect(synchronized[0]?.initialWidth).toBeUndefined();
  });

  it("retains unaffected frame identities across large-section-set updates", () => {
    const document = largeDocument();
    const initial = projectedNodes(document);
    const changedSection = document.sections["section-64"] as WorkspaceSection;
    const renamed = projectedNodes({
      ...document,
      sections: {
        ...document.sections,
        "section-64": { ...changedSection, title: "Renamed section" },
      },
    });
    const synchronizedRename = synchronizeNodes(initial, renamed);

    expect(synchronizedRename.filter((node, index) => node !== initial[index])).toHaveLength(1);
    expect(synchronizedRename[64]?.data.title).toBe("Renamed section");

    const selected = synchronizeNodes(initial, projectedNodes(document, ["section-64"]));
    expect(selected.filter((node, index) => node !== initial[index])).toHaveLength(1);
    expect(selected[64]?.data.selected).toBe(true);

    const viewportOnly = synchronizeNodes(
      initial,
      projectedNodes({ ...document, viewport: { x: 120, y: -48, zoom: 1.25 } }),
    );
    expect(viewportOnly.every((node, index) => node === initial[index])).toBe(true);

    const moving = setActiveRoots(initial, new Set(["section-64"]));
    const resizing = setResizingRoot(initial, "section-64");
    expect(moving.filter((node, index) => node !== initial[index])).toHaveLength(1);
    expect(resizing.filter((node, index) => node !== initial[index])).toHaveLength(1);
  });

  it("projects recursive DOM descendants and retains unchanged subtree identities", () => {
    const document = recursiveDocument();
    const initial = projectWorkspaceSectionChildren(
      document,
      recursiveSectionRegistry,
      "root",
      new Set(["nested"]),
      true,
    );

    expect(
      initial.map(({ section, selected, selectionMovementBlocked }) => [
        section.id,
        selected,
        selectionMovementBlocked,
      ]),
    ).toEqual([["nested", true, true]]);
    const nested = document.sections.nested as WorkspaceSection;
    const projected = projectWorkspaceSectionChildren(
      {
        ...document,
        sections: {
          ...document.sections,
          nested: { ...nested, title: "Renamed nested section" },
        },
      },
      recursiveSectionRegistry,
      "root",
      new Set(["nested"]),
      true,
    );
    const synchronized = synchronizeWorkspaceSectionTrees(initial, projected);

    expect(synchronized).not.toBe(initial);
    expect(synchronized[0]?.section.title).toBe("Renamed nested section");
    expect(synchronizeWorkspaceSectionTrees(synchronized, projected)).toBe(synchronized);
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
