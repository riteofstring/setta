export type SettingsGraphLocalPaneState = {
  overviewVisible: boolean;
  overviewTrueWidth: number;
  snapToGrid: boolean;
  uiEditorVisible: boolean;
  uiEditorTrueWidth: number;
};

export type SettingsGraphPaneStateReadDiagnostic = {
  appShellMounted: boolean;
  currentUrl: string;
  documentReadyState: string;
  graphSurfaceMounted: boolean;
  headerNotificationVisible: boolean;
  persistedPaneStateParseable: boolean;
  persistedPaneStatePresent: boolean;
  settingsContentMounted: boolean;
};

export type SettingsGraphBrowserStorageStateOrigin = {
  localStorage: Array<{
    name: string;
    value: string;
  }>;
  origin: string;
};

export function readBrowserStorageStateLocalStorageEntry(args: {
  key: string;
  origin: string;
  origins: Array<SettingsGraphBrowserStorageStateOrigin>;
}): string | null {
  const matchingOrigin = args.origins.find(
    (originState) => originState.origin === args.origin,
  );
  if (!matchingOrigin) {
    return null;
  }
  return (
    matchingOrigin.localStorage.find((entry) => entry.name === args.key)
      ?.value ?? null
  );
}

export function readPersistedSettingsGraphLocalPaneState(
  rawPersistedState: string | null,
): SettingsGraphLocalPaneState | null {
  if (!rawPersistedState) {
    return null;
  }

  let parsedPersistedState: unknown;
  try {
    parsedPersistedState = JSON.parse(rawPersistedState);
  } catch {
    return null;
  }

  if (
    !parsedPersistedState ||
    typeof parsedPersistedState !== "object" ||
    Array.isArray(parsedPersistedState)
  ) {
    return null;
  }

  const persistedContainer = parsedPersistedState as {
    state?: unknown;
  };
  const persistedState =
    persistedContainer.state &&
    typeof persistedContainer.state === "object" &&
    !Array.isArray(persistedContainer.state)
      ? persistedContainer.state
      : parsedPersistedState;

  const paneState = persistedState as Record<string, unknown>;
  if (
    typeof paneState.overviewVis !== "boolean" ||
    typeof paneState.overviewTrueWidth !== "number" ||
    typeof paneState.snapToGrid !== "boolean" ||
    typeof paneState.uiEditorVis !== "boolean" ||
    typeof paneState.uiEditorTrueWidth !== "number"
  ) {
    return null;
  }

  return {
    overviewVisible: paneState.overviewVis,
    overviewTrueWidth: paneState.overviewTrueWidth,
    snapToGrid: paneState.snapToGrid,
    uiEditorVisible: paneState.uiEditorVis,
    uiEditorTrueWidth: paneState.uiEditorTrueWidth,
  };
}

export function formatSettingsGraphPaneStateReadDiagnostic(
  diagnostic: SettingsGraphPaneStateReadDiagnostic,
): string {
  return JSON.stringify(diagnostic);
}
