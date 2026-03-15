/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { ChatWindowModeEnum } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MinimizedPillStrip } from "./projectChatBottomDockPillStrip";

type ResizeObserverController = {
  trigger: () => Promise<void>;
};

const pills = [
  {
    instanceId: "pill-plan",
    title: "Plan",
    mode: ChatWindowModeEnum.project_ai_mode,
    isClosed: false,
    sectionId: null,
  },
  {
    instanceId: "pill-review",
    title: "Review",
    mode: ChatWindowModeEnum.project_ai_mode,
    isClosed: false,
    sectionId: null,
  },
  {
    instanceId: "pill-ship",
    title: "Ship",
    mode: ChatWindowModeEnum.project_ai_mode,
    isClosed: false,
    sectionId: null,
  },
  {
    instanceId: "pill-launch",
    title: "Launch",
    mode: ChatWindowModeEnum.project_ai_mode,
    isClosed: false,
    sectionId: null,
  },
];

let widthState = {
  viewport: 360,
  full: 320,
  compact: 180,
};
let resizeObserverController: ResizeObserverController;

describe("MinimizedPillStrip", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    widthState = {
      viewport: 360,
      full: 320,
      compact: 180,
    };
    resizeObserverController = installResizeObserverMock();
    vi.stubGlobal("requestAnimationFrame", ((
      callback: FrameRequestCallback,
    ) => {
      callback(0);
      return 1;
    }) as typeof window.requestAnimationFrame);
    vi.stubGlobal(
      "cancelAnimationFrame",
      vi.fn() as typeof window.cancelAnimationFrame,
    );
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect() {
        return new DOMRect(0, 0, this.clientWidth, 28);
      },
    );
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
      function getClientWidth() {
        if (this.dataset.testid === "project-chat-bottom-dock-pill-viewport") {
          return widthState.viewport;
        }
        return 0;
      },
    );
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(
      function getScrollWidth() {
        if (this.dataset.chatPillMeasureRow === "full") {
          return widthState.full;
        }
        if (this.dataset.chatPillMeasureRow === "compact") {
          return widthState.compact;
        }
        return 0;
      },
    );
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    vi.restoreAllMocks();
  });

  it("renders full pills and forwards create or reopen clicks when the full row fits", async () => {
    const onCreateWindow = vi.fn();
    const onOpenWindow = vi.fn();

    await act(async () => {
      root.render(
        <MinimizedPillStrip
          pills={pills}
          pillExitAnimationsById={{}}
          canCreateWindow={true}
          showManagerMenu={true}
          viewportWidthPx={900}
          onOpenWindow={onOpenWindow}
          onCreateWindow={onCreateWindow}
        />,
      );
    });

    await resizeObserverController.trigger();

    expect(getElements("project-chat-bottom-dock-pill")).toHaveLength(4);
    expect(getElement("project-chat-bottom-dock-cycle-left")).toBeNull();
    clickButton('button[title="Review"]');
    clickButton('[data-testid="project-chat-bottom-dock-create"]');

    expect(onOpenWindow).toHaveBeenCalledWith("pill-review", "pill");
    expect(onCreateWindow).toHaveBeenCalledTimes(1);
  });

  it("switches to cycle mode and advances the visible compact pills when compact rows overflow", async () => {
    widthState = {
      viewport: 160,
      full: 320,
      compact: 220,
    };

    await act(async () => {
      root.render(
        <MinimizedPillStrip
          pills={pills}
          pillExitAnimationsById={{}}
          canCreateWindow={true}
          showManagerMenu={true}
          viewportWidthPx={700}
          onOpenWindow={vi.fn()}
          onCreateWindow={vi.fn()}
        />,
      );
    });

    await resizeObserverController.trigger();

    expect(getElements("project-chat-bottom-dock-pill")).toHaveLength(2);
    expect(
      getElement<HTMLButtonElement>("project-chat-bottom-dock-cycle-left")
        ?.disabled,
    ).toBe(true);
    expect(
      getElement<HTMLButtonElement>("project-chat-bottom-dock-cycle-right")
        ?.disabled,
    ).toBe(false);
    expect(host.querySelector('button[aria-label="Plan"]')).not.toBeNull();
    expect(host.querySelector('button[aria-label="Review"]')).not.toBeNull();

    await act(async () => {
      clickButton('[data-testid="project-chat-bottom-dock-cycle-right"]');
    });

    expect(host.querySelector('button[aria-label="Plan"]')).toBeNull();
    expect(host.querySelector('button[aria-label="Ship"]')).not.toBeNull();
  });

  it("collapses to menu mode on the narrow breakpoint without rendering pill buttons", async () => {
    widthState = {
      viewport: 140,
      full: 320,
      compact: 220,
    };

    await act(async () => {
      root.render(
        <MinimizedPillStrip
          pills={pills}
          pillExitAnimationsById={{}}
          canCreateWindow={true}
          showManagerMenu={true}
          viewportWidthPx={500}
          onOpenWindow={vi.fn()}
          onCreateWindow={vi.fn()}
        />,
      );
    });

    await resizeObserverController.trigger();

    expect(getElements("project-chat-bottom-dock-pill")).toHaveLength(0);
    expect(getElement("project-chat-bottom-dock-cycle-left")).toBeNull();
    expect(getElement("project-chat-bottom-dock-cycle-right")).toBeNull();
    expect(getElement("project-chat-bottom-dock-menu-trigger")).not.toBeNull();
  });

  function getElement<TElement extends Element>(testId: string) {
    return host.querySelector<TElement>(`[data-testid="${testId}"]`);
  }

  function getElements(testId: string) {
    return host.querySelectorAll(`[data-testid="${testId}"]`);
  }

  function clickButton(selector: string) {
    const button = host.querySelector(selector);
    if (!(button instanceof HTMLElement)) {
      throw new Error(`Missing button for selector ${selector}.`);
    }
    button.click();
  }
});

function installResizeObserverMock(): ResizeObserverController {
  const observedTargets = new Set<Element>();
  const callbacks = new Set<ResizeObserverCallback>();

  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserverMock {
      private callback: ResizeObserverCallback;

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        callbacks.add(callback);
      }

      observe(target: Element) {
        observedTargets.add(target);
      }

      disconnect() {
        callbacks.delete(this.callback);
      }
    },
  );

  return {
    trigger: async () => {
      await act(async () => {
        const entries = Array.from(observedTargets).map((target) => ({
          target,
          contentRect: {
            width: (target as HTMLElement).clientWidth,
            height: 28,
          },
        }));
        callbacks.forEach((callback) =>
          callback(entries as ResizeObserverEntry[], {} as ResizeObserver),
        );
      });
    },
  };
}
