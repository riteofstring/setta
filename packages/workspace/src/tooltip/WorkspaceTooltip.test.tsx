/* @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeFrozenWorkspaceTooltip,
  copyWorkspaceTooltipPage,
  decrementWorkspaceTooltipPage,
  disableWorkspaceTooltip,
  enableWorkspaceTooltip,
  freezeWorkspaceTooltip,
  getWorkspaceTooltipHandlers,
  incrementWorkspaceTooltipPage,
  useWorkspaceTooltip,
  WorkspaceTooltip,
} from "./WorkspaceTooltip";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function getTooltipPortal(): HTMLDivElement | null {
  return document.body.querySelector<HTMLDivElement>(
    '[data-setta-workspace-tooltip-portal="true"]',
  );
}

describe("WorkspaceTooltip", () => {
  let host: HTMLDivElement;
  let root: Root;
  const writeText = vi.fn(() => Promise.resolve());

  beforeEach(async () => {
    useWorkspaceTooltip.getState().reset();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(createElement(WorkspaceTooltip));
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    useWorkspaceTooltip.getState().reset();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("stages and clears every page through the hover handlers", async () => {
    const handlers = getWorkspaceTooltipHandlers(
      { content: "Zoom in" },
      { content: "Use the wheel to zoom precisely.", title: "More" },
    );
    const target = document.createElement("button");

    await act(async () => handlers.onMouseEnter({ currentTarget: target }));
    expect(useWorkspaceTooltip.getState().pages).toEqual([
      { content: "Zoom in" },
      { content: "Use the wheel to zoom precisely.", title: "More" },
    ]);

    await act(async () => handlers.onMouseLeave());
    expect(useWorkspaceTooltip.getState().pages).toEqual([]);
  });

  it("stages keyboard quick info at the focused control and clears after focus leaves", async () => {
    const handlers = getWorkspaceTooltipHandlers({
      content: "Choose a value below 10.",
      secondaryContent: "Sets the stability profile.",
      stageOnFocus: true,
      title: "alpha",
      tone: "error",
    });
    const target = document.createElement("button");
    target.getBoundingClientRect = () =>
      ({
        left: 20,
        right: 140,
        top: 50,
        bottom: 80,
        width: 120,
        height: 30,
      }) as DOMRect;

    await act(async () => handlers.onFocus({ currentTarget: target }));
    expect(useWorkspaceTooltip.getState()).toMatchObject({
      anchor: { x: 150, y: 50 },
      pages: [
        {
          content: "Choose a value below 10.",
          secondaryContent: "Sets the stability profile.",
          title: "alpha",
          tone: "error",
        },
      ],
    });

    await act(async () =>
      handlers.onBlur({ currentTarget: target, relatedTarget: null }),
    );
    expect(useWorkspaceTooltip.getState()).toMatchObject({
      anchor: null,
      pageIndex: 0,
      pages: [],
    });
  });

  it("renders only while enabled with staged content", async () => {
    expect(getTooltipPortal()).toBeNull();

    await act(async () => {
      getWorkspaceTooltipHandlers({ content: "Fit view" }).onMouseEnter({
        currentTarget: host,
      });
    });
    expect(getTooltipPortal()).toBeNull();

    await act(async () => {
      enableWorkspaceTooltip();
    });
    expect(getTooltipPortal()?.textContent).toContain("Fit view");
    expect(host.textContent).toBe("");

    await act(async () => {
      disableWorkspaceTooltip();
    });
    expect(getTooltipPortal()).toBeNull();
  });

  it("uses the reference quick-info surface for diagnostic tones", async () => {
    await act(async () => {
      getWorkspaceTooltipHandlers({
        content: "Error: Choose a value below 10.",
        secondaryContent: "Sets the stability profile.",
        title: "alpha",
        tone: "error",
      }).onMouseEnter({ currentTarget: host });
      enableWorkspaceTooltip();
    });

    const tooltip = getTooltipPortal();
    expect(tooltip?.dataset.settaWorkspaceTooltipTone).toBeUndefined();
    expect(
      tooltip?.querySelector('[data-setta-workspace-tooltip-tone="error"]')
        ?.className,
    ).toContain("bg-red-50/95");
    expect(tooltip?.textContent).toContain("alpha");
    expect(tooltip?.textContent).toContain("Choose a value below 10.");
    expect(tooltip?.textContent).toContain("Sets the stability profile.");
    expect(tooltip?.textContent).toContain("Q + F");
  });

  it("cycles paged content in both directions with wraparound", async () => {
    await act(async () => {
      getWorkspaceTooltipHandlers(
        { content: "First page", title: "One" },
        { content: "Second page", title: "Two", tone: "info" },
      ).onMouseEnter({ currentTarget: host });
      enableWorkspaceTooltip();
    });

    expect(getTooltipPortal()?.textContent).toContain("First page");
    await act(async () => {
      incrementWorkspaceTooltipPage();
    });
    expect(getTooltipPortal()?.textContent).toContain("Second page");
    expect(getTooltipPortal()?.textContent).toContain("Page 2 of 2");

    await act(async () => {
      incrementWorkspaceTooltipPage();
      decrementWorkspaceTooltipPage();
    });
    expect(useWorkspaceTooltip.getState().pageIndex).toBe(1);
  });

  it("freezes in place, survives release and hover exit, then restores focus when closed", async () => {
    const previousFocus = document.createElement("button");
    document.body.appendChild(previousFocus);
    previousFocus.focus();
    const handlers = getWorkspaceTooltipHandlers({
      content: "Pinned help",
      title: "alpha",
    });
    await act(async () => {
      handlers.onMouseEnter({ currentTarget: host });
      enableWorkspaceTooltip();
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 100, clientY: 80 }),
      );
    });
    const initialPosition = getTooltipPortal()?.style.transform;

    await act(async () => {
      expect(freezeWorkspaceTooltip()).toBe(true);
    });
    const frozenTooltip = getTooltipPortal();
    expect(frozenTooltip?.getAttribute("role")).toBe("dialog");
    expect(document.activeElement).toBe(frozenTooltip);

    await act(async () => {
      expect(freezeWorkspaceTooltip()).toBe(true);
    });

    await act(async () => {
      handlers.onMouseLeave();
      disableWorkspaceTooltip();
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 350, clientY: 220 }),
      );
    });
    expect(getTooltipPortal()?.style.transform).toBe(initialPosition);
    expect(getTooltipPortal()?.textContent).toContain("Pinned help");

    await act(async () => {
      expect(closeFrozenWorkspaceTooltip()).toBe(true);
    });
    expect(getTooltipPortal()).toBeNull();
    expect(document.activeElement).toBe(previousFocus);
    previousFocus.remove();
  });

  it("copies the current page and exposes a focused frozen copy control", async () => {
    await act(async () => {
      getWorkspaceTooltipHandlers({
        content: "Copy this",
        title: "alpha",
      }).onMouseEnter({
        currentTarget: host,
      });
      enableWorkspaceTooltip();
      freezeWorkspaceTooltip();
    });

    await act(async () => {
      expect(copyWorkspaceTooltipPage()).toBe(true);
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith("Copy this");
    expect(
      getTooltipPortal()?.querySelector('button[aria-label="Copied"]'),
    ).not.toBeNull();
    expect(getTooltipPortal()?.textContent).toContain("Copied to clipboard");
  });

  it("portals to viewport coordinates and follows the pointer at a 10px offset", async () => {
    await act(async () => {
      getWorkspaceTooltipHandlers({ content: "Reset zoom" }).onMouseEnter({
        currentTarget: host,
      });
      enableWorkspaceTooltip();
    });

    await act(async () => {
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 200, clientY: 120 }),
      );
    });

    const box = getTooltipPortal();
    expect(box?.className).toContain("fixed");
    expect(box?.className).not.toContain("absolute");
    expect(box?.style.transform).toBe("translate(210px, 130px)");
    expect(box ? host.contains(box) : true).toBe(false);
  });

  it("keeps following the pointer after the staged row changes before paging", async () => {
    const firstHandlers = getWorkspaceTooltipHandlers(
      { content: "First row diagnostic" },
      { content: "First row help" },
    );
    const secondHandlers = getWorkspaceTooltipHandlers(
      { content: "Second row diagnostic" },
      { content: "Second row help" },
    );

    await act(async () => {
      firstHandlers.onMouseEnter({ currentTarget: host });
      enableWorkspaceTooltip();
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 100, clientY: 80 }),
      );
    });
    expect(getTooltipPortal()?.style.transform).toBe("translate(110px, 90px)");

    await act(async () => firstHandlers.onMouseLeave());
    expect(getTooltipPortal()).toBeNull();

    await act(async () => {
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 200, clientY: 120 }),
      );
      secondHandlers.onMouseEnter({ currentTarget: host });
    });
    await act(async () => {
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 300, clientY: 200 }),
      );
    });
    const positionBeforePaging = getTooltipPortal()?.style.transform;
    expect(positionBeforePaging).toBe("translate(310px, 210px)");

    await act(async () => incrementWorkspaceTooltipPage());
    expect(getTooltipPortal()?.style.transform).toBe(positionBeforePaging);
    expect(getTooltipPortal()?.textContent).toContain("Second row help");
  });

  it("keeps a frozen resized or paged surface inside the viewport", async () => {
    vi.stubGlobal("innerWidth", 1000);
    vi.stubGlobal("innerHeight", 800);
    await act(async () => {
      getWorkspaceTooltipHandlers(
        { content: "Short first page" },
        { content: "A much taller second page" },
      ).onMouseEnter({ currentTarget: host });
      enableWorkspaceTooltip();
    });
    await act(async () => {
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 700, clientY: 500 }),
      );
    });
    await act(async () => {
      freezeWorkspaceTooltip();
    });

    const box = getTooltipPortal();
    if (!box) {
      throw new Error("Expected the frozen tooltip portal.");
    }
    box.getBoundingClientRect = () =>
      ({
        left: 710,
        right: 1010,
        top: 510,
        bottom: 610,
        width: 300,
        height: 100,
      }) as DOMRect;

    await act(async () => incrementWorkspaceTooltipPage());
    expect(box.style.transform).toBe("translate(692px, 510px)");
    expect(box.style.maxWidth).toBe("calc(100vw - 16px)");
    expect((box.firstElementChild as HTMLElement | null)?.style.maxWidth).toBe(
      "calc(100vw - 16px)",
    );

    vi.stubGlobal("innerWidth", 500);
    vi.stubGlobal("innerHeight", 300);
    await act(async () => window.dispatchEvent(new Event("resize")));
    expect(box.style.transform).toBe("translate(192px, 192px)");
  });

  it("preserves a locally rtl trigger direction on the separately mounted tooltip", async () => {
    const target = document.createElement("button");
    target.dir = "rtl";

    await act(async () => {
      getWorkspaceTooltipHandlers({ content: "Move minimap" }).onMouseEnter({
        currentTarget: target,
      });
      enableWorkspaceTooltip();
    });

    expect(getTooltipPortal()?.getAttribute("dir")).toBe("rtl");
  });
});
