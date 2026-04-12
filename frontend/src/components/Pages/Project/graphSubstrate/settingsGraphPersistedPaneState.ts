export type SettingsGraphLocalPaneState = {
  overviewVisible: boolean;
  overviewTrueWidth: number;
  snapToGrid: boolean;
  uiEditorVisible: boolean;
  uiEditorTrueWidth: number;
};

export type SettingsGraphLocalPaneStateStorePatch = {
  overviewVis: boolean;
  overviewWidth: number;
  overviewTrueWidth: number;
  snapToGrid: boolean;
  uiEditorVis: boolean;
  uiEditorWidth: number;
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

type SettingsGraphPersistedStatePayload = {
  state: Record<string, unknown>;
  version: number;
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

function readPersistedSettingsGraphStatePayload(
  rawPersistedState: string | null,
): SettingsGraphPersistedStatePayload | null {
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

  const parsedRecord = parsedPersistedState as {
    state?: unknown;
    version?: unknown;
  };

  return {
    state:
      parsedRecord.state &&
      typeof parsedRecord.state === "object" &&
      !Array.isArray(parsedRecord.state)
        ? { ...(parsedRecord.state as Record<string, unknown>) }
        : { ...(parsedPersistedState as Record<string, unknown>) },
    version:
      typeof parsedRecord.version === "number" ? parsedRecord.version : 0,
  };
}

export function readPersistedSettingsGraphLocalPaneState(
  rawPersistedState: string | null,
): SettingsGraphLocalPaneState | null {
  const payload = readPersistedSettingsGraphStatePayload(rawPersistedState);
  if (!payload) {
    return null;
  }
  const paneState = payload.state;
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

export function readPersistedSettingsGraphLocalPaneStateFromBrowserStorageState(args: {
  key: string;
  origin: string;
  origins: Array<SettingsGraphBrowserStorageStateOrigin>;
}): SettingsGraphLocalPaneState | null {
  return readPersistedSettingsGraphLocalPaneState(
    readBrowserStorageStateLocalStorageEntry(args),
  );
}

export function resolvePersistedSettingsGraphLocalPaneStateWriteValueFromBrowserStorageState(args: {
  key: string;
  origin: string;
  origins: Array<SettingsGraphBrowserStorageStateOrigin>;
  paneState: SettingsGraphLocalPaneState;
}): string {
  return writePersistedSettingsGraphLocalPaneState({
    paneState: args.paneState,
    rawPersistedState: readBrowserStorageStateLocalStorageEntry(args),
  });
}

export function writePersistedSettingsGraphLocalPaneState(args: {
  paneState: SettingsGraphLocalPaneState;
  rawPersistedState: string | null;
}): string {
  const existingPayload = readPersistedSettingsGraphStatePayload(
    args.rawPersistedState,
  );
  const nextPayload: SettingsGraphPersistedStatePayload = {
    state: {
      ...(existingPayload?.state ?? {}),
      overviewVis: args.paneState.overviewVisible,
      overviewTrueWidth: args.paneState.overviewTrueWidth,
      snapToGrid: args.paneState.snapToGrid,
      uiEditorVis: args.paneState.uiEditorVisible,
      uiEditorTrueWidth: args.paneState.uiEditorTrueWidth,
    },
    version: existingPayload?.version ?? 0,
  };
  return JSON.stringify(nextPayload);
}

export function resolveSettingsGraphLocalPaneStateStorePatch(
  paneState: SettingsGraphLocalPaneState,
): SettingsGraphLocalPaneStateStorePatch {
  return {
    overviewVis: paneState.overviewVisible,
    overviewWidth: paneState.overviewTrueWidth,
    overviewTrueWidth: paneState.overviewTrueWidth,
    snapToGrid: paneState.snapToGrid,
    uiEditorVis: paneState.uiEditorVisible,
    uiEditorWidth: paneState.uiEditorTrueWidth,
    uiEditorTrueWidth: paneState.uiEditorTrueWidth,
  };
}

export function formatSettingsGraphPaneStateReadDiagnostic(
  diagnostic: SettingsGraphPaneStateReadDiagnostic,
): string {
  return JSON.stringify(diagnostic);
}
