import { createWorkspaceShellViewState } from "@riteofstring/setta";
import { describe, expect, it, vi } from "vitest";

import {
  loadPythonCanvasShellViewState,
  persistPythonCanvasShellViewState,
  PYTHON_CANVAS_SHELL_PREFERENCE_KEY,
  PYTHON_CANVAS_SHELL_PREFERENCE_VERSION,
} from "./pythonCanvasShellPreferences";
import {
  PYTHON_CANVAS_PARAMS_TAB_ID,
  PYTHON_CANVAS_SECTION_SETTINGS_TAB_ID,
} from "./pythonCanvasRightPane";

function createStorageHarness(value: string | null) {
  return {
    getItem: vi.fn((_key: string) => value),
    setItem: vi.fn((_key: string, _value: string) => undefined),
  };
}

function pythonCanvasDefaultViewState() {
  return createWorkspaceShellViewState({
    trailingTabId: PYTHON_CANVAS_SECTION_SETTINGS_TAB_ID,
  });
}

function storedPreference(
  viewState: unknown,
  version = PYTHON_CANVAS_SHELL_PREFERENCE_VERSION,
): string {
  return JSON.stringify({ version, viewState });
}

describe("Python Canvas shell preferences", () => {
  it("starts from package defaults without overwriting a missing preference", () => {
    const storage = createStorageHarness(null);

    expect(loadPythonCanvasShellViewState(storage)).toEqual(
      pythonCanvasDefaultViewState(),
    );
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("round-trips a complete valid shell state", () => {
    const storage = createStorageHarness(null);
    const viewState = pythonCanvasDefaultViewState();
    viewState.leading.width = 410;
    viewState.leading.rememberedNonFullWidth = 390;
    viewState.trailing.visible = true;
    viewState.trailing.selectedTabId = PYTHON_CANVAS_PARAMS_TAB_ID;
    viewState.trailing.width = 540;
    viewState.trailing.rememberedNonFullWidth = 515;
    viewState.outline = {
      collapsedGroupIds: ["python-canvas:list:group"],
      focusedSectionId: "python-canvas:callable:focus",
    };

    persistPythonCanvasShellViewState(viewState, storage);

    expect(storage.setItem).toHaveBeenCalledOnce();
    expect(storage.setItem).toHaveBeenCalledWith(
      PYTHON_CANVAS_SHELL_PREFERENCE_KEY,
      JSON.stringify({
        version: PYTHON_CANVAS_SHELL_PREFERENCE_VERSION,
        viewState,
      }),
    );
    const saved = storage.setItem.mock.calls[0]?.[1];
    expect(typeof saved).toBe("string");
    if (typeof saved !== "string") {
      throw new Error("The shell preference was not serialized.");
    }
    expect(loadPythonCanvasShellViewState(createStorageHarness(saved))).toEqual(
      viewState,
    );
  });

  it.each([
    ["malformed JSON", "{"],
    [
      "a stale schema version",
      storedPreference(pythonCanvasDefaultViewState(), 1),
    ],
    ["a partial view state", storedPreference({ leading: {} })],
    [
      "an invalid leading tab ID",
      storedPreference({
        ...pythonCanvasDefaultViewState(),
        leading: {
          ...pythonCanvasDefaultViewState().leading,
          selectedTabId: "host-notes",
        },
      }),
    ],
    [
      "the retired Inspector tab ID",
      storedPreference({
        ...pythonCanvasDefaultViewState(),
        trailing: {
          ...pythonCanvasDefaultViewState().trailing,
          selectedTabId: "inspector",
        },
      }),
    ],
    [
      "a non-finite pane width",
      '{"version":2,"viewState":{"leading":{"selectedTabId":"outline","visible":true,"width":1e999,"rememberedNonFullWidth":335},"trailing":{"selectedTabId":"section-settings","visible":false,"width":500,"rememberedNonFullWidth":500},"outline":{"collapsedGroupIds":[],"focusedSectionId":null}}}',
    ],
    [
      "duplicate collapsed groups",
      storedPreference({
        ...pythonCanvasDefaultViewState(),
        outline: {
          collapsedGroupIds: [
            "python-canvas:list:group",
            "python-canvas:list:group",
          ],
          focusedSectionId: null,
        },
      }),
    ],
    [
      "a non-string collapsed group",
      storedPreference({
        ...pythonCanvasDefaultViewState(),
        outline: { collapsedGroupIds: [42], focusedSectionId: null },
      }),
    ],
  ])("falls back atomically for %s", (_description, serialized) => {
    const storage = createStorageHarness(serialized);

    expect(loadPythonCanvasShellViewState(storage)).toEqual(
      pythonCanvasDefaultViewState(),
    );
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("keeps valid in-memory state when browser storage is unavailable", () => {
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
    const viewState = pythonCanvasDefaultViewState();
    viewState.trailing.visible = true;

    expect(loadPythonCanvasShellViewState(readFailure)).toEqual(
      pythonCanvasDefaultViewState(),
    );
    expect(() =>
      persistPythonCanvasShellViewState(viewState, writeFailure),
    ).not.toThrow();
    expect(writeFailure.setItem).toHaveBeenCalledOnce();
  });
});
