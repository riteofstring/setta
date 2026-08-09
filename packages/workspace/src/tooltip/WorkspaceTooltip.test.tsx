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

  it("renders only while enabled with staged content", async () => {
    expect(host.textContent).toBe("");

    await act(async () => {
      getWorkspaceTooltipHandlers({ content: "Fit view" }).onMouseEnter({ currentTarget: host });
    });
    expect(host.textContent).toBe("");

    await act(async () => {
      enableWorkspaceTooltip();
    });
    expect(host.textContent).toBe("Fit view");

    await act(async () => {
      disableWorkspaceTooltip();
    });
    expect(host.textContent).toBe("");
  });

  it("follows the pointer at a 10px offset while enabled", async () => {
    await act(async () => {
      getWorkspaceTooltipHandlers({ content: "Reset zoom" }).onMouseEnter({
        currentTarget: host,
      });
      enableWorkspaceTooltip();
    });

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 200, clientY: 120 }));
    });

    const box = host.firstElementChild as HTMLDivElement;
    expect(box.style.transform).toBe("translate(210px, 130px)");
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

    expect(host.firstElementChild?.getAttribute("dir")).toBe("rtl");
  });
});
