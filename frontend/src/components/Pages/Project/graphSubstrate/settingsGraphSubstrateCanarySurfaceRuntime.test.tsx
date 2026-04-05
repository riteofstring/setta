/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { PanOnScrollModeEnum } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphSubstrateCanarySection } from "./settingsGraphSubstrateCanaryModel";
import { createSettingsGraphSubstrateCanaryPaneInteractionController } from "./settingsGraphSubstrateCanaryPaneInteractionController";
import { useSettingsGraphSubstrateCanarySceneRuntime } from "./settingsGraphSubstrateCanarySceneRuntime";
import type { SettingsGraphSubstrateCanarySceneSnapshot } from "./settingsGraphSubstrateCanarySceneSnapshot";
import { createEmptySettingsGraphSubstrateCanarySceneSnapshot } from "./settingsGraphSubstrateCanarySceneSnapshot";
import { createSettingsGraphSubstrateCanarySectionDragController } from "./settingsGraphSubstrateCanarySectionDragController";
import { useSettingsGraphSubstrateCanarySurfaceRuntime } from "./settingsGraphSubstrateCanarySurfaceRuntime";
import {
  useSettingsGraphSubstrateCanaryViewportRuntime,
  type SettingsGraphSubstrateCanaryViewportRuntime,
} from "./settingsGraphSubstrateCanaryViewportRuntime";

vi.mock("./settingsGraphSubstrateCanarySceneRuntime", () => ({
  useSettingsGraphSubstrateCanarySceneRuntime: vi.fn(),
}));

vi.mock("./settingsGraphSubstrateCanaryViewportRuntime", () => ({
  useSettingsGraphSubstrateCanaryViewportRuntime: vi.fn(),
}));

vi.mock("./settingsGraphSubstrateCanaryPaneInteractionController", () => ({
  createSettingsGraphSubstrateCanaryPaneInteractionController: vi.fn(),
}));

vi.mock("./settingsGraphSubstrateCanarySectionDragController", () => ({
  createSettingsGraphSubstrateCanarySectionDragController: vi.fn(),
}));

type SectionDragControllerDependencies = Parameters<
  typeof createSettingsGraphSubstrateCanarySectionDragController
>[0];

function SurfaceRuntimeProbe({
  sections = [createSection()],
}: {
  sections?: Array<GraphSubstrateCanarySection>;
}) {
  const rootRef = { current: null as HTMLDivElement | null };
  const runtime = useSettingsGraphSubstrateCanarySurfaceRuntime({
    defaultZoomLevel: 1,
    maxZoom: 4,
    minZoom: 0.1,
    nodeDragThreshold: 8,
    overviewTrueWidth: 420,
    panOnScroll: true,
    panOnScrollMode: PanOnScrollModeEnum.free,
    panOnScrollSpeed: 1,
    rootRef,
    sections,
    sharedProjectViewport: null,
    snapGrid: [25, 10],
    snapToGrid: true,
    uiEditorTrueWidth: 260,
    zoomActivationKeyPressed: false,
    zoomOnPinch: true,
    zoomOnScroll: true,
  });

  return (
    <div
      ref={(element) => {
        rootRef.current = element;
      }}
      data-dragging={runtime.draggingSectionId ?? ""}
      data-testid="surface-runtime-probe"
      onPointerCancel={runtime.finishPanePan}
      onPointerDown={runtime.handlePanePointerDown}
      onPointerMove={runtime.handlePanePointerMove}
      onPointerUp={runtime.finishPanePan}
      onWheel={runtime.handlePaneWheel}
    />
  );
}

