/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  attachParamFixedHeightObservers,
  getParamFixedHeightElements,
} from "./paramFixedHeightObservers";

describe("param fixed-height observers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("collects only direct fixed-height children", () => {
    const outer = document.createElement("div");
    const directFixed = document.createElement("section");
    directFixed.dataset.paramsFixed = "true";
    const wrapper = document.createElement("div");
    const nestedFixed = document.createElement("section");
    nestedFixed.dataset.paramsFixed = "true";
    wrapper.append(nestedFixed);
    outer.append(directFixed, wrapper);

    expect(getParamFixedHeightElements(outer)).toEqual([directFixed]);
  });

  it("observes direct child changes and resizes for fixed-height children", () => {
    const resizeObservers: Array<{
      disconnect: ReturnType<typeof vi.fn>;
      observe: ReturnType<typeof vi.fn>;
      unobserve: ReturnType<typeof vi.fn>;
    }> = [];
    const mutationObservers: Array<{
      disconnect: ReturnType<typeof vi.fn>;
      observe: ReturnType<typeof vi.fn>;
    }> = [];

    class ResizeObserverMock {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();

      constructor(_callback: ResizeObserverCallback) {
        resizeObservers.push(this);
      }
    }

    class MutationObserverMock {
      observe = vi.fn();
      disconnect = vi.fn();

      constructor(_callback: MutationCallback) {
        mutationObservers.push(this);
      }
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    vi.stubGlobal("MutationObserver", MutationObserverMock);

    const outer = document.createElement("div");
    const firstFixed = document.createElement("section");
    firstFixed.dataset.paramsFixed = "true";
    const nestedWrapper = document.createElement("div");
    const nestedFixed = document.createElement("section");
    nestedFixed.dataset.paramsFixed = "true";
    nestedWrapper.append(nestedFixed);
    outer.append(firstFixed, nestedWrapper);

    const observation = attachParamFixedHeightObservers({
      outerElement: outer,
      onMeasure: vi.fn(),
    });

    expect(mutationObservers).toHaveLength(1);
    expect(mutationObservers[0].observe).toHaveBeenCalledWith(outer, {
      childList: true,
    });

    expect(observation.collectFixedElements()).toEqual([firstFixed]);
    expect(resizeObservers).toHaveLength(1);
    expect(resizeObservers[0].observe).toHaveBeenCalledWith(firstFixed);
    expect(
      resizeObservers[0].observe.mock.calls.some(
        ([element]) => element === nestedFixed,
      ),
    ).toBe(false);

    const secondFixed = document.createElement("section");
    secondFixed.dataset.paramsFixed = "true";
    firstFixed.remove();
    outer.append(secondFixed);

    expect(observation.collectFixedElements()).toEqual([secondFixed]);
    expect(resizeObservers[0].unobserve).toHaveBeenCalledWith(firstFixed);
    expect(resizeObservers[0].observe).toHaveBeenCalledWith(secondFixed);

    observation.disconnect();

    expect(resizeObservers[0].disconnect).toHaveBeenCalled();
    expect(mutationObservers[0].disconnect).toHaveBeenCalled();
  });
});
