import { useEffect, useMemo, useState } from "react";
import {
  createInitialSceneGraphRendererCapabilities,
  probeSceneGraphRendererCapabilities,
  type SceneGraphRendererCapabilities,
} from "./capabilities";
import {
  isSceneGraphRendererFlagStorageKey,
  readSceneGraphRendererFlags,
  type SceneGraphRendererFlags,
} from "./flags";
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

export function useSceneGraphRendererRuntime(): SceneGraphRendererRuntimeState {
  const [flags, setFlags] = useState<SceneGraphRendererFlags>(() =>
    readSceneGraphRendererFlags(),
  );
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
      setFlags(readSceneGraphRendererFlags());
    };

    setFlags(readSceneGraphRendererFlags());
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

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
