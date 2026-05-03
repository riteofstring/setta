/* @vitest-environment jsdom */

import { getGpuFlowSceneDomSectionNodes } from "gpuFlow/scene";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
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
  createGroupSectionImpl,
  createProjectConfig,
  createSingleConfig,
  createVariant,
  type SingleConfig,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createGpuFlowLayoutStore } from "gpuFlow/layoutStore";
import { gpuFlowViewportStore } from "gpuFlow/viewportStore";

import { getProjectGpuFlowScene } from "./projectGpuLayoutAdapter";
import {
  canDragProjectNode,
  handleProjectNodeDrag,
  handleProjectNodeDragCancel,
  handleProjectNodeDragStart,
  handleProjectNodeDragStop,
  handleProjectSelectionDragStart,
  handleProjectSelectionDragStop,
  handleProjectSelectionKeyboardNudge,
} from "./projectGpuSelectionAdapter";

const callOpenAPIMock = vi.fn(() => ({
  hasResponse: true,
  status: 200,
}));

vi.mock("@setta/app-subsystem-frontend-sdk", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@setta/app-subsystem-frontend-sdk")>();
  return {
    ...actual,
    callOpenAPI: (request: unknown) => callOpenAPIMock(request),
  };
});

vi.mock("openapi/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openapi/http")>();
  return {
    ...actual,
    moveSections: vi.fn((request: unknown) => request),
    setCodeSectionAttachedTerminal: vi.fn((request: unknown) => request),
  };
});

