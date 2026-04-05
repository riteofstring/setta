import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReactFlow } from ".";

describe("reactFlow store", () => {
  const initialState = useReactFlow.getState();

  beforeEach(() => {
    useReactFlow.setState({
      ...initialState,
      d3Selection: null,
      d3Zoom: null,
      transform: [10, 20, 1.5],
    });
  });

  afterEach(() => {
    useReactFlow.setState({ ...initialState });
  });

  it("delegates panBy to the custom viewport controller when legacy d3 state is absent", () => {
    // Validates shared programmatic pan commands compose on the canary surface.
    const panBySpy = vi.fn(() => true);

    useReactFlow.setState({
      viewportController: {
        panBy: panBySpy,
        zoomBy: vi.fn(),
        zoomTo: vi.fn(),
        setViewport: vi.fn(),
        setCenter: vi.fn(),
        fitView: vi.fn(() => true),
      },
    });

    expect(useReactFlow.getState().panBy({ x: -60, y: 30 })).toBe(true);
    expect(panBySpy).toHaveBeenCalledWith({ x: -60, y: 30 });
  });
});
