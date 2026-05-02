/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTypewriterEffect } from "./useTypewriterEffect";

type HarnessProps = {
  fullText: string;
  isStreaming?: boolean;
  options?:
    | number
    | {
        typingSpeed?: number;
        baseMaxCharsPerFrame?: number;
        maxCharsPerFrameCap?: number;
      };
};

function Harness({ fullText, isStreaming = false, options = 5 }: HarnessProps) {
  const displayedText = useTypewriterEffect(fullText, isStreaming, options);
  return <div data-displayed-text={displayedText}>{displayedText}</div>;
}

describe("useTypewriterEffect", () => {
  let host: HTMLDivElement;
  let root: Root;
  let nextAnimationTimestampMs: number;

  async function renderHarness(props: HarnessProps) {
    await act(async () => {
      root.render(<Harness {...props} />);
    });
  }

  async function advanceAnimationBy(ms: number) {
    await act(async () => {
      vi.advanceTimersByTime(ms);
    });
  }

  function readDisplayedText() {
    return host.textContent ?? "";
  }

  beforeEach(() => {
    vi.useFakeTimers();
    nextAnimationTimestampMs = 0;
    host = document.createElement("div");
    document.body.appendChild(host);
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
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("renders settled text immediately when streaming is disabled", async () => {
    await renderHarness({
      fullText: "Hello",
      isStreaming: false,
    });
    expect(readDisplayedText()).toBe("Hello");

    await renderHarness({
      fullText: "Hello, world",
      isStreaming: false,
    });
    expect(readDisplayedText()).toBe("Hello, world");
  });

  it("reveals appended streaming text over animation frames", async () => {
    const options = {
      typingSpeed: 8,
      baseMaxCharsPerFrame: 1,
      maxCharsPerFrameCap: 3,
    };

    await renderHarness({
      fullText: "Hello",
      isStreaming: true,
      options,
    });
    await renderHarness({
      fullText: "Hello world",
      isStreaming: true,
      options,
    });

    expect(readDisplayedText()).toBe("Hello");

    await advanceAnimationBy(32);
    expect(readDisplayedText().length).toBeGreaterThan(5);
    expect(readDisplayedText()).not.toBe("Hello world");

    await advanceAnimationBy(500);
    expect(readDisplayedText()).toBe("Hello world");
  });

  it("rewinds to the shared prefix when the streaming target changes", async () => {
    const options = {
      typingSpeed: 1,
      baseMaxCharsPerFrame: 4,
      maxCharsPerFrameCap: 4,
    };

    await renderHarness({
      fullText: "Hello world",
      isStreaming: true,
      options,
    });
    await renderHarness({
      fullText: "Hello world!",
      isStreaming: true,
      options,
    });
    await advanceAnimationBy(64);
    expect(readDisplayedText()).toBe("Hello world!");

    await renderHarness({
      fullText: "Hello there",
      isStreaming: true,
      options,
    });
    expect(readDisplayedText()).toBe("Hello ");

    await advanceAnimationBy(64);
    expect(readDisplayedText()).toBe("Hello there");
  });
});
