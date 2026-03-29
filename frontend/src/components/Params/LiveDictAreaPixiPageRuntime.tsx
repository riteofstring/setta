import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type LiveDictAreaPixiRegisteredScene = {
  runtimeSceneId: string;
  sectionId: string | null;
};

type LiveDictAreaPixiPageRuntimeContextValue = {
  contextLost: boolean;
  contextLostScene: LiveDictAreaPixiRegisteredScene | null;
  registerScene: (scene: LiveDictAreaPixiRegisteredScene) => () => void;
  registeredSceneCount: number;
  registeredScenes: LiveDictAreaPixiRegisteredScene[];
  reportContextLost: (scene: LiveDictAreaPixiRegisteredScene) => void;
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
        if (currentScene && currentScene.sectionId === scene.sectionId) {
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
    (scene: LiveDictAreaPixiRegisteredScene) => {
      setContextLostScene((currentScene) => currentScene ?? scene);
    },
    [],
  );

  const registeredScenes = useMemo(
    () => Object.values(registeredScenesById),
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
