import { gpuFlowViewportStore } from "gpuFlow/viewportStore";
import {
  useLocalStorage,
  useNodeInternals,
  useSettings,
} from "state/definitions";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fitGpuViewportShortcut,
  getIgnoreWhenInInputField,
  getShouldPreventDefault,
  getTabParamActionForShortcuts,
  parseShortcut,
} from "./keyActivations";

describe("key activation shortcut policy", () => {
  beforeEach(() => {
    useSettings.setState((state) => ({
      gui: { ...state.gui, transitionDuration: 0 },
    }));
    useNodeInternals.setState({ x: new Map() });
    gpuFlowViewportStore.getState().setViewportSize({
      height: 300,
      width: 500,
    });
    gpuFlowViewportStore.getState().setZoomBounds({
      defaultZoom: 1,
      maxZoom: 4,
      minZoom: 0.25,
    });
    gpuFlowViewportStore.getState().setTransform([0, 0, 1]);
    gpuFlowViewportStore.getState().setSelectionKeyPressed(false);
    gpuFlowViewportStore.getState().setMultiSelectionActive(false);
    gpuFlowViewportStore.getState().setPanActivationKeyPressed(false);
    gpuFlowViewportStore.getState().setZoomActivationKeyPressed(false);
    gpuFlowViewportStore.getState().setMoveSectionActivationKeyPressed(false);
    gpuFlowViewportStore.getState().setFitViewInitializationState({
      fitViewOnInit: false,
      fitViewOnInitDone: true,
      fitViewOnInitOptions: undefined,
    });
    gpuFlowViewportStore.getState().resetUserSelection();
    useLocalStorage.setState({
      overviewTrueWidth: 0,
      uiEditorTrueWidth: 0,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not prevent default copy or paste shortcuts", () => {
    expect(getShouldPreventDefault(parseShortcut("mod + c"))).toBe(false);
    expect(getShouldPreventDefault(parseShortcut("mod + v"))).toBe(false);
    expect(getShouldPreventDefault(parseShortcut("mod + p"))).toBe(true);
  });

  it("ignores plain typing and editor-navigation shortcuts inside macOS inputs", () => {
    expect(getIgnoreWhenInInputField(parseShortcut("k"), true)).toBe(true);
    expect(
      getIgnoreWhenInInputField(parseShortcut("mod + shift + z"), true),
    ).toBe(true);
    expect(
      getIgnoreWhenInInputField(parseShortcut("mod + shift + p"), true),
    ).toBe(false);
  });

  it("ignores ctrl-or-mod text editing shortcuts inside Windows inputs", () => {
    expect(
      getIgnoreWhenInInputField(parseShortcut("ctrl + shift + v"), false),
    ).toBe(true);
    expect(getIgnoreWhenInInputField(parseShortcut("mod + end"), false)).toBe(
      true,
    );
    expect(
      getIgnoreWhenInInputField(parseShortcut("ctrl + shift + p"), false),
    ).toBe(false);
  });

  it("never ignores tab or escape shortcuts inside inputs", () => {
    expect(getIgnoreWhenInInputField(parseShortcut("tab"), true)).toBe(false);
    expect(getIgnoreWhenInInputField(parseShortcut("shift + tab"), false)).toBe(
      false,
    );
    expect(getIgnoreWhenInInputField(parseShortcut("escape"), true)).toBe(
      false,
    );
  });

  it("prefers the shifted tab binding that matches the current key state", () => {
    expect(getTabParamActionForShortcuts("tab", "shift + tab", false)).toBe(
      "indent",
    );
    expect(getTabParamActionForShortcuts("tab", "shift + tab", true)).toBe(
      "unindent",
    );
  });

  it("falls back to the remaining matching tab binding when only one uses shift", () => {
    expect(getTabParamActionForShortcuts("shift + tab", "tab", false)).toBe(
      "unindent",
    );
    expect(getTabParamActionForShortcuts("shift + tab", "tab", true)).toBe(
      "indent",
    );
  });

  it("returns null when neither shortcut is tab-shaped for the current key state", () => {
    expect(getTabParamActionForShortcuts("mod + ]", "mod + [", false)).toBe(
      null,
    );
    expect(getTabParamActionForShortcuts("tab", "tab", true)).toBe(null);
  });

  it("fits measured nodes through the GPU viewport shortcut owner", () => {
    useNodeInternals.setState({
      x: new Map([
        [
          "section-a",
          {
            height: 100,
            id: "section-a",
            position: { x: 50, y: 25 },
            tempZIndex: 0,
            width: 200,
            zIndex: 0,
          },
        ],
      ]),
    });

    expect(fitGpuViewportShortcut()).toBe(true);

    const [x, y, zoom] = gpuFlowViewportStore.getState().transform;
    expect(x).toBeCloseTo(-90.909, 3);
    expect(y).toBeCloseTo(-20.455, 3);
    expect(zoom).toBeCloseTo(2.273, 3);
    expect(gpuFlowViewportStore.getState().fitViewOnInit).toBe(true);
    expect(gpuFlowViewportStore.getState().fitViewOnInitDone).toBe(true);
  });

  it("fits shortcut nodes into the visible pane when the overview is open", () => {
    useLocalStorage.setState({ overviewTrueWidth: 120 });
    useNodeInternals.setState({
      x: new Map([
        [
          "section-a",
          {
            height: 100,
            id: "section-a",
            position: { x: 50, y: 25 },
            tempZIndex: 0,
            width: 200,
            zIndex: 0,
          },
        ],
      ]),
    });

    expect(fitGpuViewportShortcut()).toBe(true);

    const [x, y, zoom] = gpuFlowViewportStore.getState().transform;
    expect(x).toBeCloseTo(29.091, 3);
    expect(y).toBeCloseTo(-20.455, 3);
    expect(zoom).toBeCloseTo(2.273, 3);
  });

  it("animates the GPU fit-view shortcut with the configured transition duration", () => {
    const animation = installAnimationFrameController();
    useSettings.setState((state) => ({
      gui: { ...state.gui, transitionDuration: 120 },
    }));
    useNodeInternals.setState({
      x: new Map([
        [
          "section-a",
          {
            height: 100,
            id: "section-a",
            position: { x: 50, y: 25 },
            tempZIndex: 0,
            width: 200,
            zIndex: 0,
          },
        ],
      ]),
    });

    expect(fitGpuViewportShortcut()).toBe(true);

    expect(gpuFlowViewportStore.getState().transform).toEqual([0, 0, 1]);
    expect(gpuFlowViewportStore.getState().viewportAnimating).toBe(true);
    expect(gpuFlowViewportStore.getState().fitViewOnInit).toBe(false);

    animation.flushNextFrame(0);
    animation.flushNextFrame(120);

    const [x, y, zoom] = gpuFlowViewportStore.getState().transform;
    expect(x).toBeCloseTo(-90.909, 3);
    expect(y).toBeCloseTo(-20.455, 3);
    expect(zoom).toBeCloseTo(2.273, 3);
    expect(gpuFlowViewportStore.getState().viewportAnimating).toBe(false);
    expect(gpuFlowViewportStore.getState().fitViewOnInit).toBe(true);
    expect(gpuFlowViewportStore.getState().fitViewOnInitDone).toBe(true);
  });

  it("does not run the GPU fit-view shortcut while auto-fit is already active", () => {
    gpuFlowViewportStore
      .getState()
      .setFitViewInitializationState({ fitViewOnInit: true });

    expect(fitGpuViewportShortcut()).toBe(false);
    expect(gpuFlowViewportStore.getState().transform).toEqual([0, 0, 1]);
  });
});

function installAnimationFrameController() {
  let nextFrameId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const frameId = nextFrameId;
    nextFrameId += 1;
    callbacks.set(frameId, callback);
    return frameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (frameId: number) => {
    callbacks.delete(frameId);
  });
  return {
    flushNextFrame(timestampMs: number) {
      const [frameId, callback] = callbacks.entries().next().value ?? [];
      if (!frameId || !callback) {
        throw new Error("No animation frame is pending.");
      }
      callbacks.delete(frameId);
      callback(timestampMs);
    },
  };
}
