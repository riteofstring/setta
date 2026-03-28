/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  StandaloneProjectSurfacePageLoadBoundary,
  StandaloneProjectSurfacePageWithLoadState,
} from "./StandaloneProjectSurfacePageLoadBoundary";

const hoisted = vi.hoisted(() => ({
  loadProjectConfigResult: [true, false] as [boolean, boolean],
  addMouseLocationListenerMock: vi.fn(),
  codeMirrorStyleLoaderMock: vi.fn(),
  pluginRuntimeBootstrapMock: vi.fn(),
  targetBoundaryMock: vi.fn(),
}));

vi.mock("state/hooks/project", () => ({
  useLoadProjectConfig: () => hoisted.loadProjectConfigResult,
}));

vi.mock("forks/xyflow/core/utils/mouseLocation", () => ({
  useAddMouseLocationListener: hoisted.addMouseLocationListenerMock,
}));

vi.mock("plugins/runtime", () => ({
  usePluginRuntimeBootstrap: hoisted.pluginRuntimeBootstrapMock,
}));

vi.mock("components/Utils/CodeMirror/useCodeMirrorStyleLoader", () => ({
  useCodeMirrorStyleLoader: hoisted.codeMirrorStyleLoaderMock,
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

describe("StandaloneProjectSurfacePageLoadBoundary", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    hoisted.loadProjectConfigResult = [true, false];
    hoisted.addMouseLocationListenerMock.mockClear();
    hoisted.codeMirrorStyleLoaderMock.mockClear();
    hoisted.pluginRuntimeBootstrapMock.mockClear();
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

  it("derives standalone load state and route params before handing off to the lifted target boundary", async () => {
    hoisted.loadProjectConfigResult = [false, true];

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/demo/chat/chat-alpha"]}>
          <Routes>
            <Route
              path="/:projectConfigName/chat/:chatId"
              element={<StandaloneProjectSurfacePageLoadBoundary />}
            />
          </Routes>
        </MemoryRouter>,
      );
    });

    expect(hoisted.codeMirrorStyleLoaderMock).toHaveBeenCalledWith(false, true);
    expect(hoisted.addMouseLocationListenerMock).toHaveBeenCalledTimes(1);
    expect(hoisted.pluginRuntimeBootstrapMock).toHaveBeenCalledWith(false);
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

  it("reuses the same lifted route/lifecycle boundary for caller-supplied load state", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/demo/section/languageserver"]}>
          <Routes>
            <Route
              path="/:projectConfigName/section/:sectionSlug"
              element={
                <StandaloneProjectSurfacePageWithLoadState
                  doneLoading
                  is404={false}
                />
              }
            />
          </Routes>
        </MemoryRouter>,
      );
    });

    expect(hoisted.codeMirrorStyleLoaderMock).toHaveBeenCalledWith(true, false);
    expect(hoisted.addMouseLocationListenerMock).toHaveBeenCalledTimes(1);
    expect(hoisted.pluginRuntimeBootstrapMock).toHaveBeenCalledWith(true);
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
