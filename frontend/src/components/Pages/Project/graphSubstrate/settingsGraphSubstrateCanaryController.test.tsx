/* @vitest-environment jsdom */

import { screenToFlowPosition } from "forks/xyflow/core/hooks/useViewportHelper";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { applyActiveSectionChange } from "state/actions/activeSectionController";
import { useMisc } from "state/definitions";
import "testUtils/reactRefreshPreamble";
import { useTabScope } from "utils/focusManager";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveSettingsGraphSubstrateCanaryViewportTransform,
  useSettingsGraphSubstrateCanaryController,
} from "./settingsGraphSubstrateCanaryController";
import { resolveSettingsGraphSubstrateCanarySections } from "./settingsGraphSubstrateCanaryModel";
import { useSettingsGraphSubstrateCanarySurfaceRuntime } from "./settingsGraphSubstrateCanarySurfaceRuntime";

const hoisted = vi.hoisted(() => ({
  localStorageState: {
    overviewTrueWidth: 420,
    snapToGrid: true,
    uiEditorTrueWidth: 260,
  },
  miscState: {
    lastPaneClickLocation: null as { x: number; y: number } | null,
    mouseDownDrawArea: false,
  },
  projectState: {
    projectConfig: {
      viewport: { x: 480, y: -320, zoom: 0.75 },
      viewportInitialized: true,
    },
  },
  nodeInternals: new Map<string, Record<string, unknown> | undefined>(),
  layoutSections: [
    {
      sectionId: "layout-a",
    },
  ],
  reactFlowSelectorState: {
    nodeDragThreshold: 8,
    zoomActivationKeyPressed: true,
  },
  sections: [
    {
      sectionId: "section-a",
    },
  ],
  settingsState: {
    gui: {
      defaultZoomLevel: 1.25,
      maxZoom: 4,
      minZoom: 0.1,
      panOnScroll: true,
      panOnScrollMode: "free",
      panOnScrollSpeed: 1.5,
      showGridLines: true,
      snapGrid: [16, 24],
      zoomOnPinch: true,
      zoomOnScroll: false,
    },
  },
  surfaceRuntime: {
    draggingSectionId: "section-a",
    finishPanePan: vi.fn(),
    handlePanePointerDown: vi.fn(),
    handlePanePointerMove: vi.fn(),
    handlePaneWheel: vi.fn(),
    isViewportPanning: true,
    resolvedViewport: { x: 120, y: -44, zoom: 1.4 },
    sceneSnapshot: {
      sections: [
        {
          sectionId: "section-a",
        },
      ],
    },
    sectionDragController: {
      cancelSectionDrag: vi.fn(),
      cleanup: vi.fn(),
      finishSectionDrag: vi.fn(),
      handleSectionPointerDown: vi.fn(),
      handleSectionPointerMove: vi.fn(),
    },
  },
  useMiscSetState: vi.fn((nextState: Record<string, unknown>) => {
    Object.assign(hoisted.miscState, nextState);
  }),
  useReactFlowSetState: vi.fn(),
}));

vi.mock("forks/xyflow/core/hooks/useViewportHelper", () => ({
  screenToFlowPosition: vi.fn(({ x, y }: { x: number; y: number }) => ({
    x: x - 10,
    y: y + 5,
  })),
}));

vi.mock("forks/xyflow/core/store", () => {
  const useReactFlowMock = Object.assign(
    vi.fn(
      (selector: (state: typeof hoisted.reactFlowSelectorState) => unknown) =>
        selector(hoisted.reactFlowSelectorState),
    ),
    {
      setState: hoisted.useReactFlowSetState,
    },
  );
  return {
    useReactFlow: useReactFlowMock,
  };
});

vi.mock("state/actions/activeSectionController", () => ({
  applyActiveSectionChange: vi.fn(),
}));

vi.mock("state/definitions", () => ({
  useLocalStorage: vi.fn(
    (selector: (state: typeof hoisted.localStorageState) => unknown) =>
      selector(hoisted.localStorageState),
  ),
  useMisc: {
    getState: () => hoisted.miscState,
    setState: hoisted.useMiscSetState,
  },
  useProjectState: vi.fn(
    (selector: (state: typeof hoisted.projectState) => unknown) =>
      selector(hoisted.projectState),
  ),
  useNodeInternals: vi.fn(
    (selector: (state: { x: typeof hoisted.nodeInternals }) => unknown) =>
      selector({ x: hoisted.nodeInternals }),
  ),
  useSettings: vi.fn(
    (selector: (state: typeof hoisted.settingsState) => unknown) =>
      selector(hoisted.settingsState),
  ),
}));

