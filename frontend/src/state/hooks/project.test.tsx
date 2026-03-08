/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { useProjectLoading, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLoadProjectConfig } from "./project";

const loadProjectConfigMock = vi.fn();

vi.mock("state/actions/project/loadProject", () => ({
  loadProjectConfig: (...args: unknown[]) => loadProjectConfigMock(...args),
}));

vi.mock("utils/hotReload", () => ({
  useHotReload: () => false,
}));

function NavigateButton({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      data-testid={`navigate-${to}`}
      onClick={() => {
        navigate(to);
      }}
    >
      Navigate
    </button>
  );
}

function LoadProbe() {
  const [doneLoading, is404] = useLoadProjectConfig();
  const projectConfigName = useProjectState(
    (state) => state.projectConfig.name,
  );
  const projectConfigId = useProjectState((state) => state.projectConfig.id);

  return (
    <div
      data-testid="load-probe"
      data-done-loading={doneLoading ? "true" : "false"}
      data-is-404={is404 ? "true" : "false"}
      data-project-config-name={projectConfigName}
      data-project-config-id={projectConfigId}
    />
  );
}

describe("useLoadProjectConfig", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetProjectStores();
    useProjectLoading.setState({
      projectIsLoading: false,
      projectIs404: false,
    });
    loadProjectConfigMock.mockReset();
    loadProjectConfigMock.mockImplementation(
      async ({
        projectConfigName,
      }: {
        projectConfigName: string | undefined;
      }) => {
        const normalizedProjectConfigName = projectConfigName ?? "";
        useProjectState.setState((state) => {
          state.projectConfig.id = `${normalizedProjectConfigName}-id`;
          state.projectConfig.name = normalizedProjectConfigName;
        });
        return true;
      },
    );
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
  });

  it("reloads when the route project config changes without explicit page-load state", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/alpha"]}>
          <Routes>
            <Route
              path="/:projectConfigName"
              element={
                <>
                  <LoadProbe />
                  <NavigateButton to="/beta" />
                </>
              }
            />
          </Routes>
        </MemoryRouter>,
      );
    });

    await vi.waitFor(() => {
      const probe = host.querySelector('[data-testid="load-probe"]');
      expect(probe?.getAttribute("data-done-loading")).toBe("true");
      expect(probe?.getAttribute("data-project-config-name")).toBe("alpha");
      expect(probe?.getAttribute("data-project-config-id")).toBe("alpha-id");
    });

    await act(async () => {
      const navigateButton = host.querySelector(
        '[data-testid="navigate-/beta"]',
      );
      if (!(navigateButton instanceof HTMLButtonElement)) {
        throw new Error("Expected navigate button.");
      }
      navigateButton.click();
    });

    await vi.waitFor(() => {
      const probe = host.querySelector('[data-testid="load-probe"]');
      expect(probe?.getAttribute("data-is-404")).toBe("false");
      expect(probe?.getAttribute("data-project-config-name")).toBe("beta");
      expect(probe?.getAttribute("data-project-config-id")).toBe("beta-id");
      expect(useProjectLoading.getState().projectIsLoading).toBe(false);
    });

    expect(loadProjectConfigMock).toHaveBeenCalledTimes(2);
    expect(loadProjectConfigMock).toHaveBeenNthCalledWith(1, {
      projectConfigName: "alpha",
    });
    expect(loadProjectConfigMock).toHaveBeenNthCalledWith(2, {
      projectConfigName: "beta",
    });
  });
});
