import { describe, expect, it } from "vitest";
import { readPersistedSettingsGraphLocalPaneState } from "../../../../../tests/e2e/settings/graphSubstrateParityProbe";

describe("readPersistedSettingsGraphLocalPaneState", () => {
  it("reads the persisted zustand state wrapper shape", () => {
    expect(
      readPersistedSettingsGraphLocalPaneState(
        JSON.stringify({
          state: {
            overviewVis: false,
            overviewTrueWidth: 420,
            snapToGrid: false,
            uiEditorVis: true,
            uiEditorTrueWidth: 320,
          },
        }),
      ),
    ).toEqual({
      overviewVisible: false,
      overviewTrueWidth: 420,
      snapToGrid: false,
      uiEditorVisible: true,
      uiEditorTrueWidth: 320,
    });
  });

  it("reads the legacy direct state shape", () => {
    expect(
      readPersistedSettingsGraphLocalPaneState(
        JSON.stringify({
          overviewVis: true,
          overviewTrueWidth: 500,
          snapToGrid: true,
          uiEditorVis: false,
          uiEditorTrueWidth: 40,
        }),
      ),
    ).toEqual({
      overviewVisible: true,
      overviewTrueWidth: 500,
      snapToGrid: true,
      uiEditorVisible: false,
      uiEditorTrueWidth: 40,
    });
  });

  it("returns null for malformed or incomplete payloads", () => {
    expect(readPersistedSettingsGraphLocalPaneState(null)).toBeNull();
    expect(readPersistedSettingsGraphLocalPaneState("{bad json")).toBeNull();
    expect(
      readPersistedSettingsGraphLocalPaneState(
        JSON.stringify({
          state: {
            overviewVis: true,
            overviewTrueWidth: 500,
          },
        }),
      ),
    ).toBeNull();
  });
});
