import { renderToStaticMarkup } from "react-dom/server";
import { useProjectState, useShareSession } from "state/definitions";
import { useLocalStorage } from "state/stores/uiPreferenceStores";
import { resetProjectStores } from "state/utils";
import { createProjectConfig } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViewModeTabs } from "./ViewModeTabs";

let latestProviderEnabled: boolean | undefined;

vi.mock("./ViewModeDnd", () => ({
  ViewModeSortableProvider: ({
    children,
    enabled,
  }: {
    children: unknown;
    enabled?: boolean;
  }) => {
    latestProviderEnabled = enabled;
    return children;
  },
  useViewModeSortableItem: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    setActivatorNodeRef: () => {},
    style: {},
    isDragging: false,
  }),
}));

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}) {
  if (!store.getInitialState) {
    return;
  }
  const initial = store.getInitialState();
  Object.assign(initial, store.getState());
}

describe("ViewModeTabs", () => {
  const memoryStorage = (() => {
    let store = new Map<string, string>();
    return {
      getItem: (name: string) => store.get(name) ?? null,
      setItem: (name: string, value: string) => {
        store.set(name, value);
      },
      removeItem: (name: string) => {
        store.delete(name);
      },
      reset: () => {
        store = new Map<string, string>();
      },
    };
  })();

  beforeEach(() => {
    resetProjectStores();
    latestProviderEnabled = undefined;
    memoryStorage.reset();
    useLocalStorage.persist.setOptions({
      storage: {
        getItem: memoryStorage.getItem,
        setItem: memoryStorage.setItem,
        removeItem: memoryStorage.removeItem,
      },
    });
    useShareSession.setState({ isDeploymentMode: false });
    useLocalStorage.setState({
      overviewTrueWidth: 50,
      uiEditorTrueWidth: 75,
    });
    syncStoreInitialState(useShareSession);
    syncStoreInitialState(useLocalStorage);
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("renders only view modes marked as tabs", () => {
    const tabId = "view-1";
    const hiddenId = "view-2";
    const projectConfig = createProjectConfig({
      id: "project-1",
      activeViewModeId: tabId,
      viewModes: {
        [tabId]: {
          id: tabId,
          name: "Tab View",
          sortIndex: 0,
          isUserFacing: false,
          isTab: true,
          visibilityBySectionId: {},
          viewport: { x: 0, y: 0, zoom: 1 },
          viewportInitialized: false,
          topLevelSections: {},
        },
        [hiddenId]: {
          id: hiddenId,
          name: "Hidden View",
          sortIndex: 1,
          isUserFacing: false,
          isTab: false,
          visibilityBySectionId: {},
          viewport: { x: 0, y: 0, zoom: 1 },
          viewportInitialized: false,
          topLevelSections: {},
        },
      },
    });

    useProjectState.setState((state) => {
      state.projectConfig = projectConfig;
    });
    syncStoreInitialState(useProjectState);

    const markup = renderToStaticMarkup(<ViewModeTabs />);
    expect(markup).toContain("Tab View");
    expect(markup).toContain('aria-label="Tab View"');
    expect(markup).not.toContain("Hidden View");
    expect(latestProviderEnabled).toBe(false);
    expect(markup).not.toContain('data-testid="view-mode-tab-drag-handle"');
  });

  it("returns empty markup when no tab view modes exist", () => {
    const viewId = "view-1";
    const projectConfig = createProjectConfig({
      id: "project-1",
      activeViewModeId: viewId,
      viewModes: {
        [viewId]: {
          id: viewId,
          name: "Hidden View",
          sortIndex: 0,
          isUserFacing: false,
          isTab: false,
          visibilityBySectionId: {},
          viewport: { x: 0, y: 0, zoom: 1 },
          viewportInitialized: false,
          topLevelSections: {},
        },
      },
    });

    useProjectState.setState((state) => {
      state.projectConfig = projectConfig;
    });
    syncStoreInitialState(useProjectState);

    const markup = renderToStaticMarkup(<ViewModeTabs />);
    expect(markup).toBe("");
  });

  it("orders tab view modes by sort index", () => {
    const firstId = "view-1";
    const secondId = "view-2";
    const thirdId = "view-3";
    const projectConfig = createProjectConfig({
      id: "project-1",
      activeViewModeId: firstId,
      viewModes: {
        [firstId]: {
          id: firstId,
          name: "First",
          sortIndex: 0,
          isUserFacing: false,
          isTab: true,
          visibilityBySectionId: {},
          viewport: { x: 0, y: 0, zoom: 1 },
          viewportInitialized: false,
          topLevelSections: {},
        },
        [secondId]: {
          id: secondId,
          name: "Second",
          sortIndex: 2,
          isUserFacing: false,
          isTab: true,
          visibilityBySectionId: {},
          viewport: { x: 0, y: 0, zoom: 1 },
          viewportInitialized: false,
          topLevelSections: {},
        },
        [thirdId]: {
          id: thirdId,
          name: "Third",
          sortIndex: 1,
          isUserFacing: false,
          isTab: true,
          visibilityBySectionId: {},
          viewport: { x: 0, y: 0, zoom: 1 },
          viewportInitialized: false,
          topLevelSections: {},
        },
      },
    });

    useProjectState.setState((state) => {
      state.projectConfig = projectConfig;
    });
    syncStoreInitialState(useProjectState);

    const markup = renderToStaticMarkup(<ViewModeTabs />);
    const firstIdx = markup.indexOf("First");
    const thirdIdx = markup.indexOf("Third");
    const secondIdx = markup.indexOf("Second");

    expect(firstIdx).toBeGreaterThan(-1);
    expect(thirdIdx).toBeGreaterThan(-1);
    expect(secondIdx).toBeGreaterThan(-1);
    expect(firstIdx).toBeLessThan(thirdIdx);
    expect(thirdIdx).toBeLessThan(secondIdx);
  });

  it("renders a visible drag handle when tab reordering is enabled", () => {
    const firstTabId = "view-1";
    const secondTabId = "view-2";
    const projectConfig = createProjectConfig({
      id: "project-1",
      activeViewModeId: firstTabId,
      viewModes: {
        [firstTabId]: {
          id: firstTabId,
          name: "Tab View",
          sortIndex: 0,
          isUserFacing: false,
          isTab: true,
          visibilityBySectionId: {},
          viewport: { x: 0, y: 0, zoom: 1 },
          viewportInitialized: false,
          topLevelSections: {},
        },
        [secondTabId]: {
          id: secondTabId,
          name: "Tab View 2",
          sortIndex: 1,
          isUserFacing: false,
          isTab: true,
          visibilityBySectionId: {},
          viewport: { x: 0, y: 0, zoom: 1 },
          viewportInitialized: false,
          topLevelSections: {},
        },
      },
    });

    useProjectState.setState((state) => {
      state.projectConfig = projectConfig;
    });
    syncStoreInitialState(useProjectState);

    const markup = renderToStaticMarkup(<ViewModeTabs />);
    expect(latestProviderEnabled).toBe(true);
    expect(markup).toContain('data-testid="view-mode-tab-drag-handle"');
    expect(markup).toContain('aria-label="Reorder view mode tab"');
    expect(markup).toContain("<svg");
  });
});
