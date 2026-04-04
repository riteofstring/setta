import { useSettings } from "state/definitions";
import { createSettingsState } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReactFlow } from ".";
import { fitView, onFitViewHandler } from "./utils";

describe("store utils", () => {
  const initialState = useReactFlow.getState();

  beforeEach(() => {
    useSettings.setState(createSettingsState());
    useReactFlow.setState({
      ...initialState,
      d3Zoom: null,
      d3Selection: null,
      height: 600,
      transform: [10, 20, 1.5],
      width: 900,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    useReactFlow.setState({ ...initialState });
  });

  it("delegates to the custom viewport controller when the legacy d3 viewport is absent", () => {
    // Validates fit-view toolbar actions stay functional on the canary surface.
    const fitViewSpy = vi.fn(() => true);

    useReactFlow.setState({
      viewportController: {
        zoomBy: vi.fn(),
        zoomTo: vi.fn(),
        setViewport: vi.fn(),
        setCenter: vi.fn(),
        fitView: fitViewSpy,
      },
    });

    expect(fitView({ duration: 100 })).toBe(true);
    expect(fitViewSpy).toHaveBeenCalledWith({ duration: 100 });
  });

  it("lets explicit fit-view clicks run on the custom substrate even when fitViewOnInit is still true", () => {
    // Validates the canary toolbar is not blocked by the legacy init guard.
    vi.useFakeTimers();
    const fitViewSpy = vi.fn(() => true);

    useReactFlow.setState({
      fitViewOnInit: true,
      fitViewOnInitDone: true,
      viewportController: {
        zoomBy: vi.fn(),
        zoomTo: vi.fn(),
        setViewport: vi.fn(),
        setCenter: vi.fn(),
        fitView: fitViewSpy,
      },
    });

    onFitViewHandler();

    expect(fitViewSpy).toHaveBeenCalledWith({
      duration: useSettings.getState().gui.transitionDuration,
    });
    vi.runAllTimers();
    expect(useReactFlow.getState().fitViewOnInit).toBe(true);
  });
});
