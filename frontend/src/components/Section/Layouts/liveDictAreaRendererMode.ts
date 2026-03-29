export const LIVE_DICT_AREA_RENDERER_QUERY_PARAM = "liveDictAreaRenderer";
export const LIVE_DICT_AREA_RENDERER_STORAGE_KEY =
  "setta.liveDictAreaRendererMode";

export const LIVE_DICT_AREA_RENDERER_MODES = ["dom", "pixi-node-body"] as const;

export type LiveDictAreaRendererMode =
  (typeof LIVE_DICT_AREA_RENDERER_MODES)[number];

export function resolveLiveDictAreaRendererMode({
  persistedMode,
  search,
}: {
  persistedMode?: string | null;
  search: string | null | undefined;
}): LiveDictAreaRendererMode {
  const requestedMode = new URLSearchParams(search ?? "").get(
    LIVE_DICT_AREA_RENDERER_QUERY_PARAM,
  );

  if (isLiveDictAreaRendererMode(requestedMode)) {
    return requestedMode;
  }

  if (isLiveDictAreaRendererMode(persistedMode)) {
    return persistedMode;
  }

  return "dom";
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
): void {
  const requestedMode = new URLSearchParams(search ?? "").get(
    LIVE_DICT_AREA_RENDERER_QUERY_PARAM,
  );

  if (!isLiveDictAreaRendererMode(requestedMode)) {
    return;
  }

  persistLiveDictAreaRendererMode(requestedMode);
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
