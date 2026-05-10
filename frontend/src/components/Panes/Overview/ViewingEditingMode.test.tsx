/* @vitest-environment jsdom */
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useProjectState, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { createProjectConfig, createViewMode } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViewingEditingMode } from "./ViewingEditingMode";
vi.mock("re-resizable", () => ({
  Resizable: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("components/Pages/Project/ViewModeDnd", () => ({
  SortableListProvider: ({ children }: { children: ReactNode }) => children,
  useSortableListItem: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    setActivatorNodeRef: () => {},
    style: {},
    isDragging: false,
  }),
}));
vi.mock("state/actions/activeSections", () => ({
  pruneActiveSectionIdsForViewMode: () => {},
}));
vi.mock("state/actions/project/loadProject", () => ({
  useCreateAndGoToProjectConfig: () => () => {},
}));
vi.mock("./ProjectConfigs", () => ({
  ProjectConfigs: () => <div data-testid="project-configs-placeholder" />,
}));
vi.mock("./WindowSpacesPane", () => ({
  WindowSpacesPane: () => <div data-testid="window-spaces-placeholder" />,
}));
const routeSetViewModeNameMock = vi.fn();
vi.mock("openapi/http", () => ({
  createViewMode: () => Promise.resolve(undefined),
  setActiveViewMode: () => Promise.resolve(undefined),
  setViewModeName: (...args: unknown[]) => routeSetViewModeNameMock(...args),
  toggleIsEditingViewMode: () => Promise.resolve(undefined),
  toggleViewModeTab: () => Promise.resolve(undefined),
  toggleViewModeUserFacing: () => Promise.resolve(undefined),
}));
describe("ViewingEditingMode", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    routeSetViewModeNameMock.mockReset();
    resetProjectStores();
    useShareSession.setState({ isDeploymentMode: false, sharePolicy: null });
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({
        id: "project-config-id",
        name: "Project Alpha",
        activeViewModeId: "view-mode-a",
        isEditingViewMode: true,
        viewModes: {
          "view-mode-a": createViewMode({
            id: "view-mode-a",
            name: "Focus",
            sortIndex: 0,
            isUserFacing: false,
            isTab: true,
            visibilityBySectionId: {},
            topLevelSections: {},
          }),
          "view-mode-b": createViewMode({
            id: "view-mode-b",
            name: "Details",
            sortIndex: 1,
            isUserFacing: false,
            isTab: true,
            visibilityBySectionId: {},
            topLevelSections: {},
          }),
        },
      });
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    resetProjectStores();
  });
  it("submits conflicting view-mode renames to the backend and shows the backend error", async () => {
    routeSetViewModeNameMock.mockResolvedValue({
      error: {
        detail:
          "View mode name 'Details' conflicts with existing view mode 'Details'.",
      },
      response: new Response(null, { status: 400 }),
    });
    await act(async () => {
      root.render(<ViewingEditingMode />);
    });
    const input = host.querySelector(
      '[data-view-mode-id="view-mode-a"] input',
    ) as HTMLInputElement | null;
    expect(input).not.toBeNull();
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(input, "Details");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      input?.focus();
      input?.blur();
    });
    expect(routeSetViewModeNameMock).toHaveBeenCalledTimes(1);
    expect(routeSetViewModeNameMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          projectConfigId: "project-config-id",
          viewModeId: "view-mode-a",
          name: "Details",
          frontendOpId: expect.any(String),
        }),
      }),
    );
    expect(host.textContent).toContain(
      "View mode name 'Details' conflicts with existing view mode 'Details'.",
    );
  });
});
