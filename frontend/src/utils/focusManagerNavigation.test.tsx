// @vitest-environment jsdom

import { act, useRef, type PropsWithChildren } from "react";
import { createRoot, type Root } from "react-dom/client";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const movePaneToIncludeElementMock = vi.hoisted(() => vi.fn());

vi.mock("forks/xyflow/core/utils/graph", () => ({
  movePaneToIncludeElement: movePaneToIncludeElementMock,
}));

import { focusScope, moveFocus } from "./focusManagerNavigation";
import { useTabScope } from "./focusManagerRegistry";

function markVisible(element: HTMLElement) {
  Object.defineProperty(element, "offsetParent", {
    configurable: true,
    get: () => document.body,
  });
}

function TabScope({
  scopeId,
  order,
  behavior = "default",
  children,
}: PropsWithChildren<{
  scopeId: string;
  order: number;
  behavior?: "default" | "canvas";
}>) {
  const rootRef = useRef<HTMLDivElement>(null);
  useTabScope({
    scopeId,
    order,
    rootRef,
    behavior,
  });
  return (
    <div ref={rootRef} data-tab-scope={scopeId}>
      {children}
    </div>
  );
}

describe("focusManagerNavigation", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetProjectStores();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
    resetProjectStores();
    vi.clearAllMocks();
  });

  it("restores the last focused element within a registered scope", async () => {
    await act(async () => {
      root.render(
        <>
          <TabScope scopeId="header" order={0}>
            <button id="header-first">Header First</button>
            <button id="header-second">Header Second</button>
          </TabScope>
          <TabScope scopeId="sidebar" order={1}>
            <button id="sidebar-only">Sidebar</button>
          </TabScope>
        </>,
      );
    });

    const headerFirst = host.querySelector("#header-first");
    const headerSecond = host.querySelector("#header-second");
    const sidebarOnly = host.querySelector("#sidebar-only");
    if (
      !(headerFirst instanceof HTMLButtonElement) ||
      !(headerSecond instanceof HTMLButtonElement) ||
      !(sidebarOnly instanceof HTMLButtonElement)
    ) {
      throw new Error("Expected focusable buttons to exist.");
    }
    markVisible(headerFirst);
    markVisible(headerSecond);
    markVisible(sidebarOnly);

    headerSecond.focus();
    sidebarOnly.focus();

    expect(focusScope("header")).toBe(true);
    expect(document.activeElement).toBe(headerSecond);
  });

  it("moves focus into the next canvas scope and pans to the focused element", async () => {
    await act(async () => {
      root.render(
        <>
          <TabScope scopeId="header" order={0}>
            <button id="header-only">Header</button>
          </TabScope>
          <TabScope scopeId="canvas" order={1} behavior="canvas">
            <button id="canvas-first">Canvas First</button>
            <button id="canvas-second">Canvas Second</button>
          </TabScope>
        </>,
      );
    });

    const headerOnly = host.querySelector("#header-only");
    const canvasFirst = host.querySelector("#canvas-first");
    const canvasSecond = host.querySelector("#canvas-second");
    if (
      !(headerOnly instanceof HTMLButtonElement) ||
      !(canvasFirst instanceof HTMLButtonElement) ||
      !(canvasSecond instanceof HTMLButtonElement)
    ) {
      throw new Error("Expected focusable buttons to exist.");
    }
    markVisible(headerOnly);
    markVisible(canvasFirst);
    markVisible(canvasSecond);

    headerOnly.focus();

    expect(
      moveFocus({
        direction: 1,
        from: headerOnly,
      }),
    ).toBe(true);
    expect(document.activeElement).toBe(canvasFirst);
    expect(movePaneToIncludeElementMock).toHaveBeenCalledWith(canvasFirst);
  });
});
