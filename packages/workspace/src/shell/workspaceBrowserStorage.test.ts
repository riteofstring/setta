import { describe, expect, it } from "vitest";
import { parseWorkspaceSavedViewsState } from "../saved-views/state";
import {
  loadWorkspaceSavedViews,
  loadWorkspaceShellViewState,
  saveWorkspaceSavedViews,
  saveWorkspaceShellViewState,
  type WorkspaceBrowserStorage,
} from "./workspaceBrowserStorage";
import { createWorkspaceShellViewState } from "./workspaceShellLayout";

function memoryStorage(): WorkspaceBrowserStorage & {
  entries: Map<string, string>;
} {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
}

const failingStorage: WorkspaceBrowserStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("quota exceeded");
  },
};

const fallback = createWorkspaceShellViewState({ trailingTabId: "params" });
const tabOptions = {
  fallback,
  leadingTabIds: ["outline"],
  trailingTabIds: ["inspector", "params"],
};

const savedViews = parseWorkspaceSavedViewsState({
  activeViewId: "focus",
  views: {
    focus: {
      id: "focus",
      isTab: true,
      name: "Focus",
      sortIndex: 0,
      topLevelSections: { alpha: { h: 100, w: 200, x: 0, y: 0, zIndex: 0 } },
      viewport: { x: 10, y: 20, zoom: 1.5 },
      sectionVisibility: { alpha: true },
    },
  },
});

describe("workspace browser storage", () => {
  it("restores a saved shell view state", () => {
    const storage = memoryStorage();
    const changed = {
      ...fallback,
      leading: { ...fallback.leading, visible: false, width: 410 },
      trailing: { ...fallback.trailing, selectedTabId: "inspector" },
      outline: { collapsedGroupIds: ["group"], focusedSectionId: "alpha" },
    };

    expect(saveWorkspaceShellViewState("shell", changed, { storage })).toBe(
      true,
    );
    expect(
      loadWorkspaceShellViewState("shell", { ...tabOptions, storage }),
    ).toEqual(changed);
  });

  it("falls back when the stored shell state is missing, malformed, or names a tab that no longer exists", () => {
    const storage = memoryStorage();
    expect(
      loadWorkspaceShellViewState("shell", { ...tabOptions, storage }),
    ).toBe(fallback);

    storage.entries.set("shell", "{not json");
    expect(
      loadWorkspaceShellViewState("shell", { ...tabOptions, storage }),
    ).toBe(fallback);

    saveWorkspaceShellViewState(
      "shell",
      {
        ...fallback,
        trailing: { ...fallback.trailing, selectedTabId: "gone" },
      },
      { storage },
    );
    expect(
      loadWorkspaceShellViewState("shell", { ...tabOptions, storage }),
    ).toBe(fallback);

    storage.entries.set("shell", JSON.stringify({ ...fallback, extra: true }));
    expect(
      loadWorkspaceShellViewState("shell", { ...tabOptions, storage }),
    ).toBe(fallback);
  });

  it("restores saved views and rejects invalid stored views", () => {
    const storage = memoryStorage();
    expect(loadWorkspaceSavedViews("views", { storage })).toBeNull();

    expect(saveWorkspaceSavedViews("views", savedViews, { storage })).toBe(
      true,
    );
    expect(loadWorkspaceSavedViews("views", { storage })).toEqual(savedViews);

    storage.entries.set(
      "views",
      JSON.stringify({ ...savedViews, activeViewId: "missing" }),
    );
    expect(loadWorkspaceSavedViews("views", { storage })).toBeNull();
  });

  it("reports unavailable storage without throwing", () => {
    for (const storage of [failingStorage, null]) {
      expect(saveWorkspaceShellViewState("shell", fallback, { storage })).toBe(
        false,
      );
      expect(saveWorkspaceSavedViews("views", savedViews, { storage })).toBe(
        false,
      );
      expect(
        loadWorkspaceShellViewState("shell", { ...tabOptions, storage }),
      ).toBe(fallback);
      expect(loadWorkspaceSavedViews("views", { storage })).toBeNull();
    }
  });
});
