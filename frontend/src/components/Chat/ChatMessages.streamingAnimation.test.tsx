/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { resetProjectStores } from "state/utils";
import {
  ChatRoleEnum,
  createMessageTextContent,
  type BaseChatMessageUnion,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatMessageList } from "./ChatMessages";

function createRect(height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 320,
    height,
    top: 0,
    right: 320,
    bottom: height,
    left: 0,
    toJSON() {
      return null;
    },
  } as DOMRect;
}

describe("ChatMessages streaming animation", () => {
  let host: HTMLDivElement;
  let root: Root;
  let originalGetBoundingClientRect: typeof HTMLElement.prototype.getBoundingClientRect;
  let originalAnimate: typeof HTMLElement.prototype.animate | undefined;
  let nextAnimationTimestampMs: number;
  const animateMock = vi.fn(() => ({ cancel() {} }) as unknown as Animation);

  beforeEach(() => {
    resetProjectStores();
    vi.useFakeTimers();
    nextAnimationTimestampMs = 0;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      window.setTimeout(() => {
        nextAnimationTimestampMs += 16;
        callback(nextAnimationTimestampMs);
      }, 16),
    );
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
      window.clearTimeout(handle);
    });

    const rectCallCountByElement = new WeakMap<Element, number>();
    originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect =
      function getBoundingClientRect() {
        if (this.getAttribute("data-chat-streaming-markdown") === "true") {
          const nextCallCount =
            (rectCallCountByElement.get(this) ?? 0) + 1;
          rectCallCountByElement.set(this, nextCallCount);
          return createRect(nextCallCount === 1 ? 24 : 48);
        }
        return createRect(24);
      };

    originalAnimate = HTMLElement.prototype.animate;
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      writable: true,
      value: animateMock,
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    if (originalAnimate) {
      Object.defineProperty(HTMLElement.prototype, "animate", {
        configurable: true,
        writable: true,
        value: originalAnimate,
      });
    } else {
      delete (HTMLElement.prototype as { animate?: unknown }).animate;
    }
    animateMock.mockReset();
    host.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    resetProjectStores();
  });

  it("does not animate streaming markdown growth with vertical translation", async () => {
    const initialMessages: BaseChatMessageUnion[] = [
      {
        id: "streaming-assistant-message",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageTextContent({
            text: "First line",
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
    ];

    await act(async () => {
      root.render(
        <ChatMessageList messages={initialMessages} waitingForResponse={true} />,
      );
    });

    const nextMessages: BaseChatMessageUnion[] = [
      {
        id: "streaming-assistant-message",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageTextContent({
            text: ["First line", "Second line"].join("\n"),
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
    ];

    await act(async () => {
      root.render(
        <ChatMessageList messages={nextMessages} waitingForResponse={true} />,
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(animateMock).toHaveBeenCalled();
    const animatedKeyframes = animateMock.mock.calls.map(
      ([keyframes]) => keyframes,
    ) as Array<Array<Record<string, unknown>>>;
    expect(
      animatedKeyframes.some((keyframes) =>
        keyframes.some((keyframe) => "transform" in keyframe),
      ),
    ).toBe(false);
  });
});
