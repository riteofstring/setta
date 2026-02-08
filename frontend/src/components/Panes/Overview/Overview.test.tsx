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
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Overview } from "./Overview";

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}) {
  // `renderToStaticMarkup` uses Zustand's getInitialState() snapshot rather than getState().
  // Keep the server snapshot aligned with our test's updated state.
  if (!store.getInitialState) {
    return;
  }
  const initial = store.getInitialState();
  Object.assign(initial, store.getState());
}

function extractRailStyle(markup: string): string {
  const match = markup.match(
    /class="fixed left-0[^"]*" style="([^"]*)"/,
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
});
