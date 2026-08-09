import { describe, expect, it } from "vitest";

import {
  WORKSPACE_DEFAULT_CAPABILITIES,
  packWorkspaceRectangles,
  planWorkspaceRootAutoLayout,
  type WorkspaceDocument,
  type WorkspaceSection,
} from "../src/core.js";
import type { WorkspaceCanvasController } from "../src/internal/workspace-canvas-navigation.js";
import { createWorkspaceController } from "../src/internal/workspace-controller.js";
import { createWorkspaceTestDocument } from "../src/testing.js";

const measuredSizes = {
  alpha: { height: 100, width: 100 },
  beta: { height: 200, width: 50 },
  gamma: { height: 120, width: 80 },
} as const;

function autoLayoutDocument(): WorkspaceDocument {
  const document = createWorkspaceTestDocument([
    { id: "alpha", title: "Alpha" },
    { id: "beta", title: "Beta" },
    { id: "gamma", title: "Gamma" },
  ]);
  return {
    ...document,
    rootSections: [
      { position: { x: -50, y: 20 }, sectionId: "alpha" },
      { position: { x: 400, y: 90 }, sectionId: "beta" },
      { position: { x: 200, y: -30 }, sectionId: "gamma" },
    ],
    viewport: { x: 35, y: -18, zoom: 1.25 },
  };
}

function rects(document: WorkspaceDocument) {
  return document.rootSections.map((root) => ({
    ...measuredSizes[root.sectionId as keyof typeof measuredSizes],
    ...root.position,
    sectionId: root.sectionId,
  }));
}

function overlaps(
  left: Readonly<{ height: number; width: number; x: number; y: number }>,
  right: Readonly<{ height: number; width: number; x: number; y: number }>,
  gap: number,
): boolean {
  return (
    left.x < right.x + right.width + gap &&
    left.x + left.width + gap > right.x &&
    left.y < right.y + right.height + gap &&
    left.y + left.height + gap > right.y
  );
}

