import { describe, expect, it } from "vitest";

import {
  WorkspaceGeometryIndex,
  clientPointToWorkspace,
  clientRectToWorkspace,
  resolveGeometryDropTarget,
  workspacePointToClient,
  workspaceRectToClient,
} from "../src/internal/geometry-index.js";

describe("WorkspaceGeometryIndex", () => {
  it("registers every depth and ignores cleanup from a superseded registration", () => {
    const index = new WorkspaceGeometryIndex();
    const oldRoot = index.register({
      sectionId: "root",
      parentSectionId: null,
      depth: 0,
      order: 0,
      rect: { x: 10, y: 20, width: 300, height: 200 },
    });
    const nested = index.register({
      sectionId: "nested",
      parentSectionId: "root",
      depth: 1,
      order: 0,
      rect: { x: 30, y: 70, width: 240, height: 80 },
    });
    const currentRoot = index.register({
      sectionId: "root",
      parentSectionId: null,
      depth: 0,
      order: 0,
      rect: { x: 12, y: 24, width: 300, height: 200 },
    });

    oldRoot.dispose();

    expect(index.size).toBe(2);
    expect(index.require("root").rect).toEqual({ x: 12, y: 24, width: 300, height: 200 });
    expect(index.directChildren("root").map((frame) => frame.sectionId)).toEqual(["nested"]);

    nested.dispose();
    currentRoot.dispose();
    expect(index.snapshot()).toEqual([]);
  });

  it("updates parent membership and rejects updates after disposal", () => {
    const index = new WorkspaceGeometryIndex();
    const revisions: number[] = [];
    const unsubscribe = index.subscribe(() => revisions.push(index.revision));
    const registration = index.register({
      sectionId: "child",
      parentSectionId: "first-parent",
      depth: 1,
      order: 0,
      rect: { x: 0, y: 0, width: 50, height: 40 },
    });

    registration.update({
      sectionId: "child",
      parentSectionId: "second-parent",
      depth: 2,
      order: 1,
      rect: { x: 5, y: 6, width: 50, height: 40 },
    });

    expect(index.directChildren("first-parent")).toEqual([]);
    expect(index.directChildren("second-parent").map((frame) => frame.sectionId)).toEqual([
      "child",
    ]);

    registration.dispose();
    unsubscribe();
    expect(revisions).toEqual([1, 2, 3]);
    expect(() =>
      registration.update({
        sectionId: "child",
        parentSectionId: null,
        depth: 0,
        order: 0,
        rect: { x: 0, y: 0, width: 1, height: 1 },
      }),
    ).toThrow("is no longer active");
  });

  it("resolves deepest hit targets and combined bounds deterministically", () => {
    const index = new WorkspaceGeometryIndex();
    index.register({
      sectionId: "root",
      parentSectionId: null,
      depth: 0,
      order: 0,
      rect: { x: 10, y: 10, width: 300, height: 300 },
    });
    index.register({
      sectionId: "later-child",
      parentSectionId: "root",
      depth: 1,
      order: 1,
      rect: { x: 40, y: 40, width: 120, height: 120 },
    });
    index.register({
      sectionId: "first-child",
      parentSectionId: "root",
      depth: 1,
      order: 0,
      rect: { x: 30, y: 30, width: 80, height: 80 },
    });

    expect(index.framesAt({ x: 50, y: 50 }).map((frame) => frame.sectionId)).toEqual([
      "first-child",
      "later-child",
      "root",
    ]);
    expect(index.bounds(["first-child", "later-child"])).toEqual({
      x: 30,
      y: 30,
      width: 130,
      height: 130,
    });
  });

  it("selects measured frames with partial and full marquee semantics at every depth", () => {
    const index = new WorkspaceGeometryIndex();
    for (const frame of [
      {
        sectionId: "root",
        parentSectionId: null,
        depth: 0,
        order: 0,
        rect: { x: 0, y: 0, width: 300, height: 240 },
      },
      {
        sectionId: "child",
        parentSectionId: "root",
        depth: 1,
        order: 0,
        rect: { x: 30, y: 40, width: 220, height: 150 },
      },
      {
        sectionId: "grandchild",
        parentSectionId: "child",
        depth: 2,
        order: 0,
        rect: { x: 70, y: 80, width: 60, height: 50 },
      },
      {
        sectionId: "unmeasured-placeholder",
        parentSectionId: "root",
        depth: 1,
        order: 1,
        rect: { x: 90, y: 90, width: 0, height: 40 },
      },
    ] as const) {
      index.register(frame);
    }

    expect(
      index.framesInRect({ x: 65, y: 75, width: 70, height: 60 }, "full").map(frameId),
    ).toEqual(["grandchild"]);
    expect(
      index.framesInRect({ x: 120, y: 120, width: 30, height: 30 }, "partial").map(frameId),
    ).toEqual(["root", "child", "grandchild"]);
    expect(index.framesInRect({ x: 70, y: 80, width: 0, height: 50 }, "partial")).toEqual([]);
  });

  it("normalizes measured selection roots and waits for complete fit geometry", () => {
    const index = new WorkspaceGeometryIndex();
    index.register({
      sectionId: "root",
      parentSectionId: null,
      depth: 0,
      order: 0,
      rect: { x: 10, y: 20, width: 300, height: 220 },
    });
    index.register({
      sectionId: "child",
      parentSectionId: "root",
      depth: 1,
      order: 0,
      rect: { x: 40, y: 60, width: 100, height: 80 },
    });
    index.register({
      sectionId: "other-root",
      parentSectionId: null,
      depth: 0,
      order: 1,
      rect: { x: 400, y: 100, width: 120, height: 100 },
    });

    expect(index.selectionRoots(["child", "root", "other-root", "child"])).toEqual([
      "root",
      "other-root",
    ]);
    expect(index.boundsWhenReady(["child", "other-root"])).toEqual({
      x: 40,
      y: 60,
      width: 480,
      height: 140,
    });
    expect(index.boundsWhenReady(["child", "missing"])).toBeNull();
    expect(index.boundsWhenReady([])).toBeNull();
  });

  it("fails specifically when measured parent geometry contains a cycle", () => {
    const index = new WorkspaceGeometryIndex();
    index.register({
      sectionId: "first",
      parentSectionId: "second",
      depth: 1,
      order: 0,
      rect: { x: 0, y: 0, width: 10, height: 10 },
    });
    index.register({
      sectionId: "second",
      parentSectionId: "first",
      depth: 1,
      order: 0,
      rect: { x: 20, y: 0, width: 10, height: 10 },
    });

    expect(() => index.selectionRoots(["first"])).toThrow(
      "Measured geometry contains a parent cycle at first.",
    );
  });
});

