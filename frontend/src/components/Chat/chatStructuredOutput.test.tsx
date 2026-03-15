/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  StructuredOutputBlock,
  classifyDiffLineForChat,
  isUnifiedDiffText,
  resolveStructuredOutputPayload,
} from "./chatStructuredOutput";

describe("chatStructuredOutput helpers", () => {
  it("classifies object payloads as json code output", () => {
    const payload = resolveStructuredOutputPayload({
      value: { ok: true, items: [1, 2, 3] },
      toolName: "mcp__workspace__read_file",
      part: "output",
      contextValue: { path: "config.json" },
    });

    expect(payload).not.toBeNull();
    expect(payload?.kind).toBe("code");
    expect(payload?.language).toBe("json");
    expect(payload?.text).toContain('"ok": true');
    expect(payload?.text).toContain('"items": [');
  });

  it("classifies unified diff payloads and line kinds deterministically", () => {
    const diff = [
      "diff --git a/src/app.ts b/src/app.ts",
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      "@@ -1 +1 @@",
      "-const value = 1;",
      "+const value = 2;",
      " context line",
    ].join("\n");
    const payload = resolveStructuredOutputPayload({
      value: diff,
      toolName: "file_change",
      part: "output",
      contextValue: { path: "src/app.ts" },
    });

    expect(isUnifiedDiffText(diff)).toBe(true);
    expect(payload).not.toBeNull();
    expect(payload?.kind).toBe("diff");
    expect(classifyDiffLineForChat("diff --git a/x b/x")).toBe("meta");
    expect(classifyDiffLineForChat("--- a/x")).toBe("file");
    expect(classifyDiffLineForChat("@@ -1 +1 @@")).toBe("hunk");
    expect(classifyDiffLineForChat("-a")).toBe("del");
    expect(classifyDiffLineForChat("+b")).toBe("add");
    expect(classifyDiffLineForChat(" context")).toBe("context");
  });

  it("uses path hints to classify text output language as yaml", () => {
    const payload = resolveStructuredOutputPayload({
      value: "name: setta\nenabled: true",
      toolName: "mcp__workspace__read_file",
      part: "output",
      contextValue: { path: "configs/app.yaml" },
    });

    expect(payload).not.toBeNull();
    expect(payload?.kind).toBe("code");
    expect(payload?.language).toBe("yaml");
    expect(payload?.text).toContain("name: setta");
  });
});

describe("StructuredOutputBlock", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    class TestPointerEvent extends MouseEvent {
      pointerId: number;

      constructor(
        type: string,
        init: MouseEventInit & { pointerId?: number } = {},
      ) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
      }
    }

    vi.stubGlobal(
      "PointerEvent",
      TestPointerEvent as unknown as typeof PointerEvent,
    );
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    vi.unstubAllGlobals();
  });

  it("keeps the resize handle local to the extracted block and resets after a double click", async () => {
    await act(async () => {
      root.render(
        <StructuredOutputBlock
          payload={{
            text: "echo ready",
            kind: "plain",
            language: null,
            useJsx: false,
            pathHint: null,
          }}
          owner="tool"
          part="output"
          isStreaming={true}
        />,
      );
    });

    const pane = host.querySelector(
      '[data-chat-structured-output-pane="true"]',
    ) as HTMLDivElement | null;
    const handle = host.querySelector(
      '[data-chat-structured-output-resize-handle="true"]',
    ) as HTMLDivElement | null;
    const output = host.querySelector(
      '[data-chat-structured-output="true"]',
    ) as HTMLElement | null;

    expect(pane).not.toBeNull();
    expect(handle).not.toBeNull();
    expect(output?.getAttribute("data-chat-structured-output-streaming")).toBe(
      "true",
    );

    if (!pane || !handle) {
      throw new Error("Expected structured output pane and resize handle.");
    }

    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 500,
    });
    Object.defineProperty(pane, "getBoundingClientRect", {
      configurable: true,
      value: () => {
        const rawHeight = pane.style.height || pane.style.maxHeight || "0";
        const height = Number.parseFloat(rawHeight);
        return {
          x: 0,
          y: 100,
          width: 640,
          height,
          top: 100,
          left: 0,
          right: 640,
          bottom: 100 + height,
          toJSON: () => "",
        };
      },
    });

    // Dragging the bottom handle should move the pane off the default compact height.
    await act(async () => {
      handle.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          clientY: 180,
          pointerId: 7,
        }),
      );
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientY: 300,
          pointerId: 7,
        }),
      );
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          clientY: 300,
          pointerId: 7,
        }),
      );
    });

    expect(pane.style.height).toBe("380px");

    // Double click should restore the default auto height cap.
    await act(async () => {
      handle.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });

    expect(pane.style.height).toBe("");
    expect(pane.style.maxHeight).toBe("260px");
  });
});
