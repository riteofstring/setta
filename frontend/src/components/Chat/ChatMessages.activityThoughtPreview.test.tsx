/* @vitest-environment jsdom */

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import {
  BaseChatMessageUnion,
  ChatRoleEnum,
  createMessageThinkingContent,
} from "utils/generatedTypes";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";
import { ChatMessageList } from "./ChatMessages";

type ScrollMetricsController = {
  getScrollTop: () => number;
  getMaxScrollTop: () => number;
  setScrollHeight: (nextScrollHeight: number) => void;
};

describe("ChatMessages activity thought preview scroll", () => {
  let host: HTMLDivElement;
  let root: Root;
  let currentAnimationMs: number;
  let nextAnimationFrameId: number;
  let pendingAnimationFrames: Map<number, FrameRequestCallback>;
  let performanceNowSpy: MockInstance<() => number>;
  let setStreamingThoughtText: ((nextThinking: string) => void) | null;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    currentAnimationMs = 0;
    nextAnimationFrameId = 0;
    pendingAnimationFrames = new Map<number, FrameRequestCallback>();
    setStreamingThoughtText = null;
    performanceNowSpy = vi
      .spyOn(window.performance, "now")
      .mockImplementation(() => currentAnimationMs);

    vi.stubGlobal("ResizeObserver", class ResizeObserverMock {
      observe() {}
      disconnect() {}
    });
    vi.stubGlobal(
      "requestAnimationFrame",
      ((callback: FrameRequestCallback) => {
        nextAnimationFrameId += 1;
        const frameId = nextAnimationFrameId;
        pendingAnimationFrames.set(frameId, callback);
        return frameId;
      }) as typeof window.requestAnimationFrame,
    );
    vi.stubGlobal(
      "cancelAnimationFrame",
      ((frameId: number) => {
        pendingAnimationFrames.delete(frameId);
      }) as typeof window.cancelAnimationFrame,
    );
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    performanceNowSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("reaches the bottom and stays pinned there while no new thought text arrives", async () => {
    await renderStreamingThoughtPreview(buildStreamingThoughtText("initial"));

    const preview = getThoughtPreviewElement(host);
    const scroll = attachScrollMetrics(preview, {
      clientHeight: 40,
      scrollHeight: 46,
    });

    await enablePreviewScrollMeasurement();
    await flushAnimationFrames(32);

    // The preview should advance until the most recent text is visible.
    expect(preview.getAttribute("data-chat-assistant-activity-thought-scroll-enabled")).toBe(
      "true",
    );
    expect(scroll.getScrollTop()).toBe(scroll.getMaxScrollTop());

    await flushAnimationFrames(80);

    // Idle time must not bounce the preview back toward the top again.
    expect(scroll.getScrollTop()).toBe(scroll.getMaxScrollTop());
  });

  it("resumes from the bottom only after additional thought text extends the preview", async () => {
    const initialThoughtText = buildStreamingThoughtText("resume");
    await renderStreamingThoughtPreview(initialThoughtText);

    const preview = getThoughtPreviewElement(host);
    const scroll = attachScrollMetrics(preview, {
      clientHeight: 40,
      scrollHeight: 46,
    });

    await enablePreviewScrollMeasurement();
    await flushAnimationFrames(32);
    expect(scroll.getScrollTop()).toBe(scroll.getMaxScrollTop());

    await flushAnimationFrames(60);
    expect(scroll.getScrollTop()).toBe(scroll.getMaxScrollTop());

    scroll.setScrollHeight(52);
    await updateStreamingThoughtPreview(
      `${initialThoughtText}\nAppended detail keeps the minimized preview moving toward the new bottom.`,
    );
    await enablePreviewScrollMeasurement();

    await flushAnimationFrames(32);

    // Appended text should restart the scroll toward the new bottom, not from the top.
    expect(scroll.getScrollTop()).toBeGreaterThan(6);
    expect(scroll.getScrollTop()).toBe(scroll.getMaxScrollTop());

    await flushAnimationFrames(60);
    expect(scroll.getScrollTop()).toBe(scroll.getMaxScrollTop());
  });

  async function renderStreamingThoughtPreview(thinking: string) {
    await act(async () => {
      root.render(<StreamingThoughtPreviewHarness initialThinking={thinking} />);
    });
  }

  async function updateStreamingThoughtPreview(thinking: string) {
    if (!setStreamingThoughtText) {
      throw new Error("Expected streaming thought preview harness setter.");
    }
    await act(async () => {
      setStreamingThoughtText?.(thinking);
    });
  }

  function getThoughtPreviewElement(container: HTMLDivElement): HTMLDivElement {
    const preview = container.querySelector(
      '[data-chat-assistant-activity-thought-scroll="true"]',
    );
    if (!(preview instanceof HTMLDivElement)) {
      throw new Error("Expected activity thought preview scroll element.");
    }
    return preview;
  }

  function attachScrollMetrics(
    element: HTMLDivElement,
    dimensions: {
      clientHeight: number;
      scrollHeight: number;
    },
  ): ScrollMetricsController {
    let scrollTop = 0;
    let clientHeight = dimensions.clientHeight;
    let scrollHeight = dimensions.scrollHeight;
    Object.defineProperty(element, "clientHeight", {
      configurable: true,
      get: () => clientHeight,
    });
    Object.defineProperty(element, "scrollHeight", {
      configurable: true,
      get: () => scrollHeight,
    });
    Object.defineProperty(element, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (nextScrollTop: number) => {
        scrollTop = nextScrollTop;
      },
    });
    return {
      getScrollTop: () => scrollTop,
      getMaxScrollTop: () => Math.max(0, scrollHeight - clientHeight),
      setScrollHeight: (nextScrollHeight: number) => {
        scrollHeight = nextScrollHeight;
      },
    };
  }

  async function enablePreviewScrollMeasurement() {
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });
    await flushAnimationFrames(2);
  }

  function buildStreamingThoughtText(label: string): string {
    return [
      `Reviewing ${label} activity rows before final output.`,
      "Keeping the preview long enough to overflow the collapsed viewport.",
      "Ensuring the latest reasoning stays visible in minimized mode.",
    ].join("\n");
  }

  async function flushAnimationFrames(frameCount: number) {
    for (let index = 0; index < frameCount; index += 1) {
      const callbacks = Array.from(pendingAnimationFrames.values());
      pendingAnimationFrames.clear();
      currentAnimationMs += 16;
      await act(async () => {
        callbacks.forEach((callback) => callback(currentAnimationMs));
      });
    }
  }

  function StreamingThoughtPreviewHarness({
    initialThinking,
  }: {
    initialThinking: string;
  }) {
    const [thinking, setThinking] = useState(initialThinking);
    setStreamingThoughtText = setThinking;
    const messages: BaseChatMessageUnion[] = [
      {
        id: "activity-thought-preview-message",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageThinkingContent({
            thinking,
            summary: "",
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
    ];
    return <ChatMessageList messages={messages} waitingForResponse={true} />;
  }
});
