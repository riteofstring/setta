import {
  createWorkspaceSavedViewsState,
  type WorkspaceDocumentInput,
} from "@riteofstring/setta";
import { describe, expect, it, vi } from "vitest";

import {
  loadPythonCanvasSavedViews,
  persistPythonCanvasSavedViews,
  PYTHON_CANVAS_SAVED_VIEWS_PREFERENCE_VERSION,
  pythonCanvasSavedViewsPreferenceKey,
} from "./pythonCanvasSavedViewsPreferences";

function savedViewsDocument(): WorkspaceDocumentInput {
  return {
    activeIds: [],
    savedViews: null,
    sections: {},
    topLevelSections: {},
    viewport: null,
  };
}

function createStorageHarness(values = new Map<string, string>()) {
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
}

describe("Python Canvas saved-view preferences", () => {
  it("round-trips the current exact payload for its canonical project", () => {
    const storage = createStorageHarness();
    const savedViews = createWorkspaceSavedViewsState(savedViewsDocument(), {
      id: "overview",
      name: "Overview",
    });

    expect(
      persistPythonCanvasSavedViews("project:one", savedViews, storage),
    ).toEqual({ kind: "persisted" });
    expect(storage.setItem).toHaveBeenCalledWith(
      pythonCanvasSavedViewsPreferenceKey("project:one"),
      JSON.stringify({
        savedViews,
        version: PYTHON_CANVAS_SAVED_VIEWS_PREFERENCE_VERSION,
      }),
    );
    expect(loadPythonCanvasSavedViews("project:one", storage)).toEqual({
      kind: "loaded",
      savedViews,
    });
  });

  it("keeps saved views scoped to the exact canonical project id", () => {
    const storage = createStorageHarness();
    const savedViews = createWorkspaceSavedViewsState(savedViewsDocument(), {
      id: "overview",
      name: "Overview",
    });

    persistPythonCanvasSavedViews("project:one", savedViews, storage);

    expect(loadPythonCanvasSavedViews("project:two", storage)).toEqual({
      kind: "missing",
    });
    expect(pythonCanvasSavedViewsPreferenceKey("project:one")).toBe(
      "setta.python-canvas.saved-views:project:one",
    );
  });

  it.each([
    ["malformed JSON", "{"],
    ["a prior payload version", JSON.stringify({ savedViews: {}, version: 0 })],
    [
      "an additional payload field",
      JSON.stringify({ extra: true, savedViews: {}, version: 1 }),
    ],
    [
      "an invalid saved-view state",
      JSON.stringify({
        savedViews: { activeViewId: "overview", views: {} },
        version: 1,
      }),
    ],
  ])(
    "rejects %s without attempting a compatibility migration",
    (_case, value) => {
      const storage = createStorageHarness(
        new Map([[pythonCanvasSavedViewsPreferenceKey("project:one"), value]]),
      );

      expect(loadPythonCanvasSavedViews("project:one", storage)).toEqual({
        kind: "malformed",
      });
      expect(storage.setItem).not.toHaveBeenCalled();
    },
  );

  it("reports browser storage read and write failures", () => {
    const readFailure = {
      getItem: vi.fn(() => {
        throw new Error("storage disabled");
      }),
      setItem: vi.fn(),
    };
    const writeFailure = {
      getItem: vi.fn(),
      setItem: vi.fn(() => {
        throw new Error("quota exceeded");
      }),
    };
    const savedViews = createWorkspaceSavedViewsState(savedViewsDocument(), {
      id: "overview",
      name: "Overview",
    });

    expect(loadPythonCanvasSavedViews("project:one", readFailure)).toEqual({
      kind: "unavailable",
    });
    expect(
      persistPythonCanvasSavedViews("project:one", savedViews, writeFailure),
    ).toEqual({ kind: "unavailable" });
  });
});