describe("GPU project selection adapter", () => {
  beforeEach(() => {
    resetProjectStores();
    resetGpuViewportState();
    callOpenAPIMock.mockClear();
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
    expect(layoutStore.getState().dragPreview).toBeNull();
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
    const scene = getProjectGpuFlowScene(useProjectState.getState(), {
      darkMode: false,
    });

    expect(canDragProjectNode("section-a")).toBe(true);
    expect(canDragProjectNode("section-b")).toBe(false);
    expect(canDragProjectNode("section-c")).toBe(false);
    expect(canDragProjectNode("section-c", scene)).toBe(false);
  });

  it("allows renderer-owned nested scene children to commit same-parent reorder on drag stop", () => {
    loadProjectStateForSections([
      {
        children: ["child-a", "child-b", "child-c"],
        id: "parent",
        kind: "group",
        sectionHeight: 500,
        sectionWidth: 260,
        topLevelHeight: 500,
        topLevelWidth: 260,
      },
      { id: "child-a", parentId: "parent" },
      { id: "child-b", parentId: "parent" },
      { id: "child-c", parentId: "parent" },
    ]);
    loadNodeInternals([node("parent", 0, 0, 260, 500, 0)]);
    const scene = getProjectGpuFlowScene(useProjectState.getState(), {
      darkMode: false,
    });
    const layoutStore = createGpuFlowLayoutStore({
      nodes: getGpuFlowSceneDomSectionNodes(scene),
    });

    expect(canDragProjectNode("child-a")).toBe(false);
    expect(canDragProjectNode("child-a", scene)).toBe(true);

    handleProjectNodeDragStart(layoutStore, {
      delta: { x: 0, y: 0 },
      items: [
        {
          distance: { x: 0, y: 0 },
          height: 150,
          nodeId: "child-a",
          position: { x: 0, y: 0 },
          width: 250,
        },
      ],
    });
    handleProjectNodeDragStop(
      layoutStore,
      {
        delta: { x: 0, y: 360 },
        items: [
          {
            distance: { x: 0, y: 0 },
            height: 150,
            nodeId: "child-a",
            position: { x: 0, y: 360 },
            width: 250,
          },
        ],
      },
      scene,
    );

    expect(getSectionImplChildren("parent")).toEqual([
      "child-b",
      "child-c",
      "child-a",
    ]);
    expect(useMisc.getState().mouseDownDraggingSection).toBe(false);
    expect(useNodeInternals.getState().x.has("child-a")).toBe(false);
    expect(callOpenAPIMock).toHaveBeenCalledTimes(1);
  });

  it("previews nested sibling displacement in the GPU layout store during drag", () => {
    loadProjectStateForSections([
      {
        children: ["child-a", "child-b", "child-c"],
        id: "parent",
        kind: "group",
        sectionHeight: 500,
        sectionWidth: 260,
        topLevelHeight: 500,
        topLevelWidth: 260,
      },
      { id: "child-a", parentId: "parent" },
      { id: "child-b", parentId: "parent" },
      { id: "child-c", parentId: "parent" },
    ]);
    loadNodeInternals([node("parent", 0, 0, 260, 500, 0)]);
    const scene = getProjectGpuFlowScene(useProjectState.getState(), {
      darkMode: false,
    });
    const layoutStore = createGpuFlowLayoutStore({
      nodes: getGpuFlowSceneDomSectionNodes(scene),
    });

    handleProjectNodeDrag(
      layoutStore,
      {
        delta: { x: 0, y: 360 },
        items: [
          {
            distance: { x: 0, y: 0 },
            height: 150,
            nodeId: "child-a",
            position: { x: 0, y: 360 },
            width: 250,
          },
        ],
      },
      scene,
    );

    expect(layoutStore.getState().getNode("child-a")).toMatchObject({
      x: 0,
      y: 0,
    });
    expect(layoutStore.getState().getNode("child-b")).toMatchObject({
      x: 0,
      y: 0,
    });
    expect(layoutStore.getState().getNode("child-c")).toMatchObject({
      x: 0,
      y: 158,
    });
    expect(layoutStore.getState().dragPreview).toMatchObject({
      draggedNodeIds: ["child-a"],
      dropMarker: {
        axis: "y",
        childNodeId: "child-a",
        index: 2,
        parentNodeId: "parent",
      },
    });
    expect(getSectionImplChildren("parent")).toEqual([
      "child-a",
      "child-b",
      "child-c",
    ]);
    expect(callOpenAPIMock).not.toHaveBeenCalled();

    handleProjectNodeDrag(
      layoutStore,
      {
        delta: { x: 0, y: 10 },
        items: [
          {
            distance: { x: 0, y: 0 },
            height: 150,
            nodeId: "child-a",
            position: { x: 0, y: 10 },
            width: 250,
          },
        ],
      },
      scene,
    );

    expect(layoutStore.getState().getNode("child-b")).toMatchObject({
      x: 0,
      y: 158,
    });
    expect(layoutStore.getState().getNode("child-c")).toMatchObject({
      x: 0,
      y: 316,
    });
    expect(layoutStore.getState().dragPreview).toMatchObject({
      draggedNodeIds: ["child-a"],
      dropMarker: null,
    });
    expect(callOpenAPIMock).not.toHaveBeenCalled();
  });

  it("previews selected nested sibling displacement as a scene-owned block", () => {
    loadProjectStateForSections([
      {
        children: ["child-a", "child-b", "child-c", "child-d"],
        id: "parent",
        kind: "group",
        sectionHeight: 800,
        sectionWidth: 260,
        topLevelHeight: 800,
        topLevelWidth: 260,
      },
      { id: "child-a", parentId: "parent" },
      { id: "child-b", parentId: "parent" },
      { id: "child-c", parentId: "parent" },
      { id: "child-d", parentId: "parent" },
    ]);
    loadNodeInternals([node("parent", 0, 0, 260, 800, 0)]);
    const scene = getProjectGpuFlowScene(useProjectState.getState(), {
      darkMode: false,
    });
    const layoutStore = createGpuFlowLayoutStore({
      nodes: getGpuFlowSceneDomSectionNodes(scene),
    });
    layoutStore.getState().patchNodes(
      [
        { nodeId: "child-a", x: 0, y: 700 },
        { nodeId: "child-b", x: 0, y: 858 },
      ],
      { phase: "change", reason: "drag" },
    );

    handleProjectNodeDrag(
      layoutStore,
      {
        delta: { x: 0, y: 700 },
        items: [
          {
            distance: { x: 0, y: 0 },
            height: 150,
            nodeId: "child-b",
            position: { x: 0, y: 858 },
            width: 250,
          },
          {
            distance: { x: 0, y: 0 },
            height: 150,
            nodeId: "child-a",
            position: { x: 0, y: 700 },
            width: 250,
          },
        ],
        nodeId: "child-a",
      },
      scene,
    );

    expect(layoutStore.getState().getNode("child-a")).toMatchObject({
      x: 0,
      y: 700,
    });
    expect(layoutStore.getState().getNode("child-b")).toMatchObject({
      x: 0,
      y: 858,
    });
    expect(layoutStore.getState().getNode("child-c")).toMatchObject({
      x: 0,
      y: 0,
    });
    expect(layoutStore.getState().getNode("child-d")).toMatchObject({
      x: 0,
      y: 158,
    });
    expect(layoutStore.getState().dragPreview).toMatchObject({
      draggedNodeIds: ["child-b", "child-a"],
      dropMarker: {
        axis: "y",
        childNodeId: "child-a",
        index: 2,
        parentNodeId: "parent",
      },
    });
    expect(getSectionImplChildren("parent")).toEqual([
      "child-a",
      "child-b",
      "child-c",
      "child-d",
    ]);
    expect(callOpenAPIMock).not.toHaveBeenCalled();
  });

  it("restores scene layout without backend calls when nested drag does not reorder or is cancelled", () => {
    loadProjectStateForSections([
      { children: ["child-a", "child-b"], id: "parent", kind: "group" },
      { id: "child-a", parentId: "parent" },
      { id: "child-b", parentId: "parent" },
    ]);
    loadNodeInternals([node("parent", 0, 0, 260, 500, 0)]);
    const scene = getProjectGpuFlowScene(useProjectState.getState(), {
      darkMode: false,
    });
    const layoutStore = createGpuFlowLayoutStore({
      nodes: getGpuFlowSceneDomSectionNodes(scene),
    });

    layoutStore.getState().patchNodes(
      [
        {
          nodeId: "child-a",
          x: 0,
          y: 12,
        },
      ],
      { phase: "change", reason: "drag" },
    );

    handleProjectNodeDragStop(
      layoutStore,
      {
        delta: { x: 0, y: 12 },
        items: [
          {
            distance: { x: 0, y: 0 },
            height: 150,
            nodeId: "child-a",
            position: { x: 0, y: 12 },
            width: 250,
          },
        ],
      },
      scene,
    );

    expect(getSectionImplChildren("parent")).toEqual(["child-a", "child-b"]);
    expect(layoutStore.getState().getNode("child-a")).toMatchObject({
      x: 0,
      y: 0,
    });
    expect(layoutStore.getState().dragPreview).toBeNull();
    expect(callOpenAPIMock).not.toHaveBeenCalled();

    layoutStore.getState().patchNodes(
      [
        {
          nodeId: "child-a",
          x: 0,
          y: 220,
        },
      ],
      { phase: "change", reason: "drag" },
    );
    handleProjectNodeDragCancel(
      layoutStore,
      {
        delta: { x: 0, y: 220 },
        items: [
          {
            distance: { x: 0, y: 0 },
            height: 150,
            nodeId: "child-a",
            position: { x: 0, y: 220 },
            width: 250,
          },
        ],
      },
      scene,
    );

    expect(getSectionImplChildren("parent")).toEqual(["child-a", "child-b"]);
    expect(layoutStore.getState().getNode("child-a")).toMatchObject({
      x: 0,
      y: 0,
    });
    expect(layoutStore.getState().dragPreview).toBeNull();
    expect(callOpenAPIMock).not.toHaveBeenCalled();
  });

  it("commits renderer-owned nested child reparenting from scene geometry on drag stop", () => {
    loadProjectStateForSections([
      { children: ["child-a"], id: "parent-a", kind: "group" },
      { children: ["child-b"], id: "parent-b", kind: "group" },
      { id: "child-a", parentId: "parent-a" },
      { id: "child-b", parentId: "parent-b" },
    ]);
    loadNodeInternals([
      node("parent-a", 0, 0, 260, 500, 0),
      node("parent-b", 240, 120, 260, 500, 1),
    ]);
    const scene = getProjectGpuFlowScene(useProjectState.getState(), {
      darkMode: false,
    });
    const layoutStore = createGpuFlowLayoutStore({
      nodes: getGpuFlowSceneDomSectionNodes(scene),
    });

    handleProjectNodeDragStop(
      layoutStore,
      {
        delta: { x: 240, y: 170 },
        items: [
          {
            distance: { x: 0, y: 0 },
            height: 150,
            nodeId: "child-a",
            position: { x: 240, y: 170 },
            width: 250,
          },
        ],
      },
      scene,
    );

    expect(getSectionImplChildren("parent-a")).toEqual([]);
    expect(getSectionImplChildren("parent-b")).toEqual(["child-b", "child-a"]);
    expect(useProjectState.getState().parentSectionMap["child-a"]).toBe(
      "parent-b",
    );
    expect(layoutStore.getState().dragPreview).toBeNull();
    expect(useMisc.getState().mouseDownDraggingSection).toBe(false);
    expect(callOpenAPIMock).toHaveBeenCalledTimes(1);
  });

  it("commits selected nested siblings from renderer-owned scene geometry on drag stop", () => {
    loadProjectStateForSections([
      {
        children: ["child-a", "child-b", "child-c", "child-d"],
        id: "parent",
        kind: "group",
        sectionHeight: 800,
        sectionWidth: 260,
        topLevelHeight: 800,
        topLevelWidth: 260,
      },
      { id: "child-a", parentId: "parent" },
      { id: "child-b", parentId: "parent" },
      { id: "child-c", parentId: "parent" },
      { id: "child-d", parentId: "parent" },
    ]);
    loadNodeInternals([node("parent", 0, 0, 260, 800, 0)]);
    const scene = getProjectGpuFlowScene(useProjectState.getState(), {
      darkMode: false,
    });
    const layoutStore = createGpuFlowLayoutStore({
      nodes: getGpuFlowSceneDomSectionNodes(scene),
    });

    handleProjectNodeDragStop(
      layoutStore,
      {
        delta: { x: 0, y: 700 },
        items: [
          {
            distance: { x: 0, y: 0 },
            height: 150,
            nodeId: "child-b",
            position: { x: 0, y: 858 },
            width: 250,
          },
          {
            distance: { x: 0, y: 0 },
            height: 150,
            nodeId: "child-a",
            position: { x: 0, y: 700 },
            width: 250,
          },
        ],
        nodeId: "child-a",
      },
      scene,
    );

    expect(getSectionImplChildren("parent")).toEqual([
      "child-c",
      "child-d",
      "child-a",
      "child-b",
    ]);
    expect(layoutStore.getState().dragPreview).toBeNull();
    expect(useMisc.getState().mouseDownDraggingSection).toBe(false);
    expect(callOpenAPIMock).toHaveBeenCalledTimes(1);
  });
});

