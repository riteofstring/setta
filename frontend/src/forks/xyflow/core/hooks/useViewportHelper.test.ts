import { useReactFlow } from "forks/xyflow/core/store";
import { useSettings } from "state/definitions";
import { createSettingsState } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
});
