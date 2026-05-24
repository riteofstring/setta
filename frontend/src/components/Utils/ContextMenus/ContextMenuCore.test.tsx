/* @vitest-environment jsdom */

import type { ReactNode, Ref } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContextMenuCore } from "./ContextMenuCore";

vi.mock("@radix-ui/react-dropdown-menu", () => ({
  Content: ({
    children,
    ref,
    ...props
  }: {
    readonly children: ReactNode;
    readonly ref?: Ref<HTMLDivElement>;
  }) => (
    <div ref={ref} {...props}>
      {children}
    </div>
  ),
  Root: ({ children }: { readonly children: ReactNode }) => <>{children}</>,
}));

describe("ContextMenuCore", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("keeps a pointer-anchored menu inside viewport edges", async () => {
    stubViewportSize({ height: 600, width: 800 });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    const frameCallbacks: FrameRequestCallback[] = [];
    window.requestAnimationFrame = (callback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    };
    window.cancelAnimationFrame = () => undefined;
    const originalGetBoundingClientRect =
      HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function getRect() {
      if ((this as HTMLElement).dataset.testid === "context-menu-core") {
        return createRect({ height: 120, width: 160, x: 0, y: 0 });
      }
      return originalGetBoundingClientRect.call(this);
    };
    const originalOffsetWidth = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetWidth",
    );
    const originalOffsetHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetHeight",
    );
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get() {
        return (this as HTMLElement).dataset.testid === "context-menu-core"
          ? 160
          : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get() {
        return (this as HTMLElement).dataset.testid === "context-menu-core"
          ? 120
          : 0;
      },
    });

    try {
      await act(async () => {
        root.render(
          <ContextMenuCore
            closeContextMenu={vi.fn()}
            isOpen={true}
            x={790}
            y={590}
          >
            <button type="button">Create</button>
          </ContextMenuCore>,
        );
      });
      await act(async () => {
        flushNextFrame(frameCallbacks);
        await settleFloatingPosition();
      });

      const menu = host.querySelector<HTMLElement>(
        '[data-testid="context-menu-core"]',
      );
      expect(menu).not.toBeNull();
      expect(menu?.style.position).toBe("fixed");
      expect(Number.parseFloat(menu?.style.left ?? "")).toBeLessThanOrEqual(
        632,
      );
      expect(Number.parseFloat(menu?.style.top ?? "")).toBeLessThanOrEqual(472);
    } finally {
      await act(async () => {
        root.unmount();
      });
      HTMLElement.prototype.getBoundingClientRect =
        originalGetBoundingClientRect;
      if (originalOffsetWidth) {
        Object.defineProperty(
          HTMLElement.prototype,
          "offsetWidth",
          originalOffsetWidth,
        );
      }
      if (originalOffsetHeight) {
        Object.defineProperty(
          HTMLElement.prototype,
          "offsetHeight",
          originalOffsetHeight,
        );
      }
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });
});

function stubViewportSize({
  height,
  width,
}: {
  readonly height: number;
  readonly width: number;
}) {
  Object.defineProperty(document.documentElement, "clientHeight", {
    configurable: true,
    value: height,
  });
  Object.defineProperty(document.documentElement, "clientWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: height,
  });
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
}

function createRect({
  height,
  width,
  x,
  y,
}: {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}): DOMRect {
  return {
    bottom: y + height,
    height,
    left: x,
    right: x + width,
    top: y,
    width,
    x,
    y,
    toJSON: () => ({}),
  };
}

function flushNextFrame(frameCallbacks: FrameRequestCallback[]) {
  const callback = frameCallbacks.shift();
  if (!callback) {
    throw new Error("Expected a pending animation frame callback.");
  }
  callback(performance.now());
}

async function settleFloatingPosition() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}
