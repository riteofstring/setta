import { describe, expect, it } from "vitest";

import type { WorkspaceDocument, WorkspaceSection } from "../src/core.js";
import type { MeasuredWorkspaceChildRegion } from "../src/internal/workspace-geometry-service.js";
import {
  captureWorkspaceSectionFreeformRegions,
  captureWorkspaceSectionMoveRegions,
  type WorkspaceSectionMoveGeometryFrame,
} from "../src/internal/workspace-section-move-regions.js";
import { createWorkspaceTestDocument } from "../src/testing.js";

const frame: WorkspaceSectionMoveGeometryFrame = {
  canvasBounds: { height: 600, width: 800, x: 10, y: 20 },
  viewport: { x: 30, y: 40, zoom: 2 },
};

function orderedContainer(
  section: WorkspaceSection,
  sectionIds: readonly string[],
  orientation: "horizontal" | "vertical" = "vertical",
): WorkspaceSection {
  return {
    ...section,
    childLayout: { orientation, overflow: "grow", positioning: "ordered", sectionIds },
  };
}

function freeformContainer(
  section: WorkspaceSection,
  sectionIds: readonly string[],
): WorkspaceSection {
  return {
    ...section,
    childLayout: {
      overflow: "grow",
      positioning: "freeform",
      positions: Object.fromEntries(sectionIds.map((sectionId) => [sectionId, { x: 0, y: 0 }])),
      sectionIds,
    },
  };
}

function regionDocument(): WorkspaceDocument {
  const flat = createWorkspaceTestDocument([
    { id: "ordered-root", title: "Ordered root" },
    { id: "freeform-root", title: "Freeform root" },
    { id: "child-a", title: "Child A" },
    { id: "child-b", title: "Child B" },
    { id: "leaf", title: "Leaf" },
  ]);
  return {
    ...flat,
    rootSections: [
      { position: { x: 0, y: 0 }, sectionId: "ordered-root" },
      { position: { x: 320, y: 0 }, sectionId: "freeform-root" },
      { position: { x: 640, y: 0 }, sectionId: "leaf" },
    ],
    sections: {
      ...flat.sections,
      "freeform-root": freeformContainer(flat.sections["freeform-root"] as WorkspaceSection, [
        "child-b",
      ]),
      "ordered-root": orderedContainer(flat.sections["ordered-root"] as WorkspaceSection, [
        "child-a",
      ]),
    },
  };
}

function measuredRegion(
  parentSectionId: string,
  overrides: Partial<MeasuredWorkspaceChildRegion> = {},
): MeasuredWorkspaceChildRegion {
  return {
    columnGap: 12,
    direction: "ltr",
    element: {} as HTMLElement,
    parentSectionId,
    rowGap: 8,
    surface: {} as HTMLElement,
    surfaceWorkspaceRect: { height: 100, width: 200, x: 5, y: 6 },
    workspaceRect: { height: 120, width: 220, x: 4, y: 5 },
    ...overrides,
  };
}

