import { useReactFlow } from "forks/xyflow/core/store";
import initialState from "forks/xyflow/core/store/initialState";
import { gpuFlowViewportStore } from "gpuFlow/viewportStore";
import { useNodeInternals } from "state/definitions";
import { beforeEach, describe, expect, it } from "vitest";
import {
  fitGpuViewportShortcut,
  getIgnoreWhenInInputField,
  getShouldPreventDefault,
  getTabParamActionForShortcuts,
  parseShortcut,
} from "./keyActivations";

describe("key activation shortcut policy", () => {
  beforeEach(() => {
    useNodeInternals.setState({ x: new Map() });
    useReactFlow.setState({
      ...initialState,
      fitViewOnInit: false,
      fitViewOnInitDone: true,
      transform: [0, 0, 1],
    });
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
    expect(useReactFlow.getState().fitViewOnInit).toBe(true);
  });

  it("does not run the GPU fit-view shortcut while auto-fit is already active", () => {
    useReactFlow.setState({ fitViewOnInit: true });

    expect(fitGpuViewportShortcut()).toBe(false);
    expect(gpuFlowViewportStore.getState().transform).toEqual([0, 0, 1]);
  });
});