type MovementSectionInput = {
  readonly children?: readonly string[] | undefined;
  readonly id: string;
  readonly kind?: "code" | "group" | undefined;
  readonly parentId?: string | null | undefined;
  readonly positionAndSizeLocked?: boolean | undefined;
  readonly sectionHeight?: number | undefined;
  readonly sectionWidth?: number | undefined;
  readonly topLevelHeight?: number | undefined;
  readonly topLevelWidth?: number | undefined;
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
        h: section.topLevelHeight ?? 160,
        w: section.topLevelWidth ?? 200,
        x: index * 240,
        y: index * 120,
        zIndex: index,
      };
    }
    stateSections[section.id] = createCore({
      defaultVariant: variantId,
      id: section.id,
      variants: [variantId],
    });
    sectionVariants[variantId] = createVariant({
      id: variantId,
      impl: implId,
      name: variantId,
      nonPresetImpls: [implId],
    });
    const size = getMovementSectionSize(section);
    sectionImpls[implId] =
      section.kind === "group"
        ? createGroupSectionImpl({
            children: [...(section.children ?? [])],
            id: implId,
            positionAndSizeLocked: section.positionAndSizeLocked ?? false,
            ...(size ? { size } : {}),
          })
        : createCodeSectionImpl({
            id: implId,
            positionAndSizeLocked: section.positionAndSizeLocked ?? false,
            ...(size ? { size } : {}),
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

function getMovementSectionSize(section: MovementSectionInput): never | null {
  if (
    section.sectionHeight === undefined &&
    section.sectionWidth === undefined
  ) {
    return null;
  }
  return {
    height: section.sectionHeight ?? "auto",
    width: section.sectionWidth ?? "auto",
  } as never;
}

function getSectionImplChildren(sectionId: string): readonly string[] {
  const impl = getCurrEffectiveSectionImpl(
    useProjectState.getState(),
    sectionId,
  );
  return impl && "children" in impl ? [...impl.children] : [];
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