vi.mock("utils/focusManager", () => ({
  useTabScope: vi.fn(),
}));

vi.mock("./settingsGraphSubstrateCanaryModel", () => ({
  resolveSettingsGraphSubstrateCanarySections: vi.fn(() => hoisted.sections),
  selectSettingsGraphSubstrateCanaryLayoutSections: vi.fn(
    () => hoisted.layoutSections,
  ),
}));

vi.mock("./settingsGraphSubstrateCanarySurfaceRuntime", () => ({
  useSettingsGraphSubstrateCanarySurfaceRuntime: vi.fn(
    () => hoisted.surfaceRuntime,
  ),
}));

function ControllerProbe() {
  const controller = useSettingsGraphSubstrateCanaryController();

  return (
    <div
      ref={controller.rootRef}
      data-cursor={controller.rootCursor}
      data-testid="controller-probe"
      data-transform={controller.viewportTransform ?? ""}
      onClick={controller.handlePaneClick}
    />
  );
}

describe("useSettingsGraphSubstrateCanaryController", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    hoisted.localStorageState.overviewTrueWidth = 420;
    hoisted.localStorageState.snapToGrid = true;
    hoisted.localStorageState.uiEditorTrueWidth = 260;
    hoisted.miscState.lastPaneClickLocation = null;
    hoisted.miscState.mouseDownDrawArea = false;
    hoisted.projectState.projectConfig.viewport = {
      x: 480,
      y: -320,
      zoom: 0.75,
    };
    hoisted.projectState.projectConfig.viewportInitialized = true;
    hoisted.nodeInternals = new Map();
    hoisted.layoutSections = [{ sectionId: "layout-a" }];
    hoisted.reactFlowSelectorState.nodeDragThreshold = 8;
    hoisted.reactFlowSelectorState.zoomActivationKeyPressed = true;
    hoisted.sections = [{ sectionId: "section-a" }];
    hoisted.settingsState.gui.defaultZoomLevel = 1.25;
    hoisted.settingsState.gui.maxZoom = 4;
    hoisted.settingsState.gui.minZoom = 0.1;
    hoisted.settingsState.gui.panOnScroll = true;
    hoisted.settingsState.gui.panOnScrollMode = "free";
    hoisted.settingsState.gui.panOnScrollSpeed = 1.5;
    hoisted.settingsState.gui.showGridLines = true;
    hoisted.settingsState.gui.snapGrid = [16, 24];
    hoisted.settingsState.gui.zoomOnPinch = true;
    hoisted.settingsState.gui.zoomOnScroll = false;
    hoisted.surfaceRuntime.draggingSectionId = "section-a";
    hoisted.surfaceRuntime.finishPanePan.mockReset();
    hoisted.surfaceRuntime.handlePanePointerDown.mockReset();
    hoisted.surfaceRuntime.handlePanePointerMove.mockReset();
    hoisted.surfaceRuntime.handlePaneWheel.mockReset();
    hoisted.surfaceRuntime.isViewportPanning = true;
    hoisted.surfaceRuntime.resolvedViewport = {
      x: 120,
      y: -44,
      zoom: 1.4,
    };
    hoisted.surfaceRuntime.sceneSnapshot = {
      sections: [{ sectionId: "section-a" }],
    };
    hoisted.useMiscSetState.mockClear();
    hoisted.useReactFlowSetState.mockClear();
    vi.mocked(applyActiveSectionChange).mockClear();
    vi.mocked(resolveSettingsGraphSubstrateCanarySections).mockClear();
    vi.mocked(screenToFlowPosition).mockClear();
    vi.mocked(useTabScope).mockClear();
    vi.mocked(useSettingsGraphSubstrateCanarySurfaceRuntime).mockClear();

    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
  });

  it("selects the canary runtime inputs and exposes derived view props from one controller boundary", async () => {
    await act(async () => {
      root.render(<ControllerProbe />);
    });

    const scopeArgs = vi.mocked(useTabScope).mock.calls[0]?.[0];
    const resolvedSectionsArgs = vi.mocked(
      resolveSettingsGraphSubstrateCanarySections,
    ).mock.calls[0];
    const runtimeArgs = vi.mocked(useSettingsGraphSubstrateCanarySurfaceRuntime)
      .mock.calls[0]?.[0];

    expect(resolvedSectionsArgs?.[0]).toEqual(hoisted.layoutSections);
    expect(resolvedSectionsArgs?.[1]).toEqual(
      new Map([["layout-a", undefined]]),
    );
    expect(runtimeArgs).toEqual(
      expect.objectContaining({
        defaultZoomLevel: 1.25,
        maxZoom: 4,
        minZoom: 0.1,
        nodeDragThreshold: 8,
        overviewTrueWidth: 420,
        panOnScroll: true,
        panOnScrollMode: "free",
        panOnScrollSpeed: 1.5,
        sections: hoisted.sections,
        sharedProjectViewport: { x: 480, y: -320, zoom: 0.75 },
        snapGrid: [16, 24],
        snapToGrid: true,
        uiEditorTrueWidth: 260,
        zoomActivationKeyPressed: true,
        zoomOnPinch: true,
        zoomOnScroll: false,
      }),
    );
    expect(scopeArgs?.rootRef).toBe(runtimeArgs?.rootRef);
    expect(readProbe(host).dataset.cursor).toBe("grabbing");
    expect(readProbe(host).dataset.transform).toBe(
      "translate(120px, -44px) scale(1.4)",
    );
  });

  it("uses authoritative shared node internals when recomputing sections", async () => {
    hoisted.nodeInternals = new Map([
      [
        "layout-a",
        {
          width: 420,
          height: 315,
          sizeAuthority: "sharedNode",
        },
      ],
    ]);

    await act(async () => {
      root.render(<ControllerProbe />);
    });

    const resolvedSectionsArgs = vi.mocked(
      resolveSettingsGraphSubstrateCanarySections,
    ).mock.calls[0];
    const currentNodeInternals = resolvedSectionsArgs?.[1] as
      | ReadonlyMap<
          string,
          | {
              height?: number | null;
              sizeAuthority?: string;
              width?: number | null;
            }
          | undefined
        >
      | undefined;

    expect(currentNodeInternals).toBeDefined();
    expect(currentNodeInternals?.get("layout-a")).toEqual({
      width: 420,
      height: 315,
      sizeAuthority: "sharedNode",
    });
  });

  it("starts from empty authoritative node internals when no shared node size exists yet", async () => {
    await act(async () => {
      root.render(<ControllerProbe />);
    });

    const resolvedSectionsArgs = vi.mocked(
      resolveSettingsGraphSubstrateCanarySections,
    ).mock.calls[0];

    expect(resolvedSectionsArgs?.[1]).toEqual(
      new Map([["layout-a", undefined]]),
    );
  });

  it("routes pane background clicks through the controller-owned pane click handler", async () => {
    await act(async () => {
      root.render(<ControllerProbe />);
    });

    act(() => {
      readProbe(host).dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          clientX: 320,
          clientY: 140,
        }),
      );
    });

    expect(applyActiveSectionChange).toHaveBeenCalledWith({
      interaction: "pane-click",
    });
    expect(screenToFlowPosition).toHaveBeenCalledWith({
      x: 320,
      y: 140,
    });
    expect(useMisc.getState().lastPaneClickLocation).toEqual({
      x: 310,
      y: 145,
    });
    expect(hoisted.useReactFlowSetState).toHaveBeenCalledWith({
      nodesSelectionDims: null,
    });
  });

  it("clears draw-area clicks without firing pane selection side effects", async () => {
    hoisted.miscState.mouseDownDrawArea = true;

    await act(async () => {
      root.render(<ControllerProbe />);
    });

    act(() => {
      readProbe(host).dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          clientX: 220,
          clientY: 110,
        }),
      );
    });

    expect(useMisc.getState().mouseDownDrawArea).toBe(false);
    expect(hoisted.useMiscSetState).toHaveBeenCalledWith({
      mouseDownDrawArea: false,
    });
    expect(applyActiveSectionChange).not.toHaveBeenCalled();
    expect(screenToFlowPosition).not.toHaveBeenCalled();
    expect(hoisted.useReactFlowSetState).not.toHaveBeenCalled();
  });
});

describe("resolveSettingsGraphSubstrateCanaryViewportTransform", () => {
  it("omits the transform when the viewport is unresolved", () => {
    expect(
      resolveSettingsGraphSubstrateCanaryViewportTransform(null),
    ).toBeUndefined();
  });
});

function readProbe(hostElement: HTMLDivElement): HTMLDivElement {
  const probe = hostElement.querySelector('[data-testid="controller-probe"]');
  if (!(probe instanceof HTMLDivElement)) {
    throw new Error("Expected controller probe element.");
  }
  return probe;
}
