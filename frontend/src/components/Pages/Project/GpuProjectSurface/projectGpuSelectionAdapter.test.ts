/* @vitest-environment jsdom */

import { setActiveSectionUIIds } from "state/activeSectionUI";
import {
  NULL_PROJECT_CONFIG_ID,
  useMisc,
  useNodeInternals,
  useProjectState,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createCodeSectionImpl,
  createCore,
  createProjectConfig,
  createSingleConfig,
  createVariant,
  type SingleConfig,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createGpuFlowLayoutStore } from "gpuFlow/layoutStore";
import { gpuFlowViewportStore } from "gpuFlow/viewportStore";

import {
  canDragProjectNode,
  handleProjectNodeDragStart,
  handleProjectNodeDragStop,
  handleProjectSelectionDragStart,
  handleProjectSelectionDragStop,
  handleProjectSelectionKeyboardNudge,
} from "./projectGpuSelectionAdapter";

describe("GPU project selection adapter", () => {
  beforeEach(() => {
    resetProjectStores();
    resetGpuViewportState();
  });

  afterEach(() => {
    resetProjectStores();
    resetGpuViewportState();
  });

  it("keeps direct node drag live temp z-index in the layout store and commits project state on stop", () => {
    loadProjectStateForSections([{ id: "section-a" }, { id: "section-b" }]);
    loadNodeInternals([
      node("section-a", 10, 20, 80, 40, 0),
      node("section-b", 100, 120, 60, 30, 1),
    ]);
    setActiveSectionUIIds(["section-a"]);
    const layoutStore = createGpuFlowLayoutStore({
      nodes: [
        {
          height: 40,
          nodeId: "section-a",
          tempZIndex: 0,
          width: 80,
          x: 10,
          y: 20,
          zIndex: 0,
        },
        {
          height: 30,
          nodeId: "section-b",
          tempZIndex: 1,
          width: 60,
          x: 100,
          y: 120,
          zIndex: 1,
        },
      ],
    });

    handleProjectNodeDragStart(layoutStore, {
      delta: { x: 0, y: 0 },
      items: [
        {
          distance: { x: 0, y: 0 },
          height: 40,
          nodeId: "section-a",
          position: { x: 10, y: 20 },
          width: 80,
        },
      ],
    });

    expect(useMisc.getState().mouseDownDraggingSection).toBe(true);
    expect(layoutStore.getState().getNode("section-a")).toMatchObject({
      tempZIndex: 1000,
      zIndex: 0,
    });
    expect(useNodeInternals.getState().x.get("section-a")).toMatchObject({
      tempZIndex: 0,
      zIndex: 0,
    });

    handleProjectNodeDragStop(layoutStore, {
      delta: { x: 15, y: -5 },
      items: [
        {
          distance: { x: 0, y: 0 },
          height: 40,
          nodeId: "section-a",
          position: { x: 25, y: 15 },
          width: 80,
        },
      ],
    });

    expect(useMisc.getState().mouseDownDraggingSection).toBe(false);
    expect(useNodeInternals.getState().x.get("section-a")).toMatchObject({
      position: { x: 25, y: 15 },
      tempZIndex: 1,
      zIndex: 1,
    });
    expect(useNodeInternals.getState().x.get("section-b")).toMatchObject({
      tempZIndex: 0,
      zIndex: 0,
    });
  });

  it("commits selected drag positions and final z-order from GpuFlow selection drag stop", () => {
    loadProjectStateForSections([
      { id: "section-a" },
      { id: "section-b" },
      { id: "section-c" },
    ]);
    loadNodeInternals([
      node("section-a", 10, 20, 80, 40, 0),
      node("section-b", 100, 120, 60, 30, 1),
      node("section-c", 300, 320, 90, 70, 2),
    ]);

    handleProjectSelectionDragStart();
    expect(useMisc.getState().mouseDownDraggingSection).toBe(true);

    handleProjectSelectionDragStop({
      active: false,
      delta: { x: 20, y: 20 },
      items: [
        {
          height: 40,
          nodeId: "section-a",
          position: { x: 30, y: 40 },
          width: 80,
        },
        {
          height: 30,
          nodeId: "section-b",
          position: { x: 120, y: 140 },
          width: 60,
        },
      ],
      phase: "stop",
      selectedNodeIds: ["section-a", "section-b"],
    });

    expect(useMisc.getState().mouseDownDraggingSection).toBe(false);
    expect(useNodeInternals.getState().x.get("section-c")).toMatchObject({
      tempZIndex: 0,
      zIndex: 0,
    });
    expect(useNodeInternals.getState().x.get("section-a")).toMatchObject({
      position: { x: 30, y: 40 },
      tempZIndex: 1,
      zIndex: 1,
    });
    expect(useNodeInternals.getState().x.get("section-b")).toMatchObject({
      position: { x: 120, y: 140 },
      tempZIndex: 2,
      zIndex: 2,
    });
  });

  it("commits keyboard nudge positions without changing z-order", () => {
    loadProjectStateForSections([{ id: "section-a" }, { id: "section-b" }]);
    loadNodeInternals([
      node("section-a", 10, 20, 80, 40, 0),
      node("section-b", 100, 120, 60, 30, 1),
    ]);

    handleProjectSelectionKeyboardNudge({
      delta: { x: 5, y: 0 },
      items: [
        {
          height: 40,
          nodeId: "section-a",
          position: { x: 15, y: 20 },
          width: 80,
        },
      ],
      selectedNodeIds: ["section-a"],
    });

    expect(useNodeInternals.getState().x.get("section-a")).toMatchObject({
      position: { x: 15, y: 20 },
      tempZIndex: 0,
      zIndex: 0,
    });
    expect(useNodeInternals.getState().x.get("section-b")).toMatchObject({
      position: { x: 100, y: 120 },
      tempZIndex: 1,
      zIndex: 1,
    });
  });

  it("keeps Setta direct pane drag policy in the project adapter", () => {
    loadProjectStateForSections([
      { id: "section-a" },
      { id: "section-b", positionAndSizeLocked: true },
      { id: "section-c", parentId: "section-a" },
    ]);

    expect(canDragProjectNode("section-a")).toBe(true);
    expect(canDragProjectNode("section-b")).toBe(false);
    expect(canDragProjectNode("section-c")).toBe(false);
  });
});

