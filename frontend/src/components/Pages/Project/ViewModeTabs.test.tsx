import { renderToStaticMarkup } from "react-dom/server";
import {
  useLocalStorage,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import { createProjectConfig } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ViewModeTabs } from "./ViewModeTabs";

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
    memoryStorage.reset();
    if (useLocalStorage.persist) {
      useLocalStorage.persist.setOptions({
        storage: {
          getItem: memoryStorage.getItem,
          setItem: memoryStorage.setItem,
          removeItem: memoryStorage.removeItem,
        },
      });
    }
    useShareSession.setState({ isShareMode: false });
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
          isUserFacing: false,
          isTab: true,
          visibilityBySectionId: {},
        },
        [hiddenId]: {
          id: hiddenId,
          name: "Hidden View",
          isUserFacing: false,
          isTab: false,
          visibilityBySectionId: {},
        },
      },
    });

    useProjectState.setState((state) => {
      state.projectConfig = projectConfig;
    });
    syncStoreInitialState(useProjectState);

    const markup = renderToStaticMarkup(<ViewModeTabs />);
    expect(markup).toContain("Tab View");
    expect(markup).not.toContain("Hidden View");
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
          isUserFacing: false,
          isTab: false,
          visibilityBySectionId: {},
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
});
