/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initialCanvasState, useReactFlow } from "../canvas/store";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
} from "../document/stores";
import type { Node, WorkspaceSectionInput } from "../document/types";
import { resolveWorkspaceEmptySpacePlacement } from "./emptySpacePlacement";

function createSectionInput(id: string, kind: string): WorkspaceSectionInput {
  return {
    id,
    kind,
    name: id,
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    overflowMode: false,
    tagColor: null,
    children: [],
  };
}

function loadSections(
  layouts: Record<
    string,
    { x: number; y: number; w?: number | null; h?: number | null }
  >,
  kind = "sized",
) {
  loadWorkspaceDocument({
    sections: Object.fromEntries(
      Object.keys(layouts).map((id) => [id, createSectionInput(id, kind)]),
    ),
    topLevelSections: Object.fromEntries(
      Object.entries(layouts).map(([id, layout], index) => [
        id,
        {
          x: layout.x,
          y: layout.y,
          w: layout.w ?? null,
          h: layout.h ?? null,
          zIndex: index,
        },
      ]),
    ),
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: [],
  });
}

// The pane rectangle without a mounted canvas element is the transform over the measured canvas
// size, which is what the reference sends as its viewport bounds.
function setVisiblePane(width: number, height: number) {
  useReactFlow.setState({ width, height, transform: [0, 0, 1] });
}

function measureNode(sectionId: string, width: number, height: number) {
  const nodes = new Map(useNodeInternals.getState().x);
  const node = nodes.get(sectionId);
  if (!node) {
    throw new Error(`Missing node ${sectionId}.`);
  }
  nodes.set(sectionId, { ...node, width, height } satisfies Node);
  useNodeInternals.setState({ x: nodes });
}

describe("empty-space placement", () => {
  beforeEach(() => {
    registerSectionKinds({
      sized: {
        renderContent: () => null,
        defaultSize: { width: 240, height: 120 },
      },
      auto: { renderContent: () => null },
    });
    useReactFlow.setState({ ...initialCanvasState });
  });

  afterEach(() => {
    useWorkspaceDocument.getState().reset();
    useActiveSections.getState().reset();
    useNodeInternals.getState().reset();
    useReactFlow.setState({ ...initialCanvasState });
    registerSectionKinds({});
  });

  it("places the first section inside the visible pane", () => {
    loadSections({});
    setVisiblePane(800, 600);

    expect(
      resolveWorkspaceEmptySpacePlacement(createSectionInput("new", "sized")),
    ).toEqual({
      position: { x: 24, y: 24 },
      panTo: null,
    });
  });

  it("keeps the padded distance from what the pane already shows", () => {
    loadSections({ existing: { x: 0, y: 0 } });
    setVisiblePane(800, 600);

    expect(
      resolveWorkspaceEmptySpacePlacement(createSectionInput("new", "sized")),
    ).toEqual({
      position: { x: 264, y: 24 },
      panTo: null,
    });
  });

  it("measures what the canvas laid out rather than the stored layout", () => {
    loadSections({ existing: { x: 0, y: 0 } });
    measureNode("existing", 400, 300);
    setVisiblePane(800, 600);

    expect(
      resolveWorkspaceEmptySpacePlacement(createSectionInput("new", "sized"))
        .position,
    ).toEqual({ x: 424, y: 24 });
  });

  it("reserves the sizing policy's minimum for an automatic dimension", () => {
    loadSections({ first: { x: 0, y: 0 }, second: { x: 0, y: 200 } });
    setVisiblePane(300, 600);

    // A 1 px tall reservation fits the 32 px gap between the two padded sections; the sized
    // section below proves the same gap rejects a section that reserves its real height.
    expect(
      resolveWorkspaceEmptySpacePlacement(createSectionInput("new", "auto"))
        .position,
    ).toEqual({ x: 24, y: 144 });
    expect(
      resolveWorkspaceEmptySpacePlacement(createSectionInput("new", "sized"))
        .position,
    ).not.toEqual({ x: 24, y: 144 });
  });

  it("joins the workspace and travels to it when the pane is looking elsewhere", () => {
    loadSections({ existing: { x: 2000, y: 2000 } });
    setVisiblePane(800, 600);

    // Below the workspace rather than beside it: the reference prefers the side that keeps the
    // occupied area closest to square.
    expect(
      resolveWorkspaceEmptySpacePlacement(createSectionInput("new", "sized")),
    ).toEqual({
      position: { x: 2000, y: 2144 },
      panTo: { x: 2200, y: 2204 },
    });
  });

  it("stays where the layout says without a measurable canvas", () => {
    loadSections({ existing: { x: 2000, y: 2000 } });

    expect(
      resolveWorkspaceEmptySpacePlacement(createSectionInput("new", "sized")),
    ).toEqual({
      position: { x: 2000, y: 2144 },
      panTo: null,
    });
  });
});