type MovementSectionInput = {
  readonly id: string;
  readonly parentId?: string | null | undefined;
  readonly positionAndSizeLocked?: boolean | undefined;
};

type MovementNodeInput = {
  readonly height: number;
  readonly id: string;
  readonly width: number;
  readonly x: number;
  readonly y: number;
  readonly zIndex: number;
};

function node(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  zIndex: number,
): MovementNodeInput {
  return { height, id, width, x, y, zIndex };
}

function loadNodeInternals(nodes: readonly MovementNodeInput[]) {
  useNodeInternals.setState({
    x: new Map(
      nodes.map((item) => [
        item.id,
        {
          height: item.height,
          id: item.id,
          position: { x: item.x, y: item.y },
          tempZIndex: item.zIndex,
          width: item.width,
          zIndex: item.zIndex,
        },
      ]),
    ),
  });
}

function loadProjectStateForSections(
  sections: readonly MovementSectionInput[],
) {
  const sectionVariantMap: Record<string, string> = {};
  const stateSections: SingleConfig["sections"] = {};
  const sectionImpls: SingleConfig["sectionImpls"] = {};
  const sectionVariants: SingleConfig["sectionVariants"] = {};
  const parentSectionMap: SingleConfig["parentSectionMap"] = {};
  const topLevelSections: SingleConfig["projectConfig"]["topLevelSections"] =
    {};

  for (const [index, section] of sections.entries()) {
    const variantId = `variant-${section.id}`;
    const implId = `impl-${section.id}`;
    sectionVariantMap[section.id] = variantId;
    const parentId = section.parentId ?? null;
    parentSectionMap[section.id] = parentId;
    if (parentId === null) {
      topLevelSections[section.id] = {
        h: 160,
        w: 200,
        x: index * 240,
        y: index * 120,
        zIndex: index,
      };
    }
    stateSections[section.id] = createCore({ id: section.id });
    sectionVariants[variantId] = createVariant({
      id: variantId,
      impl: implId,
      name: variantId,
      nonPresetImpls: [implId],
    });
    sectionImpls[implId] = createCodeSectionImpl({
      id: implId,
      positionAndSizeLocked: section.positionAndSizeLocked ?? false,
    });
  }

  useProjectState.setState(
    createSingleConfig({
      parentSectionMap,
      projectConfig: createProjectConfig({
        id: NULL_PROJECT_CONFIG_ID,
        sectionVariantMap,
        topLevelSections,
      }),
      sectionImpls,
      sections: stateSections,
      sectionVariants,
    }),
  );
}

function resetGpuViewportState() {
  gpuFlowViewportStore.setState({
    domNode: null,
    height: 0,
    nodeDragging: false,
    nodeResizing: false,
    nodesSelectionBounds: null,
    panScrolling: false,
    paneDragging: false,
    pointerPanning: false,
    transform: [0, 0, 1],
    userSelectionActive: false,
    userSelectionRect: null,
    viewportAnimating: false,
    viewportInteractionActive: false,
    wheelZooming: false,
    width: 0,
  });
}
