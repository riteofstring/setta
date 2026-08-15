/* @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  disableWorkspaceTooltip,
  enableWorkspaceTooltip,
  getWorkspaceTooltipHandlers,
  useWorkspaceTooltip,
  WorkspaceTooltip,
} from "./WorkspaceTooltip";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function getTooltipPortal(): HTMLDivElement | null {
  return document.body.querySelector<HTMLDivElement>(
    '[data-setta-workspace-tooltip-portal="true"]',
  );
}

describe("WorkspaceTooltip", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    useWorkspaceTooltip.getState().reset();
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
  });

  it("stages and clears content through the hover handlers", () => {
    const handlers = getWorkspaceTooltipHandlers({ content: "Zoom in" });
    const target = document.createElement("button");

    handlers.onMouseEnter({ currentTarget: target });
    expect(useWorkspaceTooltip.getState().content).toBe("Zoom in");

    handlers.onMouseLeave();
    expect(useWorkspaceTooltip.getState().content).toBe(null);
  });

  it("stages keyboard quick info at the focused control and clears after focus leaves", () => {
    const handlers = getWorkspaceTooltipHandlers({
      content: "Choose a value below 10.",
      secondaryContent: "Sets the stability profile.",
      stageOnFocus: true,
      title: "alpha",
      tone: "error",
    });
    const target = document.createElement("button");
    target.getBoundingClientRect = () =>
      ({ left: 20, right: 140, top: 50, bottom: 80, width: 120, height: 30 }) as DOMRect;

    handlers.onFocus({ currentTarget: target });
    expect(useWorkspaceTooltip.getState()).toMatchObject({
      anchor: { x: 150, y: 50 },
      content: "Choose a value below 10.",
      secondaryContent: "Sets the stability profile.",
      title: "alpha",
      tone: "error",
    });

    handlers.onBlur({ currentTarget: target, relatedTarget: null });
    expect(useWorkspaceTooltip.getState()).toMatchObject({
      anchor: null,
      content: null,
      secondaryContent: null,
      title: null,
      tone: "default",
    });
  });

  it("renders only while enabled with staged content", async () => {
    expect(getTooltipPortal()).toBeNull();

    await act(async () => {
      getWorkspaceTooltipHandlers({ content: "Fit view" }).onMouseEnter({ currentTarget: host });
    });
    expect(getTooltipPortal()).toBeNull();

    await act(async () => {
      enableWorkspaceTooltip();
    });
    expect(getTooltipPortal()?.textContent).toBe("Fit view");
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

    const tooltip = getTooltipPortal()?.querySelector<HTMLElement>('[role="tooltip"]');
    expect(tooltip?.dataset.settaWorkspaceTooltipTone).toBe("error");
    expect(tooltip?.className).toContain("bg-red-50/95");
    expect(tooltip?.textContent).toContain("alpha");
    expect(tooltip?.textContent).toContain("Choose a value below 10.");
    expect(tooltip?.textContent).toContain("Sets the stability profile.");
  });

  it("portals to viewport coordinates and follows the pointer at a 10px offset", async () => {
    await act(async () => {
      getWorkspaceTooltipHandlers({ content: "Reset zoom" }).onMouseEnter({
        currentTarget: host,
      });
      enableWorkspaceTooltip();
    });

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 200, clientY: 120 }));
    });

    const box = getTooltipPortal();
    expect(box?.className).toContain("fixed");
    expect(box?.className).not.toContain("absolute");
    expect(box?.style.transform).toBe("translate(210px, 130px)");
    expect(box ? host.contains(box) : true).toBe(false);
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
