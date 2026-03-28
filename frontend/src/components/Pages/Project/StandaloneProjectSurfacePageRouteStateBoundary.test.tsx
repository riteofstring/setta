/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StandaloneProjectSurfacePageRouteStateBoundary } from "./StandaloneProjectSurfacePageRouteStateBoundary";

const hoisted = vi.hoisted(() => ({
  targetBoundaryMock: vi.fn(),
}));

vi.mock("./StandaloneProjectSurfacePageTargetBoundary", () => ({
  StandaloneProjectSurfacePageTargetBoundary: ({
    doneLoading,
    is404,
    projectConfigName,
    sectionSlug,
    chatId,
    windowSpaceSlug,
    navigate,
  }: {
    doneLoading: boolean;
    is404: boolean;
    projectConfigName: string | undefined;
    sectionSlug: string | undefined;
    chatId: string | undefined;
    windowSpaceSlug: string | undefined;
    navigate: (path: string) => void;
  }) => {
    hoisted.targetBoundaryMock({
      doneLoading,
      is404,
      projectConfigName,
      sectionSlug,
      chatId,
      windowSpaceSlug,
      navigate,
    });
    return <div data-testid="mock-standalone-project-surface-target-boundary" />;
  },
}));

describe("StandaloneProjectSurfacePageRouteStateBoundary", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    hoisted.targetBoundaryMock.mockClear();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("derives standalone route state before handing off to the lifted target boundary", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/demo/chat/chat-alpha"]}>
          <Routes>
            <Route
              path="/:projectConfigName/chat/:chatId"
              element={
                <StandaloneProjectSurfacePageRouteStateBoundary
                  doneLoading={false}
                  is404
                />
              }
            />
          </Routes>
        </MemoryRouter>,
      );
    });

    expect(hoisted.targetBoundaryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        doneLoading: false,
        is404: true,
        projectConfigName: "demo",
        chatId: "chat-alpha",
        sectionSlug: undefined,
        windowSpaceSlug: undefined,
        navigate: expect.any(Function),
      }),
    );
  });

  it("reuses the same lifted route boundary for section routes", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/demo/section/languageserver"]}>
          <Routes>
            <Route
              path="/:projectConfigName/section/:sectionSlug"
              element={
                <StandaloneProjectSurfacePageRouteStateBoundary
                  doneLoading
                  is404={false}
                />
              }
            />
          </Routes>
        </MemoryRouter>,
      );
    });

    expect(hoisted.targetBoundaryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        doneLoading: true,
        is404: false,
        projectConfigName: "demo",
        sectionSlug: "languageserver",
        chatId: undefined,
        windowSpaceSlug: undefined,
        navigate: expect.any(Function),
      }),
    );
  });
});
