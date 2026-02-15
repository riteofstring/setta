import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import {
  useLocalStorage,
  useProjectState,
  useSettings,
  useShareSession,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import { OverviewTabNameEnum } from "utils/constants";
import { createProjectConfig, createSettingsState } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncStoreInitialState } from "../paneTestUtils";
import { Overview } from "./Overview";

vi.mock("components/Pages/Project/ViewModeDnd", () => ({
  ViewModeSortableProvider: ({ children }: { children: unknown }) => children,
  useViewModeSortableItem: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    style: {},
    isDragging: false,
  }),
}));

function extractRailStyle(markup: string): string {
  const match = markup.match(
    /data-testid="overview-icon-rail"[^>]*style="([^"]*)"/,
  );
  if (!match) {
    throw new Error("Unable to locate Overview rail in markup.");
  }
  return match[1] ?? "";
}

describe("Overview rail offsets", () => {
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
    memoryStorage.reset();
    useSettings.setState(createSettingsState());
    useLocalStorage.persist.setOptions({
      storage: {
        getItem: memoryStorage.getItem,
        setItem: memoryStorage.setItem,
        removeItem: memoryStorage.removeItem,
      },
    });
    useShareSession.setState({ isDeploymentMode: false, sharePolicy: null });
    useLocalStorage.setState({
      overviewVis: true,
      overviewTab: OverviewTabNameEnum.Overview,
      overviewWidth: 320,
      overviewTrueWidth: 320,
    });
    syncStoreInitialState(useShareSession);
    syncStoreInitialState(useSettings);
    syncStoreInitialState(useLocalStorage);
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("extends to the bottom when no view mode tabs exist", () => {
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

    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <Overview />
      </MemoryRouter>,
    );
    const style = extractRailStyle(markup);

    expect(style).toContain("bottom:0px");
  });

  it("reserves space for the bottom tab strip when view mode tabs exist", () => {
    const viewId = "view-1";
    const projectConfig = createProjectConfig({
      id: "project-1",
      activeViewModeId: viewId,
      viewModes: {
        [viewId]: {
          id: viewId,
          name: "Tab View",
          sortIndex: 0,
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

    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <Overview />
      </MemoryRouter>,
    );
    const style = extractRailStyle(markup);

    expect(style).toContain("bottom:36px");
  });

  it("renders the View Modes pane content when the view modes tab is selected", () => {
    const viewId = "view-1";
    const projectConfig = createProjectConfig({
      id: "project-1",
      activeViewModeId: viewId,
      viewModes: {
        [viewId]: {
          id: viewId,
          name: "Default View",
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
    useLocalStorage.setState({ overviewTab: OverviewTabNameEnum.ViewModes });
    syncStoreInitialState(useProjectState);
    syncStoreInitialState(useLocalStorage);
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <Overview />
      </MemoryRouter>,
    );

    expect(markup).toContain("View Modes");
    expect(markup).toContain("Project Configs");
    expect(markup).toContain("view-modes-project-configs-toggle");
    expect(markup).toContain("view-modes-project-configs-resize-handle");
    expect(markup).toContain("view-modes-project-configs-section");
    expect(markup).toContain("Toggle config previews.");
  });

  it("renders the project ai chat icon before the overview icon by default", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <Overview />
      </MemoryRouter>,
    );

    const chatIndex = markup.indexOf(
      'data-testid="overview-tab-project-ai-chat"',
    );
    const overviewIndex = markup.indexOf('data-testid="overview-tab-overview"');

    expect(chatIndex).toBeGreaterThanOrEqual(0);
    expect(overviewIndex).toBeGreaterThanOrEqual(0);
    expect(chatIndex).toBeLessThan(overviewIndex);
  });
});