function frameId(frame: { sectionId: string }): string {
  return frame.sectionId;
}

describe("client/workbench coordinate conversion", () => {
  it("round trips points and rectangles through an offset scaled viewport", () => {
    const viewportBounds = { x: 80, y: 120, width: 900, height: 600 };
    const transform = { x: -40, y: 30, zoom: 1.75 };
    const point = { x: 132.5, y: 237.25 };
    const rect = { x: 115, y: 185, width: 210, height: 105 };

    expect(
      workspacePointToClient(
        clientPointToWorkspace(point, viewportBounds, transform),
        viewportBounds,
        transform,
      ),
    ).toEqual(point);
    expect(
      workspaceRectToClient(
        clientRectToWorkspace(rect, viewportBounds, transform),
        viewportBounds,
        transform,
      ),
    ).toEqual(rect);
  });

  it("uses post-scroll client geometry without a second scroll-offset correction", () => {
    const viewportBounds = { x: 100, y: 100, width: 800, height: 500 };
    const transform = { x: 0, y: 0, zoom: 2 };
    const beforeScroll = clientRectToWorkspace(
      { x: 180, y: 260, width: 200, height: 80 },
      viewportBounds,
      transform,
    );
    const afterScroll = clientRectToWorkspace(
      { x: 180, y: 220, width: 200, height: 80 },
      viewportBounds,
      transform,
    );

    expect(beforeScroll).toEqual({ x: 40, y: 80, width: 100, height: 40 });
    expect(afterScroll).toEqual({ x: 40, y: 60, width: 100, height: 40 });
  });

  it.each([0.5, 1, 2])(
    "resolves nested external-drop coordinates and the deepest target at zoom %s",
    (zoom) => {
      const index = new WorkspaceGeometryIndex();
      for (const frame of [
        {
          sectionId: "root",
          parentSectionId: null,
          depth: 0,
          order: 0,
          rect: { x: 20, y: 30, width: 300, height: 240 },
        },
        {
          sectionId: "child",
          parentSectionId: "root",
          depth: 1,
          order: 0,
          rect: { x: 60, y: 75, width: 180, height: 130 },
        },
        {
          sectionId: "grandchild",
          parentSectionId: "child",
          depth: 2,
          order: 0,
          rect: { x: 90, y: 110, width: 70, height: 55 },
        },
      ] as const) {
        index.register(frame);
      }
      const viewportBounds = { x: 80, y: 120, width: 900, height: 600 };
      const transform = { x: -40, y: 25, zoom };
      const workspacePosition = { x: 115, y: 135 };
      const clientPoint = workspacePointToClient(workspacePosition, viewportBounds, transform);

      expect(resolveGeometryDropTarget(index, clientPoint, viewportBounds, transform)).toEqual({
        targetSectionId: "grandchild",
        workspacePosition,
      });
      expect(
        resolveGeometryDropTarget(
          index,
          clientPoint,
          viewportBounds,
          transform,
          new Set(["grandchild"]),
        ),
      ).toEqual({ targetSectionId: "child", workspacePosition });
    },
  );
});