describe("useSettingsGraphSubstrateCanarySurfaceRuntime", () => {
  let host: HTMLDivElement;
  let root: Root;
  let currentSceneSnapshot: SettingsGraphSubstrateCanarySceneSnapshot;
  let currentViewportRuntime: SettingsGraphSubstrateCanaryViewportRuntime;
  let paneInteractionController: {
    cleanup: ReturnType<typeof vi.fn>;
    finishPanePan: ReturnType<typeof vi.fn>;
    handlePanePointerDown: ReturnType<typeof vi.fn>;
    handlePanePointerMove: ReturnType<typeof vi.fn>;
    handlePaneWheel: ReturnType<typeof vi.fn>;
  };
  let sectionDragController: {
    cancelSectionDrag: ReturnType<typeof vi.fn>;
    cleanup: ReturnType<typeof vi.fn>;
    finishSectionDrag: ReturnType<typeof vi.fn>;
    handleSectionPointerDown: ReturnType<typeof vi.fn>;
    handleSectionPointerMove: ReturnType<typeof vi.fn>;
  };
  let sectionDragDependencies: SectionDragControllerDependencies | null;

  beforeEach(() => {
    vi.stubGlobal("PointerEvent", MouseEvent);
    currentSceneSnapshot = createSceneSnapshot();
    currentViewportRuntime = createViewportRuntime();
    paneInteractionController = {
      cleanup: vi.fn(),
      finishPanePan: vi.fn().mockReturnValue(false),
      handlePanePointerDown: vi.fn().mockReturnValue(false),
      handlePanePointerMove: vi.fn().mockReturnValue(false),
      handlePaneWheel: vi.fn().mockReturnValue(false),
    };
    sectionDragController = {
      cancelSectionDrag: vi.fn(),
      cleanup: vi.fn(),
      finishSectionDrag: vi.fn().mockReturnValue(false),
      handleSectionPointerDown: vi.fn().mockReturnValue(false),
      handleSectionPointerMove: vi.fn().mockReturnValue(false),
    };
    sectionDragDependencies = null;

    vi.mocked(useSettingsGraphSubstrateCanarySceneRuntime).mockImplementation(
      () => currentSceneSnapshot,
    );
    vi.mocked(
      useSettingsGraphSubstrateCanaryViewportRuntime,
    ).mockImplementation(() => currentViewportRuntime);
    vi.mocked(
      createSettingsGraphSubstrateCanaryPaneInteractionController,
    ).mockReturnValue(paneInteractionController);
    vi.mocked(
      createSettingsGraphSubstrateCanarySectionDragController,
    ).mockImplementation((dependencies) => {
      sectionDragDependencies = dependencies;
      return sectionDragController;
    });

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
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("cancels an active drag when the authoritative scene snapshot drops that section", async () => {
    await act(async () => {
      root.render(<SurfaceRuntimeProbe />);
    });

    expect(sectionDragDependencies).not.toBeNull();

    act(() => {
      sectionDragDependencies?.onDraggingSectionIdChange("section-a");
    });

    currentSceneSnapshot = createSceneSnapshot({ sectionIds: ["section-b"] });

    await act(async () => {
      root.render(<SurfaceRuntimeProbe />);
    });

    expect(sectionDragController.cancelSectionDrag).toHaveBeenCalledTimes(1);
  });

  it("cleans up the pane and drag controllers on unmount", async () => {
    await act(async () => {
      root.render(<SurfaceRuntimeProbe />);
    });

    await act(async () => {
      root.unmount();
    });

    expect(paneInteractionController.cleanup).toHaveBeenCalledTimes(1);
    expect(sectionDragController.cleanup).toHaveBeenCalledTimes(1);
  });

  it("delegates pane pointer and wheel events through the extracted controllers", async () => {
    paneInteractionController.handlePanePointerDown.mockReturnValue(true);
    paneInteractionController.handlePanePointerMove.mockReturnValue(true);
    paneInteractionController.finishPanePan.mockReturnValue(true);
    paneInteractionController.handlePaneWheel.mockReturnValue(true);

    await act(async () => {
      root.render(<SurfaceRuntimeProbe />);
    });

    const probe = readProbe(host);
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.defineProperty(probe, "setPointerCapture", {
      value: setPointerCapture,
    });
    Object.defineProperty(probe, "releasePointerCapture", {
      value: releasePointerCapture,
    });
    Object.defineProperty(probe, "hasPointerCapture", {
      value: () => true,
    });

    const pointerDown = new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: 120,
      clientY: 140,
    });
    Object.defineProperty(pointerDown, "pointerId", { value: 7 });
    act(() => {
      probe.dispatchEvent(pointerDown);
    });

    expect(
      paneInteractionController.handlePanePointerDown,
    ).toHaveBeenCalledWith({
      button: 0,
      clientX: 120,
      clientY: 140,
      pointerId: 7,
      target: probe,
    });
    expect(pointerDown.defaultPrevented).toBe(true);
    expect(setPointerCapture).toHaveBeenCalledWith(7);

    const pointerMove = new PointerEvent("pointermove", {
      bubbles: true,
      cancelable: true,
      clientX: 180,
      clientY: 210,
    });
    Object.defineProperty(pointerMove, "pointerId", { value: 7 });
    act(() => {
      probe.dispatchEvent(pointerMove);
    });

    expect(
      paneInteractionController.handlePanePointerMove,
    ).toHaveBeenCalledWith({
      clientX: 180,
      clientY: 210,
      pointerId: 7,
    });
    expect(pointerMove.defaultPrevented).toBe(true);

    const pointerUp = new PointerEvent("pointerup", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(pointerUp, "pointerId", { value: 7 });
    act(() => {
      probe.dispatchEvent(pointerUp);
    });

    expect(paneInteractionController.finishPanePan).toHaveBeenCalledWith({
      pointerId: 7,
    });
    expect(releasePointerCapture).toHaveBeenCalledWith(7);

    const wheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 300,
      clientY: 340,
      ctrlKey: false,
      deltaMode: 0,
      deltaX: 24,
      deltaY: -32,
      shiftKey: true,
    });
    act(() => {
      probe.dispatchEvent(wheelEvent);
    });

    expect(paneInteractionController.handlePaneWheel).toHaveBeenCalledWith({
      clientX: 300,
      clientY: 340,
      ctrlKey: false,
      deltaMode: 0,
      deltaX: 24,
      deltaY: -32,
      shiftKey: true,
      target: probe,
    });
  });
});

