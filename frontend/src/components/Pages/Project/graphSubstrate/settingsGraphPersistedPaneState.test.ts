import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS_GRAPH_LOCAL_PANE_STATE,
  formatSettingsGraphPaneStateReadDiagnostic,
  readBrowserStorageStateLocalStorageEntry,
  readPersistedSettingsGraphLocalPaneState,
  readPersistedSettingsGraphLocalPaneStateFromBrowserStorageState,
  resolvePersistedSettingsGraphLocalPaneStateWriteValueFromBrowserStorageState,
  resolveSettingsGraphLocalPaneStateStorePatch,
  shouldUseDefaultSettingsGraphLocalPaneState,
  writePersistedSettingsGraphLocalPaneState,
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

  it("reads persisted pane state from browser-context storage state", () => {
    expect(
      readPersistedSettingsGraphLocalPaneStateFromBrowserStorageState({
        key: "setta_data",
        origin: "http://127.0.0.1:3075",
        origins: [
          {
            localStorage: [
              {
                name: "setta_data",
                value: JSON.stringify({
                  state: {
                    overviewVis: false,
                    overviewTrueWidth: 420,
                    snapToGrid: false,
                    uiEditorVis: true,
                    uiEditorTrueWidth: 320,
                  },
                }),
              },
            ],
            origin: "http://127.0.0.1:3075",
          },
        ],
      }),
    ).toEqual({
      overviewVisible: false,
      overviewTrueWidth: 420,
      snapToGrid: false,
      uiEditorVisible: true,
      uiEditorTrueWidth: 320,
    });
  });

  it("writes pane state into browser-context storage while preserving other keys", () => {
    expect(
      resolvePersistedSettingsGraphLocalPaneStateWriteValueFromBrowserStorageState(
        {
          key: "setta_data",
          origin: "http://127.0.0.1:3075",
          origins: [
            {
              localStorage: [
                {
                  name: "setta_data",
                  value: JSON.stringify({
                    state: {
                      darkMode: true,
                      overviewVis: true,
                      overviewTrueWidth: 512,
                      snapToGrid: true,
                      uiEditorVis: true,
                      uiEditorTrueWidth: 420,
                    },
                    version: 3,
                  }),
                },
              ],
              origin: "http://127.0.0.1:3075",
            },
          ],
          paneState: {
            overviewVisible: false,
            overviewTrueWidth: 420,
            snapToGrid: false,
            uiEditorVisible: false,
            uiEditorTrueWidth: 260,
          },
        },
      ),
    ).toBe(
      JSON.stringify({
        state: {
          darkMode: true,
          overviewVis: false,
          overviewTrueWidth: 420,
          snapToGrid: false,
          uiEditorVis: false,
          uiEditorTrueWidth: 260,
        },
        version: 3,
      }),
    );
  });

  it("returns null when browser-context storage state is malformed", () => {
    expect(
      readPersistedSettingsGraphLocalPaneStateFromBrowserStorageState({
        key: "setta_data",
        origin: "http://127.0.0.1:3075",
        origins: [
          {
            localStorage: [{ name: "setta_data", value: "{bad json" }],
            origin: "http://127.0.0.1:3075",
          },
        ],
      }),
    ).toBeNull();
  });

  it("writes pane state into the persisted wrapper while preserving other keys", () => {
    expect(
      writePersistedSettingsGraphLocalPaneState({
        paneState: {
          overviewVisible: false,
          overviewTrueWidth: 420,
          snapToGrid: false,
          uiEditorVisible: false,
          uiEditorTrueWidth: 260,
        },
        rawPersistedState: JSON.stringify({
          state: {
            darkMode: true,
            overviewVis: true,
            overviewTrueWidth: 512,
            snapToGrid: true,
            uiEditorVis: true,
            uiEditorTrueWidth: 420,
          },
          version: 3,
        }),
      }),
    ).toBe(
      JSON.stringify({
        state: {
          darkMode: true,
          overviewVis: false,
          overviewTrueWidth: 420,
          snapToGrid: false,
          uiEditorVis: false,
          uiEditorTrueWidth: 260,
        },
        version: 3,
      }),
    );
  });

  it("starts a fresh persisted payload when the existing value is malformed", () => {
    expect(
      writePersistedSettingsGraphLocalPaneState({
        paneState: {
          overviewVisible: true,
          overviewTrueWidth: 500,
          snapToGrid: true,
          uiEditorVisible: true,
          uiEditorTrueWidth: 425,
        },
        rawPersistedState: "{bad json",
      }),
    ).toBe(
      JSON.stringify({
        state: {
          overviewVis: true,
          overviewTrueWidth: 500,
          snapToGrid: true,
          uiEditorVis: true,
          uiEditorTrueWidth: 425,
        },
        version: 0,
      }),
    );
  });

  it("maps compare pane state into the live zustand pane store shape", () => {
    expect(
      resolveSettingsGraphLocalPaneStateStorePatch({
        overviewVisible: false,
        overviewTrueWidth: 420,
        snapToGrid: false,
        uiEditorVisible: false,
        uiEditorTrueWidth: 260,
      }),
    ).toEqual({
      overviewVis: false,
      overviewWidth: 420,
      overviewTrueWidth: 420,
      snapToGrid: false,
      uiEditorVis: false,
      uiEditorWidth: 260,
      uiEditorTrueWidth: 260,
    });
  });

  it("matches the canonical local-store defaults when persisted pane state is absent", () => {
    expect(DEFAULT_SETTINGS_GRAPH_LOCAL_PANE_STATE).toEqual({
      overviewVisible: true,
      overviewTrueWidth: 335,
      snapToGrid: true,
      uiEditorVisible: false,
      uiEditorTrueWidth: 40,
    });
  });

  it("uses the canonical defaults only when persisted pane state is absent everywhere", () => {
    const diagnostic = {
      appShellMounted: true,
      currentUrl: "http://127.0.0.1:3075/settings",
      documentReadyState: "complete",
      graphSurfaceMounted: true,
      headerNotificationVisible: false,
      persistedPaneStateParseable: false,
      persistedPaneStatePresent: false,
      settingsContentMounted: true,
    } satisfies Parameters<
      typeof shouldUseDefaultSettingsGraphLocalPaneState
    >[0]["diagnostic"];

    expect(
      shouldUseDefaultSettingsGraphLocalPaneState({
        browserContextPersistedPaneState: null,
        diagnostic,
      }),
    ).toBe(true);

    expect(
      shouldUseDefaultSettingsGraphLocalPaneState({
        browserContextPersistedPaneState: {
          overviewVisible: false,
          overviewTrueWidth: 420,
          snapToGrid: false,
          uiEditorVisible: true,
          uiEditorTrueWidth: 320,
        },
        diagnostic,
      }),
    ).toBe(false);

    expect(
      shouldUseDefaultSettingsGraphLocalPaneState({
        browserContextPersistedPaneState: null,
        diagnostic: {
          ...diagnostic,
          persistedPaneStatePresent: true,
          persistedPaneStateParseable: true,
        },
      }),
    ).toBe(false);
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
