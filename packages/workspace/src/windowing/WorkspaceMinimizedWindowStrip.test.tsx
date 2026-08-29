/* @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceMinimizedWindowStrip } from "./WorkspaceMinimizedWindowStrip";
import {
  createWorkspaceFloatingWindow,
  type WorkspaceFloatingWindow,
  type WorkspaceFloatingWindowInput,
} from "./windowingTypes";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function makeWindow(
  id: string,
  overrides: Partial<WorkspaceFloatingWindowInput> = {},
): WorkspaceFloatingWindow {
  return createWorkspaceFloatingWindow({
    bounds: { height: 280, width: 400, x: 20, y: 30 },
    contentId: `content-${id}`,
    id,
    rendererData: { id },
    surfaceKind: "example",
    title: `Window ${id}`,
    ...overrides,
  });
}

describe("WorkspaceMinimizedWindowStrip", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  async function mount({
    boundaryInsets,
    onRestore = vi.fn(),
    windows = [],
    zIndex,
  }: {
    boundaryInsets?: {
      bottom: number;
      left: number;
      right: number;
      top: number;
    };
    onRestore?: (windowId: string) => void;
    windows?: readonly WorkspaceFloatingWindow[];
    zIndex?: number;
  } = {}): Promise<void> {
    await act(async () => {
      root.render(
        <WorkspaceMinimizedWindowStrip
          boundaryInsets={boundaryInsets}
          onRestore={onRestore}
          windows={windows}
          zIndex={zIndex}
        />,
      );
    });
  }

  function getStrip(): HTMLElement {
    const strip = host.querySelector<HTMLElement>(
      '[data-testid="workspace-minimized-window-strip"]',
    );
    if (!strip) throw new Error("Expected the minimized-window strip.");
    return strip;
  }

  function getRestorePills(): HTMLButtonElement[] {
    return [
      ...host.querySelectorAll<HTMLButtonElement>(
        '[data-testid="workspace-window-restore-pill"]',
      ),
    ];
  }

  it("keeps minimized windows in input order and excludes closed data defensively", async () => {
    const invalidClosedMinimized = {
      ...makeWindow("closed", { isMinimized: true }),
      isClosed: true,
    };
    await mount({
      windows: [
        makeWindow("visible"),
        makeWindow("second", { isMinimized: true, title: "Second window" }),
        invalidClosedMinimized,
        makeWindow("first", { isMinimized: true, title: "First window" }),
      ],
    });

    expect(
      getRestorePills().map((pill) => pill.dataset.workspaceWindowId),
    ).toEqual(["second", "first"]);
    expect(getRestorePills().map((pill) => pill.textContent)).toEqual([
      "Second window",
      "First window",
    ]);
  });

  it("uses labelled native buttons and restores by window id", async () => {
    const onRestore = vi.fn();
    await mount({
      onRestore,
      windows: [makeWindow("one", { isMinimized: true })],
    });

    const pill = getRestorePills()[0];
    if (!pill) throw new Error("Expected the recovery pill.");
    expect(pill.type).toBe("button");
    expect(pill.getAttribute("aria-label")).toBe("Restore Window one");
    expect(pill.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");

    await act(async () => pill.click());
    expect(onRestore).toHaveBeenCalledOnce();
    expect(onRestore).toHaveBeenCalledWith("one");
  });

  it("positions its pointer-enabled strip at the supplied bottom and inline end", async () => {
    await mount({
      boundaryInsets: { bottom: 12, left: 6, right: 18, top: 4 },
      windows: [makeWindow("one", { isMinimized: true })],
      zIndex: 31,
    });

    const strip = getStrip();
    expect(strip.style.bottom).toBe("12px");
    expect(strip.style.insetInlineEnd).toBe("18px");
    expect(strip.style.maxInlineSize).toBe("calc(100% - 24px)");
    expect(strip.style.pointerEvents).toBe("auto");
    expect(strip.style.zIndex).toBe("31");
  });

  it("does not mount recovery chrome when no live minimized window exists", async () => {
    await mount({
      windows: [
        makeWindow("visible"),
        makeWindow("closed", { isClosed: true }),
      ],
    });

    expect(
      host.querySelector('[data-testid="workspace-minimized-window-strip"]'),
    ).toBeNull();
  });
});

describe("workspace minimized-window strip stylesheet", () => {
  const styles = readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../styles/workspaceMinimizedWindowStrip.css",
    ),
    "utf8",
  );

  it("keeps main-style recovery geometry, dark paint, narrow overflow, and motion preference", () => {
    expect(styles).toContain("height: 28px");
    expect(styles).toContain("border-radius: 0.375rem 0.375rem 0 0");
    expect(styles).toContain("overflow-x: auto");
    expect(styles).toContain("text-overflow: ellipsis");
    expect(styles).toContain(".setta-workspace-dark");
    expect(styles).toContain("@container (max-width: 28rem)");
    expect(styles).toContain("@media (prefers-reduced-motion: no-preference)");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
