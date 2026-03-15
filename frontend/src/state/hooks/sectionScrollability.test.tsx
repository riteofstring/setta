/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useIsScrollable } from "./sectionScrollability";

type ResizeObserverController = {
  callback: ResizeObserverCallback;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

type MutationObserverController = {
  callback: MutationCallback;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

function installObserverMocks() {
  const resizeObservers: ResizeObserverController[] = [];
  const mutationObservers: MutationObserverController[] = [];

  class ResizeObserverMock {
    observe = vi.fn();
    disconnect = vi.fn();

    constructor(callback: ResizeObserverCallback) {
      resizeObservers.push({
        callback,
        observe: this.observe,
        disconnect: this.disconnect,
      });
    }
  }

  class MutationObserverMock {
    observe = vi.fn();
    disconnect = vi.fn();

    constructor(callback: MutationCallback) {
      mutationObservers.push({
        callback,
        observe: this.observe,
        disconnect: this.disconnect,
      });
    }
  }

  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  vi.stubGlobal("MutationObserver", MutationObserverMock);

  return { resizeObservers, mutationObservers };
}

function Probe({
  onMeasure,
}: {
  onMeasure: (element: HTMLDivElement) => void;
}) {
  const { ref, isScrollable } = useIsScrollable({ onMeasure });
  return <div ref={ref} data-scrollable={isScrollable ? "true" : "false"} />;
}

describe("useIsScrollable", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("observes size and content changes, reports measurements, and disconnects on unmount", async () => {
    const { resizeObservers, mutationObservers } = installObserverMocks();
    const onMeasure = vi.fn();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root: Root = createRoot(host);

    await act(async () => {
      root.render(<Probe onMeasure={onMeasure} />);
    });

    const element = host.querySelector("div");
    if (!(element instanceof HTMLDivElement)) {
      throw new Error("Expected probe element to render.");
    }

    expect(resizeObservers).toHaveLength(1);
    expect(resizeObservers[0].observe).toHaveBeenCalledWith(element);
    expect(mutationObservers).toHaveLength(1);
    expect(mutationObservers[0].observe).toHaveBeenCalledWith(element, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });

    Object.defineProperties(element, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 140 },
      clientWidth: { configurable: true, value: 120 },
      scrollWidth: { configurable: true, value: 120 },
    });

    await act(async () => {
      resizeObservers[0].callback([], {} as ResizeObserver);
    });

    expect(element.dataset.scrollable).toBe("true");
    expect(onMeasure).toHaveBeenCalledWith(element);

    await act(async () => {
      root.unmount();
    });

    expect(resizeObservers[0].disconnect).toHaveBeenCalled();
    expect(mutationObservers[0].disconnect).toHaveBeenCalled();
  });
});
