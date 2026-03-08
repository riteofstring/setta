/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useContextMenus } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TypeErrorContextMenu } from "./TypeErrorContextMenu";

const {
  routeSetTypeErrorIgnore,
  closeAllContextMenus,
  getCurrProjectConfigId,
} = vi.hoisted(() => ({
  routeSetTypeErrorIgnore: vi.fn(),
  closeAllContextMenus: vi.fn(),
  getCurrProjectConfigId: vi.fn(() => "project-1"),
}));

vi.mock("state/actions/contextMenus", () => ({
  closeAllContextMenus,
}));

vi.mock("state/actions/sectionInfos", () => ({
  getCurrProjectConfigId,
}));

vi.mock("utils/generatedGoEndpoints", () => ({
  route_set_type_error_ignore: routeSetTypeErrorIgnore,
}));

type RenderedMenu = {
  host: HTMLDivElement;
  root: Root;
};

async function renderTypeErrorContextMenu(): Promise<RenderedMenu> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(<TypeErrorContextMenu />);
  });

  return { host, root };
}

describe("TypeErrorContextMenu", () => {
  beforeEach(() => {
    resetProjectStores();
    routeSetTypeErrorIgnore.mockReset();
    closeAllContextMenus.mockReset();
    getCurrProjectConfigId.mockReturnValue("project-1");
  });

  afterEach(async () => {
    resetProjectStores();
    document.body.innerHTML = "";
  });

  it("posts the ignore request through the Go-generated helper", async () => {
    useContextMenus.setState({
      typeError: {
        isOpen: true,
        x: 24,
        y: 48,
        sectionId: "section-1",
        paramInfoId: "param-1",
      },
    });

    const { host, root } = await renderTypeErrorContextMenu();

    try {
      const menuItem = host.querySelector<HTMLElement>('[role="menuitem"]');
      expect(menuItem?.textContent).toContain("Ignore Type Errors");

      await act(async () => {
        menuItem?.click();
      });

      expect(routeSetTypeErrorIgnore).toHaveBeenCalledWith({
        projectConfigId: "project-1",
        sectionId: "section-1",
        paramInfoId: "param-1",
        ignoreTypeErrors: true,
      });
      expect(closeAllContextMenus).toHaveBeenCalled();
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
