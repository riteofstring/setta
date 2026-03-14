/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "testUtils/reactRefreshPreamble";
import { createProjectConfig } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeSidePanes } from "./HomeSidePanes";

const mocks = vi.hoisted(() => ({
  localStorageState: {
    homeWorkspacePaneVis: true,
    homeSelectedProjectPaneVis: true,
  },
  setState: vi.fn(),
}));

vi.mock("state/definitions", () => {
  const useLocalStorage = Object.assign(() => mocks.localStorageState, {
    getState: () => mocks.localStorageState,
    setState: mocks.setState,
  });

  return { useLocalStorage };
});

vi.mock("components/Utils/PaneContainer", () => ({
  PaneContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-pane-container">{children}</div>
  ),
}));

vi.mock("./HomeWorkspaceBrowserPane", () => ({
  HomeWorkspaceBrowserPane: () => (
    <div data-testid="mock-home-workspace-browser-pane">Workspace Browser</div>
  ),
}));

vi.mock("./HomeSelectedProjectDetails", () => ({
  HomeSelectedProjectDetails: () => (
    <div data-testid="mock-home-selected-project-details">
      Selected Project Details
    </div>
  ),
}));

describe("HomeSidePanes", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.localStorageState = {
      homeWorkspacePaneVis: true,
      homeSelectedProjectPaneVis: true,
    };
    mocks.setState.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders the workspace and selected-project side panes when enabled", () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <HomeSidePanes
            showSidePanes={true}
            homeWorkspacePaneVis={true}
            homeWorkspacePaneWidth={320}
            homeSelectedProjectPaneVis={true}
            homeSelectedProjectPaneWidth={320}
            isDeploymentMode={false}
            selectedDetailProject={createProjectConfig({
              id: "project-1",
              name: "Project One",
            })}
            defaultProjectConfigId="project-1"
          />
        </MemoryRouter>,
      );
    });

    expect(
      container.querySelector(
        '[data-testid="mock-home-workspace-browser-pane"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-testid="mock-home-selected-project-details"]',
      ),
    ).toBeTruthy();
  });

  it("toggles the persisted pane visibility state from the rail controls", () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <HomeSidePanes
            showSidePanes={true}
            homeWorkspacePaneVis={true}
            homeWorkspacePaneWidth={320}
            homeSelectedProjectPaneVis={true}
            homeSelectedProjectPaneWidth={320}
            isDeploymentMode={false}
            selectedDetailProject={null}
            defaultProjectConfigId={null}
          />
        </MemoryRouter>,
      );
    });

    const workspaceToggle = container.querySelector(
      '[data-testid="home-left-rail-workspace-toggle"]',
    );
    const selectedProjectToggle = container.querySelector(
      '[data-testid="home-right-rail-selected-project-toggle"]',
    );

    act(() => {
      workspaceToggle?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
      selectedProjectToggle?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(mocks.setState).toHaveBeenNthCalledWith(1, {
      homeWorkspacePaneVis: false,
    });
    expect(mocks.setState).toHaveBeenNthCalledWith(2, {
      homeSelectedProjectPaneVis: false,
    });
  });
});
