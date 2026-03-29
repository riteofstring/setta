import { useMisc } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getNodeUpdateInformationMock = vi.fn(() => []);
const updateNodeDimensionsMock = vi.fn(() => true);

vi.mock("./actions/nodeInternals", async () => {
  const actual = await vi.importActual<
    typeof import("./actions/nodeInternals")
  >("./actions/nodeInternals");
  return {
    ...actual,
    getNodeUpdateInformation: (...args: unknown[]) =>
      getNodeUpdateInformationMock(...args),
    updateNodeDimensions: (...args: unknown[]) =>
      updateNodeDimensionsMock(...args),
  };
});

import { processRequestedNodeDimensionsUpdate } from "./subscriptions";

describe("processRequestedNodeDimensionsUpdate", () => {
  beforeEach(() => {
    resetProjectStores();
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", ((
      callback: FrameRequestCallback,
    ) => {
      return globalThis.setTimeout(() => callback(0), 16);
    }) as typeof requestAnimationFrame);
    getNodeUpdateInformationMock.mockReset();
    getNodeUpdateInformationMock.mockReturnValue([]);
    updateNodeDimensionsMock.mockReset();
    updateNodeDimensionsMock.mockReturnValue(true);
    useMisc.setState({ requestUpdateNodeDimensions: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("requeues the request when the dimension pass is still blocked", () => {
    updateNodeDimensionsMock.mockReturnValue(false);

    processRequestedNodeDimensionsUpdate();

    expect(updateNodeDimensionsMock).toHaveBeenCalledWith([]);
    expect(useMisc.getState().requestUpdateNodeDimensions).toBe(false);

    vi.runAllTimers();

    expect(useMisc.getState().requestUpdateNodeDimensions).toBe(true);
  });

  it("clears the request once the dimension pass succeeds", () => {
    processRequestedNodeDimensionsUpdate();

    expect(useMisc.getState().requestUpdateNodeDimensions).toBe(false);

    vi.runAllTimers();

    expect(useMisc.getState().requestUpdateNodeDimensions).toBe(false);
  });
});
