import { describe, expect, it } from "vitest";
import {
  formatSettingsGraphPaneStateReadDiagnostic,
  readBrowserStorageStateLocalStorageEntry,
  readPersistedSettingsGraphLocalPaneState,
} from "./settingsGraphPersistedPaneState";

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

  it("reads browser-context local storage for the matching origin only", () => {
    expect(
      readBrowserStorageStateLocalStorageEntry({
        key: "setta_data",
        origin: "http://127.0.0.1:3075",
        origins: [
          {
            localStorage: [
              { name: "setta_data", value: '{"state":{}}' },
              { name: "other_key", value: "ignored" },
            ],
            origin: "http://127.0.0.1:3075",
          },
          {
            localStorage: [{ name: "setta_data", value: "wrong-origin" }],
            origin: "http://127.0.0.1:3087",
          },
        ],
      }),
    ).toBe('{"state":{}}');
  });

  it("returns null when browser-context local storage misses the key", () => {
    expect(
      readBrowserStorageStateLocalStorageEntry({
        key: "setta_data",
        origin: "http://127.0.0.1:3075",
        origins: [
          {
            localStorage: [{ name: "other_key", value: "ignored" }],
            origin: "http://127.0.0.1:3075",
          },
        ],
      }),
    ).toBeNull();
  });

  it("formats pane-state read diagnostics as stable json", () => {
    expect(
      formatSettingsGraphPaneStateReadDiagnostic({
        appShellMounted: true,
        currentUrl: "http://127.0.0.1:3075/settings",
        documentReadyState: "complete",
        graphSurfaceMounted: false,
        headerNotificationVisible: false,
        persistedPaneStateParseable: false,
        persistedPaneStatePresent: false,
        settingsContentMounted: false,
      }),
    ).toBe(
      JSON.stringify({
        appShellMounted: true,
        currentUrl: "http://127.0.0.1:3075/settings",
        documentReadyState: "complete",
        graphSurfaceMounted: false,
        headerNotificationVisible: false,
        persistedPaneStateParseable: false,
        persistedPaneStatePresent: false,
        settingsContentMounted: false,
      }),
    );
  });
});
