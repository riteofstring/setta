import { renderToStaticMarkup } from "react-dom/server";
import { useLocalStorage, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { createProjectConfig } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncStoreInitialState } from "../paneTestUtils";
import { UiEditor } from "./UiEditor";

function extractRailStyle(markup: string): string {
  const match = markup.match(
    /data-testid="ui-editor-icon-rail"[^>]*style="([^"]*)"/,
  );
  if (!match) {
    throw new Error("Unable to locate UiEditor rail in markup.");
  }
  return match[1] ?? "";
}

describe("UiEditor rail offsets", () => {
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
    useLocalStorage.persist.setOptions({
      storage: {
        getItem: memoryStorage.getItem,
        setItem: memoryStorage.setItem,
        removeItem: memoryStorage.removeItem,
      },
    });
    useLocalStorage.setState({
      uiEditorVis: false,
      uiEditorWidth: 425,
      uiEditorTrueWidth: 30,
    });
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

    const markup = renderToStaticMarkup(<UiEditor />);
    const style = extractRailStyle(markup);

    expect(markup).toContain("z-[32]");
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

    const markup = renderToStaticMarkup(<UiEditor />);
    const style = extractRailStyle(markup);

    expect(markup).toContain("z-[32]");
    expect(style).toContain("bottom:36px");
  });
});