describe("captureWorkspaceSectionMoveRegions", () => {
  it("captures ordered and freeform regions from measurements in document order", () => {
    const capture = captureWorkspaceSectionMoveRegions(
      regionDocument(),
      frame,
      new Map([
        ["freeform-root", measuredRegion("freeform-root")],
        ["ordered-root", measuredRegion("ordered-root")],
      ]),
    );
    if (!capture.allowed) {
      throw new Error(capture.reason);
    }
    expect(capture.regions.map(({ parentSectionId }) => parentSectionId)).toEqual(["ordered-root"]);
    expect(capture.freeformRegions.map(({ parentSectionId }) => parentSectionId)).toEqual([
      "freeform-root",
    ]);
    const region = capture.regions[0];
    expect(region?.gap).toBe(8);
    expect(region?.orientation).toBe("vertical");
    expect(region?.direction).toBe("ltr");
    expect(region?.workspaceRect).toEqual({ height: 120, width: 220, x: 4, y: 5 });
    expect(region?.clientRect).toMatchObject({ height: 240, width: 440, x: 48, y: 70 });
    const freeform = capture.freeformRegions[0];
    expect(freeform?.surfaceWorkspaceRect).toEqual({ height: 100, width: 200, x: 5, y: 6 });
    expect(freeform?.surfaceClientRect).toMatchObject({ height: 200, width: 400, x: 50, y: 72 });
  });

  it("uses the column gap for horizontal containers", () => {
    const document = regionDocument();
    const horizontal = {
      ...document,
      sections: {
        ...document.sections,
        "ordered-root": orderedContainer(
          document.sections["ordered-root"] as WorkspaceSection,
          ["child-a"],
          "horizontal",
        ),
      },
    };
    const capture = captureWorkspaceSectionMoveRegions(
      horizontal,
      frame,
      new Map([["ordered-root", measuredRegion("ordered-root")]]),
    );
    if (!capture.allowed) {
      throw new Error(capture.reason);
    }
    expect(capture.regions[0]?.gap).toBe(12);
  });

  it("fails when a measured region's section is not a container", () => {
    const capture = captureWorkspaceSectionMoveRegions(
      regionDocument(),
      frame,
      new Map([["leaf", measuredRegion("leaf")]]),
    );
    expect(capture).toEqual({
      allowed: false,
      reason: "A section move destination region is invalid.",
    });
  });

  it("fails when a registered region has not been measured", () => {
    const capture = captureWorkspaceSectionMoveRegions(
      regionDocument(),
      frame,
      new Map([["ordered-root", null]]),
    );
    expect(capture).toEqual({
      allowed: false,
      reason: "The ordered-root drop destination region is not completely measured.",
    });
  });

  it("fails when a freeform region has no measured surface", () => {
    const capture = captureWorkspaceSectionMoveRegions(
      regionDocument(),
      frame,
      new Map([["freeform-root", measuredRegion("freeform-root", { surface: null })]]),
    );
    expect(capture).toEqual({
      allowed: false,
      reason: "The freeform-root freeform movement surface is unavailable.",
    });
  });

  it("fails when the layout gap is unavailable", () => {
    const capture = captureWorkspaceSectionMoveRegions(
      regionDocument(),
      frame,
      new Map([["ordered-root", measuredRegion("ordered-root", { rowGap: null })]]),
    );
    expect(capture).toEqual({
      allowed: false,
      reason: "The ordered-root layout gap is unavailable.",
    });
  });

  it("fails when a registered region is unreachable from the document roots", () => {
    const capture = captureWorkspaceSectionMoveRegions(
      regionDocument(),
      frame,
      new Map([["missing-section", measuredRegion("missing-section")]]),
    );
    expect(capture).toEqual({
      allowed: false,
      reason: "A section move destination region is invalid.",
    });
  });
});

describe("captureWorkspaceSectionFreeformRegions", () => {
  it("captures freeform regions and quietly skips ordered or unknown regions", () => {
    const capture = captureWorkspaceSectionFreeformRegions(
      regionDocument(),
      frame,
      new Map([
        ["freeform-root", measuredRegion("freeform-root")],
        ["missing-section", measuredRegion("missing-section")],
        ["ordered-root", measuredRegion("ordered-root")],
      ]),
    );
    if (!capture.allowed) {
      throw new Error(capture.reason);
    }
    expect(capture.freeformRegions.map(({ parentSectionId }) => parentSectionId)).toEqual([
      "freeform-root",
    ]);
  });

  it("fails when a freeform drop surface is unavailable", () => {
    const capture = captureWorkspaceSectionFreeformRegions(
      regionDocument(),
      frame,
      new Map([["freeform-root", null]]),
    );
    expect(capture).toEqual({
      allowed: false,
      reason: "The freeform-root freeform drop surface is unavailable.",
    });
  });
});
