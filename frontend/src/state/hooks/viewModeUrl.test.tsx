/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { useProjectState, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { VIEW_MODE_ROUTER_PATH } from "utils/constants";
import {
  createPolicy,
  createProjectConfig,
  createViewMode,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useViewModeUrlSync } from "./viewModeUrl";

const setActiveViewModeMock = vi.fn();
const callOpenAPIMock = vi.fn((promise: Promise<unknown>) => promise);

vi.mock("openapi/http", () => ({
  setActiveViewMode: (...args: unknown[]) => setActiveViewModeMock(...args),
}));

vi.mock("@setta/app-subsystem-frontend-sdk", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@setta/app-subsystem-frontend-sdk")>();
  return {
    ...actual,
    callOpenAPI: (promise: Promise<unknown>) => callOpenAPIMock(promise),
  };
});

function buildProjectConfig(activeViewModeId = "alpha-id") {
  return createProjectConfig({
    id: "project-alpha",
    name: "demo",
    activeViewModeId,
    viewModes: {
      "alpha-id": createViewMode({
        id: "alpha-id",
        name: "Alpha",
      }),
      "beta-id": createViewMode({
        id: "beta-id",
        name: "Beta",
      }),
    },
  });
}

function ViewModeUrlHarness() {
  useViewModeUrlSync({ enabled: true });
  const location = useLocation();
  return <div data-testid="location" data-pathname={location.pathname} />;
}

type RenderedHarness = {
  host: HTMLDivElement;
  root: Root;
  flush: () => Promise<void>;
  getPathname: () => string | undefined;
  unmount: () => Promise<void>;
};

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderHarness(route: string): Promise<RenderedHarness> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route
            path={VIEW_MODE_ROUTER_PATH}
            element={<ViewModeUrlHarness />}
          />
        </Routes>
      </MemoryRouter>,
    );
  });
  await flushEffects();

  return {
    host,
    root,
    flush: flushEffects,
    getPathname: () =>
      host.querySelector<HTMLElement>('[data-testid="location"]')?.dataset
        .pathname,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
    },
  };
}

describe("useViewModeUrlSync", () => {
  beforeEach(() => {
    resetProjectStores();
    setActiveViewModeMock.mockReset();
    setActiveViewModeMock.mockResolvedValue(undefined);
    callOpenAPIMock.mockClear();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    resetProjectStores();
  });

  it("keeps the requested route while a URL-driven view-mode switch is pending", async () => {
    useProjectState.setState({
      projectConfig: buildProjectConfig("alpha-id"),
    });

    const harness = await renderHarness("/demo/view/Beta");

    await vi.waitFor(() => {
      expect(setActiveViewModeMock).toHaveBeenCalledWith({
        body: {
          projectConfigId: "project-alpha",
          activeViewModeId: "beta-id",
        },
      });
    });
    expect(harness.getPathname()).toBe("/demo/view/Beta");

    await act(async () => {
      useProjectState.setState({
        projectConfig: buildProjectConfig("beta-id"),
      });
    });
    await harness.flush();

    expect(harness.getPathname()).toBe("/demo/view/Beta");
    await harness.unmount();
  });

  it("rewrites the route to the active view mode when variant edits are disabled", async () => {
    useShareSession.setState({
      isDeploymentMode: true,
      sharePolicy: createPolicy({ allowVariantChanges: false }),
    });
    useProjectState.setState({
      projectConfig: buildProjectConfig("alpha-id"),
    });

    const harness = await renderHarness("/demo/view/Beta");

    await vi.waitFor(() => {
      expect(harness.getPathname()).toBe("/demo/view/Alpha");
    });
    expect(setActiveViewModeMock).not.toHaveBeenCalled();

    await harness.unmount();
  });
});
