import { useEffect, useMemo, useState } from "react";
import {
  createInitialSceneGraphRendererCapabilities,
  probeSceneGraphRendererCapabilities,
  type SceneGraphRendererCapabilities,
} from "./capabilities";
import {
  hasSceneGraphRendererEnabledStorageOverride,
  isSceneGraphRendererFlagStorageKey,
  readSceneGraphRendererFlags,
  type SceneGraphRendererFlags,
} from "./flags";
import {
  resolveSceneGraphRendererRolloutFlags,
  type SceneGraphRendererRolloutSurface,
} from "./rollout";
import {
  buildSceneGraphRendererPerfLabels,
  resolveSceneGraphRendererBackend,
  type SceneGraphRendererBackendSelection,
  type SceneGraphRendererPerfLabels,
} from "./runtime";

export type SceneGraphRendererRuntimeState = {
  flags: SceneGraphRendererFlags;
  capabilities: SceneGraphRendererCapabilities;
  selection: SceneGraphRendererBackendSelection;
  perfLabels: SceneGraphRendererPerfLabels;
};

export function useSceneGraphRendererRuntime(
  rolloutSurface: SceneGraphRendererRolloutSurface,
): SceneGraphRendererRuntimeState {
  const [persistedFlags, setPersistedFlags] = useState<SceneGraphRendererFlags>(
    () => readSceneGraphRendererFlags(),
  );
  const [hasEnabledStorageOverride, setHasEnabledStorageOverride] =
    useState<boolean>(() => hasSceneGraphRendererEnabledStorageOverride());
  const [capabilities, setCapabilities] =
    useState<SceneGraphRendererCapabilities>(() =>
      createInitialSceneGraphRendererCapabilities(),
    );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (!isSceneGraphRendererFlagStorageKey(event.key)) {
        return;
      }
      setPersistedFlags(readSceneGraphRendererFlags());
      setHasEnabledStorageOverride(
        hasSceneGraphRendererEnabledStorageOverride(),
      );
    };

    setPersistedFlags(readSceneGraphRendererFlags());
    setHasEnabledStorageOverride(hasSceneGraphRendererEnabledStorageOverride());
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const flags = useMemo(() => {
    return resolveSceneGraphRendererRolloutFlags({
      persistedFlags,
      surface: rolloutSurface,
      hasEnabledStorageOverride,
    });
  }, [
    hasEnabledStorageOverride,
    persistedFlags,
    rolloutSurface.activeViewModeName,
    rolloutSurface.projectConfigName,
  ]);

  useEffect(() => {
    let cancelled = false;
    probeSceneGraphRendererCapabilities().then((nextCapabilities) => {
      if (cancelled) {
        return;
      }
      setCapabilities(nextCapabilities);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const selection = useMemo(() => {
    return resolveSceneGraphRendererBackend(flags, capabilities);
  }, [flags, capabilities]);

  const perfLabels = useMemo(() => {
    return buildSceneGraphRendererPerfLabels(flags, capabilities, selection);
  }, [capabilities, flags, selection]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const windowWithSceneGraphPerf = window as Window & {
      __settaSceneGraphRendererPerf?: SceneGraphRendererPerfLabels;
    };
    windowWithSceneGraphPerf.__settaSceneGraphRendererPerf = perfLabels;
  }, [perfLabels]);

  return { flags, capabilities, selection, perfLabels };
}
