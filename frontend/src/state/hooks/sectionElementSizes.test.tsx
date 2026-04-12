/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSectionElementSizes } from "./sectionElementSizes";
import { useSectionRefAndInit } from "./sectionRef";

type ResizeObserverController = {
  trigger: (elements: Array<HTMLElement>) => Promise<void>;
};

function SectionShellProbe({ sectionId }: { sectionId: string }) {
  const ref = useSectionRefAndInit(sectionId, "selfOnly");

  return <section data-testid={`section-shell-${sectionId}`} ref={ref} />;
}

function SectionElementSizesProbe({
  sectionIds,
}: {
  sectionIds: Array<string>;
}) {
  const sectionElementSizes = useSectionElementSizes(sectionIds);

  return (
    <div
      data-testid="section-element-sizes-probe"
      data-sizes={JSON.stringify(sectionElementSizes)}
    />
  );
}

describe("useSectionElementSizes", () => {
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

  it("publishes measured section shell sizes from the shared section-ref boundary", async () => {
    await act(async () => {
      root.render(
        <>
          <SectionShellProbe sectionId="section-a" />
          <SectionElementSizesProbe sectionIds={["section-a"]} />
        </>,
      );
    });

    const sectionElement = readSectionShellElement(host, "section-a");
    setMeasuredElementSize(sectionElement, {
      width: 240,
      height: 160,
    });

    await resizeObserverController.trigger([sectionElement]);

    await vi.waitFor(() => {
      expect(readSectionElementSizes(host)).toEqual({
        "section-a": { width: 240, height: 160 },
      });
    });

    setMeasuredElementSize(sectionElement, {
      width: 320,
      height: 210,
    });
    await resizeObserverController.trigger([sectionElement]);

    await vi.waitFor(() => {
      expect(readSectionElementSizes(host)).toEqual({
        "section-a": { width: 320, height: 210 },
      });
    });
  });

  it("keeps the last positive shared size when later resize samples are non-positive", async () => {
    await act(async () => {
      root.render(
        <>
          <SectionShellProbe sectionId="section-a" />
          <SectionElementSizesProbe sectionIds={["section-a"]} />
        </>,
      );
    });

    const sectionElement = readSectionShellElement(host, "section-a");
    setMeasuredElementSize(sectionElement, {
      width: 280,
      height: 180,
    });
    await resizeObserverController.trigger([sectionElement]);

    await vi.waitFor(() => {
      expect(readSectionElementSizes(host)).toEqual({
        "section-a": { width: 280, height: 180 },
      });
    });

    setMeasuredElementSize(sectionElement, {
      width: 0,
      height: 0,
    });
    await resizeObserverController.trigger([sectionElement]);

    expect(readSectionElementSizes(host)).toEqual({
      "section-a": { width: 280, height: 180 },
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

function readSectionShellElement(
  hostElement: HTMLDivElement,
  sectionId: string,
): HTMLElement {
  const sectionElement = hostElement.querySelector(
    `[data-testid="section-shell-${sectionId}"]`,
  );
  if (!(sectionElement instanceof HTMLElement)) {
    throw new Error("Expected section shell element.");
  }

  return sectionElement;
}

function setMeasuredElementSize(
  element: HTMLElement,
  size: { width: number; height: number },
) {
  let measuredSize = size;

  Object.defineProperty(element, "offsetWidth", {
    configurable: true,
    get() {
      return measuredSize.width;
    },
  });
  Object.defineProperty(element, "offsetHeight", {
    configurable: true,
    get() {
      return measuredSize.height;
    },
  });

  measuredSize = size;
}

function readSectionElementSizes(hostElement: HTMLDivElement) {
  const probe = hostElement.querySelector(
    '[data-testid="section-element-sizes-probe"]',
  );
  if (!(probe instanceof HTMLDivElement)) {
    throw new Error("Expected section element sizes probe.");
  }

  const sizesAttribute = probe.getAttribute("data-sizes");
  if (!sizesAttribute) {
    throw new Error("Expected section element sizes attribute.");
  }

  return JSON.parse(sizesAttribute) as Record<
    string,
    { width: number; height: number }
  >;
}
