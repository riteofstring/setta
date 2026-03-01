import { getSafeLocalStorageAdapter } from "utils/safeLocalStorage";

export type SceneGraphRendererBackendPreference =
  | "auto"
  | "webgpu"
  | "webgl"
  | "dom";

export type SceneGraphRendererFlags = {
  enabled: boolean;
  backend: SceneGraphRendererBackendPreference;
  domIslandRadius: number;
  debugOverlay: boolean;
};

export const SCENE_GRAPH_RENDERER_FLAG_KEYS = {
  enabled: "setta.sceneGraphRenderer.enabled",
  backend: "setta.sceneGraphRenderer.backend",
  domIslandRadius: "setta.sceneGraphRenderer.domIslandRadius",
  debugOverlay: "setta.sceneGraphRenderer.debugOverlay",
} as const;

type SceneGraphRendererStorageAdapter = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

const SCENE_GRAPH_RENDERER_STORAGE_NAMESPACE = "sceneGraphRenderer";
const ALLOWED_BACKEND_PREFERENCES: readonly SceneGraphRendererBackendPreference[] =
  ["auto", "webgpu", "webgl", "dom"];
const MIN_DOM_ISLAND_RADIUS = 0;
const MAX_DOM_ISLAND_RADIUS = 16;

export const DEFAULT_SCENE_GRAPH_RENDERER_FLAGS: SceneGraphRendererFlags = {
  enabled: false,
  backend: "auto",
  domIslandRadius: 2,
  debugOverlay: false,
};

export type SceneGraphRendererFlagStorageKey =
  (typeof SCENE_GRAPH_RENDERER_FLAG_KEYS)[keyof typeof SCENE_GRAPH_RENDERER_FLAG_KEYS];

export function isSceneGraphRendererFlagStorageKey(
  key: string | null,
): key is SceneGraphRendererFlagStorageKey {
  if (typeof key !== "string") {
    return false;
  }
  return (
    key === SCENE_GRAPH_RENDERER_FLAG_KEYS.enabled ||
    key === SCENE_GRAPH_RENDERER_FLAG_KEYS.backend ||
    key === SCENE_GRAPH_RENDERER_FLAG_KEYS.domIslandRadius ||
    key === SCENE_GRAPH_RENDERER_FLAG_KEYS.debugOverlay
  );
}

export function readSceneGraphRendererFlags(
  storage: SceneGraphRendererStorageAdapter = getSafeLocalStorageAdapter(
    SCENE_GRAPH_RENDERER_STORAGE_NAMESPACE,
  ),
): SceneGraphRendererFlags {
  return {
    enabled: parseBooleanStorageFlag(
      storage.getItem(SCENE_GRAPH_RENDERER_FLAG_KEYS.enabled),
      DEFAULT_SCENE_GRAPH_RENDERER_FLAGS.enabled,
    ),
    backend: parseBackendStorageFlag(
      storage.getItem(SCENE_GRAPH_RENDERER_FLAG_KEYS.backend),
      DEFAULT_SCENE_GRAPH_RENDERER_FLAGS.backend,
    ),
    domIslandRadius: parseDomIslandRadiusStorageFlag(
      storage.getItem(SCENE_GRAPH_RENDERER_FLAG_KEYS.domIslandRadius),
      DEFAULT_SCENE_GRAPH_RENDERER_FLAGS.domIslandRadius,
    ),
    debugOverlay: parseBooleanStorageFlag(
      storage.getItem(SCENE_GRAPH_RENDERER_FLAG_KEYS.debugOverlay),
      DEFAULT_SCENE_GRAPH_RENDERER_FLAGS.debugOverlay,
    ),
  };
}

export function writeSceneGraphRendererFlags(
  nextFlags: Partial<SceneGraphRendererFlags>,
  storage: SceneGraphRendererStorageAdapter = getSafeLocalStorageAdapter(
    SCENE_GRAPH_RENDERER_STORAGE_NAMESPACE,
  ),
): SceneGraphRendererFlags {
  const currentFlags = readSceneGraphRendererFlags(storage);
  const mergedFlags = sanitizeSceneGraphRendererFlags({
    ...currentFlags,
    ...nextFlags,
  });

  storage.setItem(
    SCENE_GRAPH_RENDERER_FLAG_KEYS.enabled,
    mergedFlags.enabled ? "1" : "0",
  );
  storage.setItem(SCENE_GRAPH_RENDERER_FLAG_KEYS.backend, mergedFlags.backend);
  storage.setItem(
    SCENE_GRAPH_RENDERER_FLAG_KEYS.domIslandRadius,
    String(mergedFlags.domIslandRadius),
  );
  storage.setItem(
    SCENE_GRAPH_RENDERER_FLAG_KEYS.debugOverlay,
    mergedFlags.debugOverlay ? "1" : "0",
  );

  return mergedFlags;
}

function parseBooleanStorageFlag(rawValue: string | null, fallback: boolean) {
  if (rawValue === null) {
    return fallback;
  }

  const normalizedValue = rawValue.trim().toLowerCase();
  if (normalizedValue === "1" || normalizedValue === "true") {
    return true;
  }
  if (normalizedValue === "0" || normalizedValue === "false") {
    return false;
  }
  return fallback;
}

function parseBackendStorageFlag(
  rawValue: string | null,
  fallback: SceneGraphRendererBackendPreference,
): SceneGraphRendererBackendPreference {
  if (rawValue === null) {
    return fallback;
  }

  const normalizedValue = rawValue.trim().toLowerCase();
  for (const backend of ALLOWED_BACKEND_PREFERENCES) {
    if (backend === normalizedValue) {
      return backend;
    }
  }

  return fallback;
}

function parseDomIslandRadiusStorageFlag(
  rawValue: string | null,
  fallback: number,
) {
  if (rawValue === null) {
    return fallback;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsedValue)) {
    return fallback;
  }
  if (
    parsedValue < MIN_DOM_ISLAND_RADIUS ||
    parsedValue > MAX_DOM_ISLAND_RADIUS
  ) {
    return fallback;
  }
  return parsedValue;
}

function sanitizeSceneGraphRendererFlags(
  flags: SceneGraphRendererFlags,
): SceneGraphRendererFlags {
  return {
    enabled: flags.enabled === true,
    backend: parseBackendStorageFlag(
      flags.backend,
      DEFAULT_SCENE_GRAPH_RENDERER_FLAGS.backend,
    ),
    domIslandRadius: sanitizeDomIslandRadius(flags.domIslandRadius),
    debugOverlay: flags.debugOverlay === true,
  };
}

function sanitizeDomIslandRadius(radius: number): number {
  if (!Number.isInteger(radius)) {
    return DEFAULT_SCENE_GRAPH_RENDERER_FLAGS.domIslandRadius;
  }
  if (radius < MIN_DOM_ISLAND_RADIUS) {
    return MIN_DOM_ISLAND_RADIUS;
  }
  if (radius > MAX_DOM_ISLAND_RADIUS) {
    return MAX_DOM_ISLAND_RADIUS;
  }
  return radius;
}
