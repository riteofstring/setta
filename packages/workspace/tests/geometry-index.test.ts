import { describe, expect, it } from "vitest";

import {
  WorkspaceGeometryIndex,
  clientPointToWorkspace,
  clientRectToWorkspace,
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
});

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
});