describe("workspace root auto layout", () => {
  it("packs larger rectangles first into deterministic near-square shelves", () => {
    const rectangles = [
      { height: 100, sectionId: "alpha", width: 100 },
      { height: 200, sectionId: "beta", width: 50 },
      { height: 120, sectionId: "gamma", width: 80 },
    ] as const;

    const packed = packWorkspaceRectangles({
      gap: 20,
      origin: { x: -50, y: -30 },
      rectangles,
    });

    expect(packed).toEqual([
      { height: 200, sectionId: "beta", width: 50, x: -50, y: -30 },
      { height: 120, sectionId: "gamma", width: 80, x: 20, y: -30 },
      { height: 100, sectionId: "alpha", width: 100, x: -50, y: 190 },
    ]);
    expect(rectangles).toEqual([
      { height: 100, sectionId: "alpha", width: 100 },
      { height: 200, sectionId: "beta", width: 50 },
      { height: 120, sectionId: "gamma", width: 80 },
    ]);
    expect(
      packed.some((rectangle, index) =>
        packed.slice(index + 1).some((candidate) => overlaps(rectangle, candidate, 20)),
      ),
    ).toBe(false);
    expect(
      packWorkspaceRectangles({
        rectangles: [
          { height: 10, sectionId: "first", width: 10 },
          { height: 10, sectionId: "second", width: 10 },
        ],
      }),
    ).toEqual([
      { height: 10, sectionId: "first", width: 10, x: 0, y: 0 },
      { height: 10, sectionId: "second", width: 10, x: 0, y: 58 },
    ]);
  });

  it("preserves the minimum workspace anchor and produces an idempotent root plan", () => {
    const document = autoLayoutDocument();
    const first = planWorkspaceRootAutoLayout({ gap: 20, rootRects: rects(document) });

    expect(first.positions).toEqual({
      alpha: { x: -50, y: 190 },
      beta: { x: -50, y: -30 },
      gamma: { x: 20, y: -30 },
    });
    const laidOut: WorkspaceDocument = {
      ...document,
      rootSections: document.rootSections.map((root) => ({
        ...root,
        position: first.positions[root.sectionId] as { x: number; y: number },
      })),
    };
    expect(planWorkspaceRootAutoLayout({ gap: 20, rootRects: rects(laidOut) })).toEqual(first);
    expect(Math.min(...Object.values(first.positions).map(({ x }) => x))).toBe(-50);
    expect(Math.min(...Object.values(first.positions).map(({ y }) => y))).toBe(-30);
  });

  it("uses canonical input order for equal rectangles and preserves prototype-like IDs", () => {
    const packed = packWorkspaceRectangles({
      gap: 0,
      rectangles: [
        { height: 40, sectionId: "constructor", width: 40 },
        { height: 40, sectionId: "__proto__", width: 40 },
      ],
    });
    expect(packed.map(({ sectionId }) => sectionId)).toEqual(["constructor", "__proto__"]);

    const plan = planWorkspaceRootAutoLayout({
      rootRects: packed.map((rectangle) => ({ ...rectangle, x: rectangle.x, y: rectangle.y })),
    });
    expect(Object.hasOwn(plan.positions, "constructor")).toBe(true);
    expect(Object.hasOwn(plan.positions, "__proto__")).toBe(true);
  });

  it("rejects malformed, duplicate, sparse, accessor-backed, and overflowing input", () => {
    expect(() => packWorkspaceRectangles({ gap: -1, rectangles: [] })).toThrow(
      "Workspace rectangle packing gap must be non-negative",
    );
    expect(() =>
      packWorkspaceRectangles({
        rectangles: [{ height: 0, sectionId: "zero", width: 10 }],
      }),
    ).toThrow("Workspace packing rectangle at index 0 height must be positive");
    expect(() =>
      packWorkspaceRectangles({
        rectangles: [
          { height: 10, sectionId: "same", width: 10 },
          { height: 20, sectionId: "same", width: 20 },
        ],
      }),
    ).toThrow('Workspace rectangle packing section ID "same" is duplicated');

    const sparse = [{ height: 10, sectionId: "first", width: 10 }];
    sparse.length = 2;
    expect(() => packWorkspaceRectangles({ rectangles: sparse })).toThrow(
      "Workspace packing rectangles must be a dense array without extra fields",
    );

    let widthRead = false;
    const accessorRectangle = Object.defineProperty(
      { height: 10, sectionId: "accessor" },
      "width",
      {
        enumerable: true,
        get: () => {
          widthRead = true;
          return 10;
        },
      },
    );
    expect(() =>
      packWorkspaceRectangles({
        rectangles: [accessorRectangle as { height: number; sectionId: string; width: number }],
      }),
    ).toThrow("Unknown workspace packing rectangle field width");
    expect(widthRead).toBe(false);

    expect(() =>
      packWorkspaceRectangles({
        gap: Number.MAX_VALUE,
        rectangles: [{ height: 1, sectionId: "huge", width: Number.MAX_VALUE }],
      }),
    ).toThrow("Workspace rectangle packing dimensions exceed the finite number range");
  });

  it("commits one atomic root movement without changing stack, sections, selection, or viewport", () => {
    let document = autoLayoutDocument();
    const initialSections = document.sections;
    const changes: string[] = [];
    const canvasController = {
      getSectionRect: (sectionId: string) => {
        const root = document.rootSections.find((candidate) => candidate.sectionId === sectionId);
        const size = measuredSizes[sectionId as keyof typeof measuredSizes];
        return root && size ? { ...root.position, ...size } : undefined;
      },
    } as unknown as WorkspaceCanvasController;
    const controller = createWorkspaceController({
      commit: (nextDocument, change) => {
        document = nextDocument;
        changes.push(change.reason);
      },
      getCapabilities: () => WORKSPACE_DEFAULT_CAPABILITIES,
      getCanvasController: () => canvasController,
      getDocument: () => document,
    });
    controller.selectSections(["gamma"]);

    expect(controller.autoLayoutRootSections({ gap: 20 })).toEqual({ status: "applied" });
    expect(document.rootSections).toEqual([
      { position: { x: -50, y: 190 }, sectionId: "alpha" },
      { position: { x: -50, y: -30 }, sectionId: "beta" },
      { position: { x: 20, y: -30 }, sectionId: "gamma" },
    ]);
    expect(document.sections).toBe(initialSections);
    expect(document.viewport).toEqual({ x: 35, y: -18, zoom: 1.25 });
    expect(controller.getSelectedSectionIds()).toEqual(["gamma"]);
    expect(changes).toEqual(["section-move"]);
    expect(controller.autoLayoutRootSections({ gap: 20 })).toEqual({ status: "unchanged" });
    expect(changes).toEqual(["section-move"]);
  });

  it("gates the command before measurement and rejects locks or unavailable geometry atomically", () => {
    const document = autoLayoutDocument();
    const controller = createWorkspaceController({
      commit: () => {
        throw new Error("Rejected auto layout must not commit.");
      },
      getCapabilities: () => ({ ...WORKSPACE_DEFAULT_CAPABILITIES, editLayout: false }),
      getCanvasController: () => {
        throw new Error("Disabled auto layout must not read canvas geometry.");
      },
      getDocument: () => document,
    });
    expect(controller.autoLayoutRootSections()).toEqual({
      reason: "layout-edit-disabled",
      status: "rejected",
    });

    const alpha = document.sections.alpha as WorkspaceSection;
    const lockedDocument: WorkspaceDocument = {
      ...document,
      sections: {
        ...document.sections,
        alpha: { ...alpha, positionAndSizeLocked: true },
      },
    };
    const lockedController = createWorkspaceController({
      commit: () => {
        throw new Error("Locked auto layout must not commit.");
      },
      getCapabilities: () => WORKSPACE_DEFAULT_CAPABILITIES,
      getDocument: () => lockedDocument,
    });
    expect(lockedController.autoLayoutRootSections()).toEqual({
      reason: "section-locked",
      status: "rejected",
    });

    const unavailableController = createWorkspaceController({
      commit: () => {
        throw new Error("Unavailable auto layout must not commit.");
      },
      getCapabilities: () => WORKSPACE_DEFAULT_CAPABILITIES,
      getDocument: () => document,
    });
    expect(unavailableController.autoLayoutRootSections()).toEqual({
      reason: "canvas-unavailable",
      status: "rejected",
    });

    const missingGeometryController = createWorkspaceController({
      commit: () => {
        throw new Error("Incomplete auto layout must not commit.");
      },
      getCapabilities: () => WORKSPACE_DEFAULT_CAPABILITIES,
      getCanvasController: () =>
        ({ getSectionRect: () => undefined }) as unknown as WorkspaceCanvasController,
      getDocument: () => document,
    });
    expect(missingGeometryController.autoLayoutRootSections()).toEqual({
      reason: "section-geometry-unavailable",
      status: "rejected",
    });
  });

  it("validates controller options and leaves zero- or one-root workspaces unchanged", () => {
    const document = autoLayoutDocument();
    const controller = createWorkspaceController({
      commit: () => undefined,
      getCapabilities: () => WORKSPACE_DEFAULT_CAPABILITIES,
      getDocument: () => document,
    });
    expect(() => controller.autoLayoutRootSections({ gap: Number.NaN })).toThrow(
      "Workspace root auto-layout gap must be a finite non-negative number",
    );
    expect(() =>
      controller.autoLayoutRootSections({ extra: true } as unknown as { gap: number }),
    ).toThrow("Unknown workspace root auto-layout option extra");

    const oneRoot = {
      ...document,
      rootSections: document.rootSections.slice(0, 1),
      sections: { alpha: document.sections.alpha as WorkspaceSection },
    };
    const oneRootController = createWorkspaceController({
      commit: () => {
        throw new Error("One-root auto layout must not commit.");
      },
      getCapabilities: () => WORKSPACE_DEFAULT_CAPABILITIES,
      getDocument: () => oneRoot,
    });
    expect(oneRootController.autoLayoutRootSections()).toEqual({ status: "unchanged" });
  });
});
