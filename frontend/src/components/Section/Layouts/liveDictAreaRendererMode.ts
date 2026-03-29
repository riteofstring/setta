export const LIVE_DICT_AREA_RENDERER_QUERY_PARAM = "liveDictAreaRenderer";
export const LIVE_DICT_AREA_RENDERER_STORAGE_KEY =
  "setta.liveDictAreaRendererMode";
export const LIVE_DICT_AREA_VIEWPORT_RENDERER_STORAGE_KEY =
  "setta.liveDictAreaViewportRendererMode";

export const LIVE_DICT_AREA_RENDERER_MODES = ["dom", "pixi-node-body"] as const;

export type LiveDictAreaRendererMode =
  (typeof LIVE_DICT_AREA_RENDERER_MODES)[number];

export type LiveDictAreaRendererViewportSyncPlan = {
  resolvedMode: LiveDictAreaRendererMode;
  shouldRequestViewportRefit: boolean;
};

export function readRequestedLiveDictAreaRendererMode(
  search: string | null | undefined,
): LiveDictAreaRendererMode | null {
  const requestedMode = new URLSearchParams(search ?? "").get(
    LIVE_DICT_AREA_RENDERER_QUERY_PARAM,
  );

  if (!isLiveDictAreaRendererMode(requestedMode)) {
    return null;
  }

  return requestedMode;
}

export function resolveLiveDictAreaRendererMode({
  persistedMode,
  search,
}: {
  persistedMode?: string | null;
  search: string | null | undefined;
}): LiveDictAreaRendererMode {
  const requestedMode = readRequestedLiveDictAreaRendererMode(search);

  if (isLiveDictAreaRendererMode(requestedMode)) {
    return requestedMode;
  }

  if (isLiveDictAreaRendererMode(persistedMode)) {
    return persistedMode;
  }

  return "dom";
}

export function getLiveDictAreaRendererViewportSyncPlan({
  persistedMode,
  previousViewportMode,
  search,
}: {
  persistedMode?: string | null;
  previousViewportMode?: string | null;
  search: string | null | undefined;
}): LiveDictAreaRendererViewportSyncPlan {
  const resolvedMode = resolveLiveDictAreaRendererMode({
    persistedMode,
    search,
  });
  const shouldRequestViewportRefit =
    previousViewportMode === null || previousViewportMode === undefined
      ? resolvedMode !== "dom"
      : previousViewportMode !== resolvedMode;

  return {
    resolvedMode,
    shouldRequestViewportRefit,
  };
}

export function readLiveDictAreaRendererModeFromWindow(): LiveDictAreaRendererMode {
  if (typeof globalThis.window !== "object") {
    return "dom";
  }

  const persistedMode = readPersistedLiveDictAreaRendererMode();
  const resolvedMode = resolveLiveDictAreaRendererMode({
    persistedMode,
    search: globalThis.location?.search ?? "",
  });

  persistLiveDictAreaRendererMode(resolvedMode);

  return resolvedMode;
}

export function syncLiveDictAreaRendererModeFromSearch(
  search: string | null | undefined,
): LiveDictAreaRendererViewportSyncPlan {
  const plan = getLiveDictAreaRendererViewportSyncPlan({
    persistedMode: readPersistedLiveDictAreaRendererMode(),
    previousViewportMode: readPersistedLiveDictAreaViewportRendererMode(),
    search,
  });

  persistLiveDictAreaRendererMode(plan.resolvedMode);
  persistLiveDictAreaViewportRendererMode(plan.resolvedMode);

  return plan;
}

function isLiveDictAreaRendererMode(
  value: string | null | undefined,
): value is LiveDictAreaRendererMode {
  return LIVE_DICT_AREA_RENDERER_MODES.includes(
    value as LiveDictAreaRendererMode,
  );
}

function readPersistedLiveDictAreaRendererMode(): string | null {
  try {
    return globalThis.window?.sessionStorage.getItem(
      LIVE_DICT_AREA_RENDERER_STORAGE_KEY,
    );
  } catch {
    return null;
  }
}

function readPersistedLiveDictAreaViewportRendererMode(): string | null {
  try {
    return globalThis.window?.sessionStorage.getItem(
      LIVE_DICT_AREA_VIEWPORT_RENDERER_STORAGE_KEY,
    );
  } catch {
    return null;
  }
}

function persistLiveDictAreaRendererMode(mode: LiveDictAreaRendererMode): void {
  try {
    globalThis.window?.sessionStorage.setItem(
      LIVE_DICT_AREA_RENDERER_STORAGE_KEY,
      mode,
    );
  } catch {
    // Ignore storage failures; the query param remains the explicit opt-in.
  }
}

function persistLiveDictAreaViewportRendererMode(
  mode: LiveDictAreaRendererMode,
): void {
  try {
    globalThis.window?.sessionStorage.setItem(
      LIVE_DICT_AREA_VIEWPORT_RENDERER_STORAGE_KEY,
      mode,
    );
  } catch {
    // Ignore storage failures; viewport refit remains best-effort only.
  }
}
