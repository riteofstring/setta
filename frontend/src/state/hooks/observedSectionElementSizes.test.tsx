/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useSectionRefs } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useObservedSectionElementSizes } from "./observedSectionElementSizes";

type ResizeObserverController = {
  trigger: (elements: Array<HTMLElement>) => Promise<void>;
};

type MeasuredElementController = {
  element: HTMLElement;
  setSize: (nextSize: { width: number; height: number }) => void;
};

function ObservedSectionSizesProbe({
  sectionIds,
}: {
  sectionIds: Array<string>;
}) {
  const observedSectionElementSizes =
    useObservedSectionElementSizes(sectionIds);

  return (
    <div
      data-testid="observed-section-sizes-probe"
      data-sizes={JSON.stringify(observedSectionElementSizes)}
    />
  );
}

describe("useObservedSectionElementSizes", () => {
  let host: HTMLDivElement;
  let root: Root;
  let resizeObserverController: ResizeObserverController;

  beforeEach(() => {
    resetProjectStores();
    resizeObserverController = installResizeObserverMock();
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
  });

  it("observes shared section shell refs and updates sizes after resize notifications", async () => {
    await act(async () => {
      root.render(<ObservedSectionSizesProbe sectionIds={["section-a"]} />);
    });

    const sectionElement = createMeasuredElement({
      width: 240,
      height: 160,
    });
    act(() => {
      useSectionRefs.setState((state) => {
        state.selfOnly["section-a"] = sectionElement.element;
      });
    });

    await vi.waitFor(() => {
      expect(readObservedSizes(host)).toEqual({
        "section-a": { width: 240, height: 160 },
      });
    });

    sectionElement.setSize({ width: 320, height: 210 });
    await resizeObserverController.trigger([sectionElement.element]);

    await vi.waitFor(() => {
      expect(readObservedSizes(host)).toEqual({
        "section-a": { width: 320, height: 210 },
      });
    });
  });

  it("keeps the last positive size until the shared section ref is removed", async () => {
    await act(async () => {
      root.render(<ObservedSectionSizesProbe sectionIds={["section-a"]} />);
    });

    const sectionElement = createMeasuredElement({
      width: 280,
      height: 180,
    });
    act(() => {
      useSectionRefs.setState((state) => {
        state.selfOnly["section-a"] = sectionElement.element;
      });
    });

    await vi.waitFor(() => {
      expect(readObservedSizes(host)).toEqual({
        "section-a": { width: 280, height: 180 },
      });
    });

    sectionElement.setSize({ width: 0, height: 0 });
    await resizeObserverController.trigger([sectionElement.element]);

    expect(readObservedSizes(host)).toEqual({
      "section-a": { width: 280, height: 180 },
    });

    act(() => {
      useSectionRefs.setState((state) => {
        delete state.selfOnly["section-a"];
      });
    });

    await vi.waitFor(() => {
      expect(readObservedSizes(host)).toEqual({});
    });
  });
});

function installResizeObserverMock(): ResizeObserverController {
  const callbacks = new Set<ResizeObserverCallback>();

  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserverMock {
      private callback: ResizeObserverCallback;

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        callbacks.add(callback);
      }

      observe() {}

      unobserve() {}

      disconnect() {
        callbacks.delete(this.callback);
      }
    },
  );

  return {
    trigger: async (elements) => {
      const entries = elements.map((element) => {
        return { target: element } as ResizeObserverEntry;
      });
      await act(async () => {
        callbacks.forEach((callback) =>
          callback(entries, {} as ResizeObserver),
        );
      });
    },
  };
}

function createMeasuredElement(initialSize: {
  width: number;
  height: number;
}): MeasuredElementController {
  const element = document.createElement("section");
  let size = initialSize;

  Object.defineProperty(element, "offsetWidth", {
    configurable: true,
    get() {
      return size.width;
    },
  });
  Object.defineProperty(element, "offsetHeight", {
    configurable: true,
    get() {
      return size.height;
    },
  });

  return {
    element,
    setSize: (nextSize) => {
      size = nextSize;
    },
  };
}

function readObservedSizes(hostElement: HTMLDivElement) {
  const probe = hostElement.querySelector(
    '[data-testid="observed-section-sizes-probe"]',
  );
  if (!(probe instanceof HTMLDivElement)) {
    throw new Error("Expected observed section sizes probe.");
  }
  const sizesAttribute = probe.getAttribute("data-sizes");
  if (!sizesAttribute) {
    throw new Error("Expected observed section sizes attribute.");
  }
  return JSON.parse(sizesAttribute) as Record<
    string,
    { width: number; height: number }
  >;
}
