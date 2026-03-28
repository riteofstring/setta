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
  routeStateBoundaryMock: vi.fn(),
  renderDictArea: () => null,
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

vi.mock("./StandaloneProjectSurfacePageRouteStateBoundary", () => ({
  StandaloneProjectSurfacePageRouteStateBoundary: ({
    doneLoading,
    is404,
    renderDictArea,
  }: {
    doneLoading: boolean;
    is404: boolean;
    renderDictArea: unknown;
  }) => {
    hoisted.routeStateBoundaryMock({
      doneLoading,
      is404,
      renderDictArea,
    });
    return (
      <div data-testid="mock-standalone-project-surface-route-state-boundary" />
    );
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
    hoisted.routeStateBoundaryMock.mockClear();
    hoisted.renderDictArea = () => null;
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

  it("derives standalone load state before handing off to the lifted route-state boundary", async () => {
    hoisted.loadProjectConfigResult = [false, true];

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/demo/chat/chat-alpha"]}>
          <Routes>
            <Route
              path="/:projectConfigName/chat/:chatId"
              element={
                <StandaloneProjectSurfacePageLoadBoundary
                  renderDictArea={hoisted.renderDictArea}
                />
              }
            />
          </Routes>
        </MemoryRouter>,
      );
    });

    expect(hoisted.codeMirrorStyleLoaderMock).toHaveBeenCalledWith(false, true);
    expect(hoisted.addMouseLocationListenerMock).toHaveBeenCalledTimes(1);
    expect(hoisted.pluginRuntimeBootstrapMock).toHaveBeenCalledWith(false);
    expect(hoisted.routeStateBoundaryMock).toHaveBeenLastCalledWith({
      doneLoading: false,
      is404: true,
      renderDictArea: hoisted.renderDictArea,
    });
  });

  it("reuses the same lifted lifecycle boundary for caller-supplied load state", async () => {
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
                  renderDictArea={hoisted.renderDictArea}
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
    expect(hoisted.routeStateBoundaryMock).toHaveBeenLastCalledWith({
      doneLoading: true,
      is404: false,
      renderDictArea: hoisted.renderDictArea,
    });
  });
});
