import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type LiveDictAreaPixiRegisteredSceneBounds = {
  height: number;
  left: number;
  top: number;
  width: number;
};

export type LiveDictAreaPixiRegisteredSceneSummary = {
  blockCount: number;
  readableRowCount: number;
  totalRowCount: number;
  valuePreviewCount: number;
};

export type LiveDictAreaPixiRegisteredScene = {
  bounds: LiveDictAreaPixiRegisteredSceneBounds | null;
  renderMode: "dom-context-lost" | "pixi";
  runtimeSceneId: string;
  sectionId: string | null;
  summary: LiveDictAreaPixiRegisteredSceneSummary | null;
};

type LiveDictAreaPixiPageRuntimeContextValue = {
  contextLost: boolean;
  contextLostScene: LiveDictAreaPixiRegisteredScene | null;
  registerScene: (scene: LiveDictAreaPixiRegisteredScene) => () => void;
  registeredSceneCount: number;
  registeredScenes: LiveDictAreaPixiRegisteredScene[];
  reportContextLost: (
    scene: Pick<
      LiveDictAreaPixiRegisteredScene,
      "runtimeSceneId" | "sectionId"
    >,
  ) => void;
};

const LiveDictAreaPixiPageRuntimeContext =
  createContext<LiveDictAreaPixiPageRuntimeContextValue | null>(null);

export function LiveDictAreaPixiPageRuntimeBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  const [contextLostScene, setContextLostScene] =
    useState<LiveDictAreaPixiRegisteredScene | null>(null);
  const [registeredScenesById, setRegisteredScenesById] = useState<
    Record<string, LiveDictAreaPixiRegisteredScene>
  >({});

  const registerScene = useCallback(
    (scene: LiveDictAreaPixiRegisteredScene) => {
      setRegisteredScenesById((currentScenesById) => {
        const currentScene = currentScenesById[scene.runtimeSceneId];
        if (currentScene && areRegisteredScenesEqual(currentScene, scene)) {
          return currentScenesById;
        }

        return {
          ...currentScenesById,
          [scene.runtimeSceneId]: scene,
        };
      });

      return () => {
        setRegisteredScenesById((currentScenesById) => {
          if (!(scene.runtimeSceneId in currentScenesById)) {
            return currentScenesById;
          }

          const nextScenesById = { ...currentScenesById };
          delete nextScenesById[scene.runtimeSceneId];
          return nextScenesById;
        });
      };
    },
    [],
  );

  const reportContextLost = useCallback(
    (
      scene: Pick<
        LiveDictAreaPixiRegisteredScene,
        "runtimeSceneId" | "sectionId"
      >,
    ) => {
      setContextLostScene((currentScene) => {
        if (currentScene) {
          return currentScene;
        }

        return (
          registeredScenesById[scene.runtimeSceneId] ?? {
            bounds: null,
            renderMode: "dom-context-lost",
            runtimeSceneId: scene.runtimeSceneId,
            sectionId: scene.sectionId,
            summary: null,
          }
        );
      });
    },
    [registeredScenesById],
  );

  const registeredScenes = useMemo(
    () =>
      Object.values(registeredScenesById).sort((leftScene, rightScene) =>
        getRegisteredSceneSortKey(leftScene).localeCompare(
          getRegisteredSceneSortKey(rightScene),
        ),
      ),
    [registeredScenesById],
  );

  const value = useMemo<LiveDictAreaPixiPageRuntimeContextValue>(
    () => ({
      contextLost: contextLostScene !== null,
      contextLostScene,
      registerScene,
      registeredSceneCount: registeredScenes.length,
      registeredScenes,
      reportContextLost,
    }),
    [contextLostScene, registerScene, registeredScenes, reportContextLost],
  );

  return (
    <LiveDictAreaPixiPageRuntimeContext.Provider value={value}>
      {children}
    </LiveDictAreaPixiPageRuntimeContext.Provider>
  );
}

export function useOptionalLiveDictAreaPixiPageRuntime() {
  return useContext(LiveDictAreaPixiPageRuntimeContext);
}

export function LiveDictAreaPixiPageRuntimeHost() {
  const runtime = useOptionalLiveDictAreaPixiPageRuntime();
  if (!runtime) {
    return null;
  }

  const pixiSceneCount = runtime.registeredScenes.filter(
    (scene) => scene.renderMode === "pixi",
  ).length;
  const domContextLostSceneCount =
    runtime.registeredSceneCount - pixiSceneCount;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      data-live-dict-area-pixi-page-runtime-host="true"
      data-live-dict-area-pixi-runtime-context-lost={
        runtime.contextLost ? "true" : "false"
      }
      data-live-dict-area-pixi-runtime-count={runtime.registeredSceneCount}
      data-live-dict-area-pixi-runtime-dom-context-lost-count={
        domContextLostSceneCount
      }
      data-live-dict-area-pixi-runtime-lost-scene={
        runtime.contextLostScene?.sectionId ?? ""
      }
      data-live-dict-area-pixi-runtime-pixi-count={pixiSceneCount}
      data-live-dict-area-pixi-runtime-scenes={runtime.registeredScenes
        .map((scene) => scene.sectionId ?? "")
        .join(",")}
    />
  );
}

function areRegisteredScenesEqual(
  a: LiveDictAreaPixiRegisteredScene,
  b: LiveDictAreaPixiRegisteredScene,
) {
  return (
    a.runtimeSceneId === b.runtimeSceneId &&
    a.sectionId === b.sectionId &&
    a.renderMode === b.renderMode &&
    areRegisteredSceneBoundsEqual(a.bounds, b.bounds) &&
    areRegisteredSceneSummariesEqual(a.summary, b.summary)
  );
}

function areRegisteredSceneBoundsEqual(
  a: LiveDictAreaPixiRegisteredSceneBounds | null,
  b: LiveDictAreaPixiRegisteredSceneBounds | null,
) {
  if (a === b) {
    return true;
  }

  if (!a || !b) {
    return false;
  }

  return (
    a.height === b.height &&
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width
  );
}

function areRegisteredSceneSummariesEqual(
  a: LiveDictAreaPixiRegisteredSceneSummary | null,
  b: LiveDictAreaPixiRegisteredSceneSummary | null,
) {
  if (a === b) {
    return true;
  }

  if (!a || !b) {
    return false;
  }

  return (
    a.blockCount === b.blockCount &&
    a.readableRowCount === b.readableRowCount &&
    a.totalRowCount === b.totalRowCount &&
    a.valuePreviewCount === b.valuePreviewCount
  );
}

function getRegisteredSceneSortKey(scene: LiveDictAreaPixiRegisteredScene) {
  return scene.sectionId ?? scene.runtimeSceneId;
}
