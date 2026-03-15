/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { useAllProjectMetadata, useSettings } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { HOME_ROUTER_PATH } from "utils/constants";
import { createProjectConfig, createSettingsState } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadAllProjectMetadataMock = vi.fn();

vi.mock("state/actions/project/loadProject", () => ({
  loadAllProjectMetadata: (...args: unknown[]) =>
    loadAllProjectMetadataMock(...args),
}));

import { IndexRouteComponent } from "./GlobalWrapper";

type RenderedIndexRoute = {
  host: HTMLDivElement;
  root: Root;
};

function ProjectRoute() {
  const { projectConfigName } = useParams();
  return <div data-testid="destination">project:{projectConfigName}</div>;
}

function HomeRoute() {
  return <div data-testid="destination">home</div>;
}

async function renderIndexRoute(): Promise<RenderedIndexRoute> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<IndexRouteComponent />} />
          <Route path={HOME_ROUTER_PATH} element={<HomeRoute />} />
          <Route path="/:projectConfigName" element={<ProjectRoute />} />
        </Routes>
      </MemoryRouter>,
    );
  });

  return { host, root };
}

describe("IndexRouteComponent", () => {
  beforeEach(() => {
    resetProjectStores();
    useSettings.setState(createSettingsState());
    useAllProjectMetadata.setState({
      defaultProjectConfigId: null,
      projectMetadata: [],
    });
    loadAllProjectMetadataMock.mockReset();
    loadAllProjectMetadataMock.mockResolvedValue(false);
  });

  afterEach(async () => {
    resetProjectStores();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("redirects to the default project name from Go-owned metadata without a helper route", async () => {
    useAllProjectMetadata.setState({
      defaultProjectConfigId: "project-beta",
      projectMetadata: [
        createProjectConfig({ id: "project-alpha", name: "Alpha" }),
        createProjectConfig({ id: "project-beta", name: "Beta" }),
      ],
    });

    const { host, root } = await renderIndexRoute();

    try {
      // Preloaded Go metadata should resolve the redirect immediately.
      expect(host.textContent).toContain("project:Beta");
      expect(loadAllProjectMetadataMock).not.toHaveBeenCalled();
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("loads project metadata once before resolving the default-project redirect", async () => {
    loadAllProjectMetadataMock.mockImplementation(async () => {
      useAllProjectMetadata.setState({
        defaultProjectConfigId: "project-gamma",
        projectMetadata: [
          createProjectConfig({ id: "project-gamma", name: "Gamma" }),
        ],
      });
      return true;
    });

    const { host, root } = await renderIndexRoute();

    try {
      await act(async () => {
        await Promise.resolve();
      });

      // The route should issue a single metadata load and then redirect from
      // the hydrated store state.
      expect(loadAllProjectMetadataMock).toHaveBeenCalledOnce();
      expect(host.textContent).toContain("project:Gamma");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
