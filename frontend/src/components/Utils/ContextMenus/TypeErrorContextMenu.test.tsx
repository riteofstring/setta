/* @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  routeSetTypeErrorIgnoreMock,
  closeAllContextMenusMock,
  getCurrProjectConfigIdMock,
  useContextMenusMock,
} = vi.hoisted(() => ({
  routeSetTypeErrorIgnoreMock: vi.fn(),
  closeAllContextMenusMock: vi.fn(),
  getCurrProjectConfigIdMock: vi.fn(() => "project-1"),
  useContextMenusMock: vi.fn(),
}));

vi.mock("state/definitions", () => ({
  useContextMenus: useContextMenusMock,
}));

vi.mock("state/actions/contextMenus", () => ({
  closeAllContextMenus: closeAllContextMenusMock,
}));

vi.mock("state/actions/sectionInfos", () => ({
  getCurrProjectConfigId: getCurrProjectConfigIdMock,
}));

vi.mock("utils/generatedEndpoints", () => ({
  route_set_type_error_ignore: routeSetTypeErrorIgnoreMock,
}));

vi.mock("./ContextMenuCore", () => ({
  ContextMenuCore: ({
    isOpen,
    children,
  }: {
    isOpen: boolean;
    children: ReactNode;
  }) => (isOpen ? <div>{children}</div> : null),
}));

vi.mock("components/Utils/atoms/dropdown/item", () => ({
  Item: ({
    onClick,
    children,
  }: {
    onClick: () => void;
    children: ReactNode;
  }) => <button onClick={onClick}>{children}</button>,
}));

import { TypeErrorContextMenu } from "./TypeErrorContextMenu";

type RenderedContextMenu = {
  host: HTMLDivElement;
  root: Root;
};

async function renderContextMenu(): Promise<RenderedContextMenu> {
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
    routeSetTypeErrorIgnoreMock.mockReset();
    closeAllContextMenusMock.mockReset();
    getCurrProjectConfigIdMock.mockReset();
    getCurrProjectConfigIdMock.mockReturnValue("project-1");
    useContextMenusMock.mockImplementation((selector: Function) =>
      selector({
        typeError: {
          isOpen: true,
          x: 12,
          y: 24,
          sectionId: "section-1",
          paramInfoId: "param-1",
        },
      }),
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("posts the type-error ignore mutation for the selected item", async () => {
    const { host, root } = await renderContextMenu();

    try {
      const button = host.querySelector("button");
      if (!(button instanceof HTMLButtonElement)) {
        throw new Error("Expected ignore button");
      }

      await act(async () => {
        button.click();
      });

      expect(routeSetTypeErrorIgnoreMock).toHaveBeenCalledWith({
        projectConfigId: "project-1",
        sectionId: "section-1",
        paramInfoId: "param-1",
        ignoreTypeErrors: true,
      });
      expect(closeAllContextMenusMock).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
