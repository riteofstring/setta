/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Tier1DenseParamSectionPreview } from "./Tier1DenseParamSectionPreview";

const snapdomToSvg = vi.hoisted(() =>
  vi.fn(async () => {
    const image = new Image();
    image.src =
      "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="220"></svg>',
      );
    Object.defineProperty(image, "complete", { value: true });
    return image;
  }),
);

vi.mock("@zumer/snapdom", () => ({
  snapdom: {
    toSvg: snapdomToSvg,
  },
}));

function createRect({
  left,
  top,
  width,
  height,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
}): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON() {
      return {};
    },
  } as DOMRect;
}

describe("Tier1DenseParamSectionPreview", () => {
  let host: HTMLElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    snapdomToSvg.mockReset();
    snapdomToSvg.mockImplementation(async () => {
      const image = new Image();
      image.src =
        "data:image/svg+xml;charset=utf-8," +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="220"></svg>',
        );
      Object.defineProperty(image, "complete", { value: true });
      return image;
    });

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        const left = Number(this.getAttribute("data-test-left") ?? "0");
        const top = Number(this.getAttribute("data-test-top") ?? "0");
        const width = Number(this.getAttribute("data-test-width") ?? "0");
        const height = Number(this.getAttribute("data-test-height") ?? "0");
        return createRect({ left, top, width, height });
      },
    );
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(
      function offsetWidth(this: HTMLElement) {
        return Number(
          this.getAttribute("data-test-offset-width") ??
            this.getAttribute("data-test-width") ??
            "0",
        );
      },
    );
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
      function offsetHeight(this: HTMLElement) {
        return Number(
          this.getAttribute("data-test-offset-height") ??
            this.getAttribute("data-test-height") ??
            "0",
        );
      },
    );
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(
      function scrollWidth(this: HTMLElement) {
        return Number(
          this.getAttribute("data-test-scroll-width") ??
            this.getAttribute("data-test-width") ??
            "0",
        );
      },
    );
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
      function scrollHeight(this: HTMLElement) {
        return Number(
          this.getAttribute("data-test-scroll-height") ??
            this.getAttribute("data-test-height") ??
            "0",
        );
      },
    );

    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }) as typeof globalThis.requestAnimationFrame;
    window.requestIdleCallback = ((callback: IdleRequestCallback) =>
      window.setTimeout(
        () =>
          callback({
            didTimeout: false,
            timeRemaining: () => 50,
          }),
        0,
      )) as typeof window.requestIdleCallback;
    window.cancelIdleCallback = ((handle: number) =>
      window.clearTimeout(handle)) as typeof window.cancelIdleCallback;

    host = document.createElement("section");
    host.id = "section-123-CustomResizable";
    host.style.position = "relative";
    host.setAttribute("data-test-left", "0");
    host.setAttribute("data-test-top", "0");
    host.setAttribute("data-test-width", "400");
    host.setAttribute("data-test-height", "220");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    if (root !== null) {
      act(() => {
        root?.unmount();
      });
    }
    root = null;
    host?.remove();
    host = null;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps the live body mounted and overlays a captured image on the next preview pass", async () => {
    function LiveBody() {
      return (
        <div
          data-testid="live-body"
          data-test-left="20"
          data-test-top="60"
          data-test-width="320"
          data-test-height="120"
        >
          Live body
        </div>
      );
    }

    await act(async () => {
      root?.render(
        <Tier1DenseParamSectionPreview
          sectionId="section-123"
          isActiveSection={false}
          shouldWarmPreview
          warmPriority={0}
          showPreview
        >
          <LiveBody />
        </Tier1DenseParamSectionPreview>,
      );
    });

    expect(
      document.querySelector('[data-section-body-preview-image="true"]'),
    ).toBeNull();
    expect(snapdomToSvg).not.toHaveBeenCalled();

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      root?.render(
        <Tier1DenseParamSectionPreview
          sectionId="section-123"
          isActiveSection={false}
          shouldWarmPreview={false}
          warmPriority={null}
          showPreview={false}
        >
          <LiveBody />
        </Tier1DenseParamSectionPreview>,
      );
      await Promise.resolve();
    });

    await act(async () => {
      await vi.runAllTimersAsync();
      await Promise.resolve();
    });

    expect(snapdomToSvg).toHaveBeenCalledTimes(1);
    expect(
      host?.querySelector('[data-section-body-preview-status="ready"]'),
    ).not.toBeNull();

    await act(async () => {
      root?.render(
        <Tier1DenseParamSectionPreview
          sectionId="section-123"
          isActiveSection={false}
          shouldWarmPreview
          warmPriority={0}
          showPreview
        >
          <LiveBody />
        </Tier1DenseParamSectionPreview>,
      );
    });

    const liveBody = host?.querySelector<HTMLElement>(
      '[data-testid="live-body"]',
    );
    expect(liveBody).not.toBeNull();
    expect(liveBody?.style.opacity).toBe("0");
    expect(
      document.querySelector(
        '[data-section-body-preview-overlay="section-123"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-section-body-preview-image="true"]'),
    ).not.toBeNull();
  });

  it("retains a cached preview after the warm trigger drops away", async () => {
    function LiveBody() {
      return (
        <div
          data-testid="live-body"
          data-test-left="20"
          data-test-top="60"
          data-test-width="320"
          data-test-height="120"
        >
          Live body
        </div>
      );
    }

    await act(async () => {
      root?.render(
        <Tier1DenseParamSectionPreview
          sectionId="section-123"
          isActiveSection={false}
          shouldWarmPreview
          warmPriority={0}
          showPreview
        >
          <LiveBody />
        </Tier1DenseParamSectionPreview>,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      root?.render(
        <Tier1DenseParamSectionPreview
          sectionId="section-123"
          isActiveSection={false}
          shouldWarmPreview={false}
          warmPriority={null}
          showPreview={false}
        >
          <LiveBody />
        </Tier1DenseParamSectionPreview>,
      );
      await Promise.resolve();
    });

    await act(async () => {
      await vi.runAllTimersAsync();
      await Promise.resolve();
    });

    expect(snapdomToSvg).toHaveBeenCalledTimes(1);
    expect(
      host?.querySelector('[data-section-body-preview-status="ready"]'),
    ).not.toBeNull();
    expect(
      host?.querySelector('[data-section-body-preview-status="ready"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-section-body-preview-image="true"]'),
    ).toBeNull();

    await act(async () => {
      root?.render(
        <Tier1DenseParamSectionPreview
          sectionId="section-123"
          isActiveSection={false}
          shouldWarmPreview
          warmPriority={0}
          showPreview
        >
          <LiveBody />
        </Tier1DenseParamSectionPreview>,
      );
    });

    expect(snapdomToSvg).toHaveBeenCalledTimes(1);
    expect(
      document.querySelector(
        '[data-section-body-preview-overlay="section-123"]',
      ),
    ).not.toBeNull();
  });

  it("prioritizes local warm captures ahead of the outer warm pool", async () => {
    const captureOrder: string[] = [];
    snapdomToSvg.mockImplementation(async (...args: unknown[]) => {
      const captureTarget = args[0];
      if (!(captureTarget instanceof Element)) {
        throw new Error("Expected SnapDOM capture target element.");
      }
      const sectionId =
        captureTarget
          .querySelector("[data-section-body-preview-root]")
          ?.getAttribute("data-section-body-preview-root") ?? "unknown";
      captureOrder.push(sectionId);
      const image = new Image();
      image.src =
        "data:image/svg+xml;charset=utf-8," +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="220"></svg>',
        );
      Object.defineProperty(image, "complete", { value: true });
      return image;
    });

    function PreviewHost({
      left,
      sectionId,
      warmPriority,
    }: {
      left: number;
      sectionId: string;
      warmPriority: number;
    }) {
      return (
        <section
          id={`${sectionId}-CustomResizable`}
          style={{ position: "relative" }}
          data-test-left={String(left)}
          data-test-top="0"
          data-test-width="400"
          data-test-height="220"
        >
          <Tier1DenseParamSectionPreview
            sectionId={sectionId}
            isActiveSection={false}
            shouldWarmPreview
            warmPriority={warmPriority}
            showPreview={false}
          >
            <div
              data-testid={`live-body-${sectionId}`}
              data-test-left={String(left + 20)}
              data-test-top="60"
              data-test-width="320"
              data-test-height="120"
            >
              {sectionId}
            </div>
          </Tier1DenseParamSectionPreview>
        </section>
      );
    }

    await act(async () => {
      root?.render(
        <>
          <PreviewHost left={0} sectionId="section-far" warmPriority={8} />
          <PreviewHost left={520} sectionId="section-near" warmPriority={0} />
        </>,
      );
      await Promise.resolve();
    });

    await act(async () => {
      await vi.runAllTimersAsync();
      await Promise.resolve();
    });

    expect(captureOrder.slice(0, 2)).toEqual(["section-near", "section-far"]);
  });
});
