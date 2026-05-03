/* @vitest-environment jsdom */

import { setActiveSectionUIIds } from "state/activeSectionUI";
import {
  NULL_PROJECT_CONFIG_ID,
  useLocalStorage,
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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { gpuFlowViewportStore } from "gpuFlow/viewportStore";

import {
  handleProjectNodeDrag,
  handleProjectNodeDragStart,
  handleProjectNodeDragStop,
  updateSelectedNodePositionsFromKeyboard,
} from "./nodeSelectionOverlay";

vi.mock("forks/dnd-kit/dndState", () => ({
  useDndMode: () => ({ isMovingFree: false, isSorting: false }),
}));

vi.mock("forks/dnd-kit/selectionDragHandle", () => ({
  setSelectionDragHandle: vi.fn(),
  setSelectionDragPrimaryId: vi.fn(),
}));

vi.mock("./projectGpuSurface", () => ({
  SELECTION_ARROW_KEY_DIFFS: {
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: -1 },
  },
}));

describe("GpuProjectNodesSelectionOverlay movement adapters", () => {
  beforeEach(() => {
    resetProjectStores();
    useLocalStorage.setState({ snapToGrid: false });
    resetGpuViewportState();
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(
      (callback) => {
        callback(0);
        return 1;
      },
    );
    vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetProjectStores();
    resetGpuViewportState();
  });

  it("keeps direct node drag live updates in node internals and commits z-order on stop", () => {
    loadProjectStateForSections([{ id: "section-a" }, { id: "section-b" }]);
    useNodeInternals.setState({
      x: new Map([
        [
          "section-a",
          {
            height: 40,
            id: "section-a",
            position: { x: 10, y: 20 },
            tempZIndex: 0,
            width: 80,
            zIndex: 0,
          },
        ],
        [
          "section-b",
          {
            height: 30,
            id: "section-b",
            position: { x: 100, y: 120 },
            tempZIndex: 1,
            width: 60,
            zIndex: 1,
          },
        ],
      ]),
    });
    setActiveSectionUIIds(["section-a"]);
    gpuFlowViewportStore.getState().setNodesSelectionBounds({
      height: 40,
      width: 80,
      x: 10,
      y: 20,
    });

    handleProjectNodeDragStart({
      active: true,
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
      nodeId: "section-a",
      phase: "start",
    });

    expect(useMisc.getState().mouseDownDraggingSection).toBe(true);
    expect(useNodeInternals.getState().x.get("section-a")).toMatchObject({
      tempZIndex: 1000,
      zIndex: 0,
    });

    const dragChange = {
      active: true,
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
      nodeId: "section-a",
      phase: "drag" as const,
    };
    handleProjectNodeDrag(dragChange);

    expect(useNodeInternals.getState().x.get("section-a")?.position).toEqual({
      x: 25,
      y: 15,
    });
    expect(gpuFlowViewportStore.getState().nodesSelectionBounds).toEqual({
      height: 40,
      width: 80,
      x: 25,
      y: 15,
    });

    handleProjectNodeDragStop({
      ...dragChange,
      active: false,
      phase: "stop",
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

  it("refreshes selection bounds when keyboard nudge skips a locked selected node", () => {
    loadProjectStateForSections([
      { id: "section-a" },
      { id: "section-b", positionAndSizeLocked: true },
    ]);
    useNodeInternals.setState({
      x: new Map([
        [
          "section-a",
          {
            height: 40,
            id: "section-a",
            position: { x: 10, y: 20 },
            tempZIndex: 0,
            width: 80,
            zIndex: 0,
          },
        ],
        [
          "section-b",
          {
            height: 30,
            id: "section-b",
            position: { x: 100, y: 120 },
            tempZIndex: 1,
            width: 60,
            zIndex: 1,
          },
        ],
      ]),
    });
    setActiveSectionUIIds(["section-a", "section-b"]);
    gpuFlowViewportStore.getState().setNodesSelectionBounds({
      height: 130,
      width: 150,
      x: 10,
      y: 20,
    });

    updateSelectedNodePositionsFromKeyboard({
      isShiftPressed: false,
      x: 1,
      y: 0,
    });

    expect(useNodeInternals.getState().x.get("section-a")?.position).toEqual({
      x: 15,
      y: 20,
    });
    expect(useNodeInternals.getState().x.get("section-b")?.position).toEqual({
      x: 100,
      y: 120,
    });
    expect(gpuFlowViewportStore.getState().nodesSelectionBounds).toEqual({
      height: 130,
      width: 145,
      x: 15,
      y: 20,
    });
  });
});

type MovementSectionInput = {
  readonly id: string;
  readonly positionAndSizeLocked?: boolean | undefined;
};

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
    parentSectionMap[section.id] = null;
    topLevelSections[section.id] = {
      h: 160,
      w: 200,
      x: index * 240,
      y: index * 120,
      zIndex: index,
    };
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
