import { createWorkspaceShellViewState } from "@setta/workspace";
import { describe, expect, it, vi } from "vitest";

import {
  loadPythonCanvasShellViewState,
  persistPythonCanvasShellViewState,
  PYTHON_CANVAS_SHELL_PREFERENCE_KEY,
  PYTHON_CANVAS_SHELL_PREFERENCE_VERSION,
} from "./pythonCanvasShellPreferences";

function createStorageHarness(value: string | null) {
  return {
    getItem: vi.fn((_key: string) => value),
    setItem: vi.fn((_key: string, _value: string) => undefined),
  };
}

function storedPreference(viewState: unknown, version = 1): string {
  return JSON.stringify({ version, viewState });
}

describe("Python Canvas shell preferences", () => {
  it("starts from package defaults without overwriting a missing preference", () => {
    const storage = createStorageHarness(null);

    expect(loadPythonCanvasShellViewState(storage)).toEqual(
      createWorkspaceShellViewState(),
    );
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("round-trips a complete valid shell state", () => {
    const storage = createStorageHarness(null);
    const viewState = createWorkspaceShellViewState();
    viewState.leading.width = 410;
    viewState.leading.rememberedNonFullWidth = 390;
    viewState.trailing.visible = true;
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
      storedPreference(createWorkspaceShellViewState(), 0),
    ],
    ["a partial view state", storedPreference({ leading: {} })],
    [
      "an invalid built-in tab ID",
      storedPreference({
        ...createWorkspaceShellViewState(),
        leading: {
          ...createWorkspaceShellViewState().leading,
          selectedTabId: "host-notes",
        },
      }),
    ],
    [
      "a non-finite pane width",
      '{"version":1,"viewState":{"leading":{"selectedTabId":"outline","visible":true,"width":1e999,"rememberedNonFullWidth":335},"trailing":{"selectedTabId":"inspector","visible":false,"width":500,"rememberedNonFullWidth":500},"outline":{"collapsedGroupIds":[],"focusedSectionId":null}}}',
    ],
    [
      "duplicate collapsed groups",
      storedPreference({
        ...createWorkspaceShellViewState(),
        outline: {
          collapsedGroupIds: ["python-canvas:list:group", "python-canvas:list:group"],
          focusedSectionId: null,
        },
      }),
    ],
    [
      "a non-string collapsed group",
      storedPreference({
        ...createWorkspaceShellViewState(),
        outline: { collapsedGroupIds: [42], focusedSectionId: null },
      }),
    ],
  ])("falls back atomically for %s", (_description, serialized) => {
    const storage = createStorageHarness(serialized);

    expect(loadPythonCanvasShellViewState(storage)).toEqual(
      createWorkspaceShellViewState(),
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
    const viewState = createWorkspaceShellViewState();
    viewState.trailing.visible = true;

    expect(loadPythonCanvasShellViewState(readFailure)).toEqual(
      createWorkspaceShellViewState(),
    );
    expect(() => persistPythonCanvasShellViewState(viewState, writeFailure)).not.toThrow();
    expect(writeFailure.setItem).toHaveBeenCalledOnce();
  });
});