function createSection(
  overrides: Partial<GraphSubstrateCanarySection> = {},
): GraphSubstrateCanarySection {
  return {
    height: 160,
    position: { x: 120, y: 80 },
    positionAndSizeLocked: false,
    sectionId: "section-a",
    tempZIndex: 2,
    width: 240,
    zIndex: 2,
    ...overrides,
  };
}

function createSceneSnapshot({
  sectionIds = ["section-a"],
}: {
  sectionIds?: string[];
} = {}): SettingsGraphSubstrateCanarySceneSnapshot {
  if (sectionIds.length === 0) {
    return createEmptySettingsGraphSubstrateCanarySceneSnapshot();
  }
  const sections = sectionIds.map((sectionId, index) => {
    const layoutSection = createSection({
      position: { x: 120 + index * 280, y: 80 },
      sectionId,
    });
    return {
      ...layoutSection,
      renderedPosition: layoutSection.position,
      resolvedSize: { width: 240, height: 160 },
      sceneBoundsSize: { width: 240, height: 160 },
    };
  });
  return {
    sceneBounds: {
      x: sections[0]?.renderedPosition.x ?? 0,
      y: 80,
      width: sections.length * 240,
      height: 160,
    },
    sections,
    sectionsById: new Map(
      sections.map((section) => [section.sectionId, section]),
    ),
  };
}

function createViewportRuntime(): SettingsGraphSubstrateCanaryViewportRuntime {
  return {
    applyControlledViewportChange: vi.fn(),
    commitLocalViewport: vi.fn(),
    getResolvedViewport: () => null,
    getRootBounds: () => null,
    isViewportPanning: false,
    onViewportPanningChange: vi.fn(),
    resolvedViewport: null,
    syncViewportInteractionState: vi.fn(),
  };
}

function readProbe(host: HTMLElement) {
  const probe = host.querySelector("[data-testid='surface-runtime-probe']");
  if (!(probe instanceof HTMLDivElement)) {
    throw new Error("Expected surface runtime probe.");
  }
  return probe;
}
