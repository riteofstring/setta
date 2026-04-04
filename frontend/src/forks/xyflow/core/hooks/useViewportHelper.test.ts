import { useReactFlow } from "forks/xyflow/core/store";
import { useSettings } from "state/definitions";
import { createSettingsState } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetZoom, setCenter, updateMapPosition } from "./useViewportHelper";

describe("useViewportHelper", () => {
  const initialState = useReactFlow.getState();

  beforeEach(() => {
    useSettings.setState(createSettingsState());
    useReactFlow.setState({
      ...initialState,
      d3Zoom: null,
      d3Selection: null,
      transform: [10, 20, 1.5],
      width: 900,
      height: 600,
    });
  });

  afterEach(() => {
    useReactFlow.setState({ ...initialState });
  });

  it("ignores map position updates when the legacy d3 viewport is absent", () => {
    // Validates pane resize callbacks do not crash the graph-substrate canary.
    expect(() => updateMapPosition(120)).not.toThrow();
    expect(useReactFlow.getState().transform).toEqual([10, 20, 1.5]);
  });

  it("ignores center and zoom commands when no d3 viewport has mounted", () => {
    // Validates shared viewport helpers stay null-safe on custom-substrate routes.
    expect(() => {
      resetZoom();
      setCenter(320, 180, { zoom: 2 });
    }).not.toThrow();
    expect(useReactFlow.getState().transform).toEqual([10, 20, 1.5]);
  });

  it("delegates zoom and viewport commands to the custom substrate controller", () => {
    // Validates shared toolbar actions stay wired up on non-d3 graph surfaces.
    const zoomTo = vi.fn();
    const setCenterSpy = vi.fn();
    const setViewportSpy = vi.fn();

    useReactFlow.setState({
      viewportController: {
        zoomBy: vi.fn(),
        zoomTo,
        setViewport: setViewportSpy,
        setCenter: setCenterSpy,
        fitView: vi.fn(() => true),
      },
    });

    resetZoom();
    setCenter(320, 180, { zoom: 2 });
    updateMapPosition(120);

    expect(zoomTo).toHaveBeenCalledWith(1, { duration: 100 });
    expect(setCenterSpy).toHaveBeenCalledWith(320, 180, { zoom: 2 });
    expect(setViewportSpy).toHaveBeenCalledWith(
      { x: 130, y: 20, zoom: 1.5 },
      { duration: 100 },
    );
  });
});
