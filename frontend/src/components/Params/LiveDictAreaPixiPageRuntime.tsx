import { useReactFlow } from "forks/xyflow/core/store";
import { Application } from "pixi.js";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocalStorage } from "state/definitions";
import type { LiveDictAreaSceneBoundary } from "./groupContainerLiveDictAreaSceneBoundary";
import type { LiveDictAreaPixiLayout } from "./liveDictAreaPixiLayout";
import {
  configureLiveDictAreaPixiStaticScene,
  drawLiveDictAreaPixiScene,
} from "./LiveDictAreaPixiScene";
import {
  getLiveDictAreaPixiCompactRowPrimitive,
  getLiveDictAreaPixiPalette,
  getLiveDictAreaPixiParamColumnWidth,
  getLiveDictAreaPixiPresentationMode,
  getLiveDictAreaPixiRenderResolution,
  getLiveDictAreaPixiTextFontFamily,
  getLiveDictAreaPixiTextResolution,
  getLiveDictAreaPixiTextStyleSet,
  readLiveDictAreaPixiOverviewEnabledFromWindow,
  subscribeToLiveDictAreaPixiFontLoadInvalidation,
  type LiveDictAreaPixiCompactRowPrimitive,
} from "./liveDictAreaPixiSceneView";
import { buildParamContainerLayout } from "./paramContainerView";

export const LIVE_DICT_AREA_PIXI_SHARED_RUNTIME_CANARY_SECTION_NAME =
  "promptSectionDefault";
export const LIVE_DICT_AREA_PIXI_SHARED_RUNTIME_CANARY_SECTION_NAMES = [
  LIVE_DICT_AREA_PIXI_SHARED_RUNTIME_CANARY_SECTION_NAME,
  "browserSectionDefault",
  "textBlockSectionDefault",
  "codeParamCodeObjDefault",
  "sectionSizingPolicy",
  "buttonParamCodeObjDefault",
  "genPythonMetadataSectionDefault",
  "drawSectionDefault",
  "iFrameSectionDefault",
  "backend",
  "stateMachineGateSectionDefault",
  "codeSectionDefault",
  "chatSectionDefault",
  "genPythonCodeSectionDefault",
] as const;

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
  layout: LiveDictAreaPixiLayout | null;
  renderMode: "dom-context-lost" | "pixi";
  runtimeSceneId: string;
  sceneBoundary: LiveDictAreaSceneBoundary | null;
  sectionId: string | null;
  sectionName: string | null;
  styleSourceElement: HTMLElement | null;
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
            layout: null,
            renderMode: "dom-context-lost",
            runtimeSceneId: scene.runtimeSceneId,
            sceneBoundary: null,
            sectionId: scene.sectionId,
            sectionName: null,
            styleSourceElement: null,
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

export function isLiveDictAreaPixiSharedRuntimeCanarySectionName(
  sectionName: string | null,
) {
  if (sectionName === null) {
    return false;
  }

  return LIVE_DICT_AREA_PIXI_SHARED_RUNTIME_CANARY_SECTION_NAMES.includes(
    sectionName,
  );
}

export function LiveDictAreaPixiPageRuntimeHost() {
  const runtime = useOptionalLiveDictAreaPixiPageRuntime();
  const darkMode = useLocalStorage((state) => state.darkMode);
  const viewportZoom = useReactFlow((state) => state.transform[2]);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const edgeLabelTextStyleRef = useRef<HTMLParagraphElement | null>(null);
  const edgeRowTextStyleRef = useRef<HTMLSpanElement | null>(null);
  const compactRowPrimitiveRef = useRef<HTMLElement | null>(null);
  const rowTextStyleRef = useRef<HTMLParagraphElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const [hostSize, setHostSize] = useState({ height: 0, width: 0 });
  const [devicePixelRatio, setDevicePixelRatio] = useState(() =>
    typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
  );
  const [fontLoadVersion, setFontLoadVersion] = useState(0);
  const [compactRowPrimitive, setCompactRowPrimitive] =
    useState<LiveDictAreaPixiCompactRowPrimitive>(() =>
      getLiveDictAreaPixiCompactRowPrimitive({}),
    );

  const managedScenes = useMemo(
    () =>
      runtime
        ? getLiveDictAreaPixiSharedRuntimeManagedScenes(
            runtime.registeredScenes,
          )
        : [],
    [runtime],
  );

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) {
      setHostSize({ height: 0, width: 0 });
      return;
    }

    const updateHostSize = () => {
      setHostSize((currentSize) => {
        const nextSize = {
          height: Math.floor(host.clientHeight || host.offsetHeight || 0),
          width: Math.floor(host.clientWidth || host.offsetWidth || 0),
        };

        return currentSize.height === nextSize.height &&
          currentSize.width === nextSize.width
          ? currentSize
          : nextSize;
      });
    };

    updateHostSize();

    const observer = new ResizeObserver(() => {
      updateHostSize();
    });
    observer.observe(host);
    window.addEventListener("resize", updateHostSize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateHostSize);
    };
  }, []);

  useLayoutEffect(() => {
    if (typeof document === "undefined" || !document.fonts) {
      return;
    }

    return subscribeToLiveDictAreaPixiFontLoadInvalidation({
      fontFaceSet: document.fonts,
      onInvalidate: () => {
        setFontLoadVersion((currentVersion) => currentVersion + 1);
      },
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateDevicePixelRatio = () => {
      setDevicePixelRatio(window.devicePixelRatio || 1);
    };

    updateDevicePixelRatio();
    window.addEventListener("resize", updateDevicePixelRatio);
    window.visualViewport?.addEventListener("resize", updateDevicePixelRatio);

    return () => {
      window.removeEventListener("resize", updateDevicePixelRatio);
      window.visualViewport?.removeEventListener(
        "resize",
        updateDevicePixelRatio,
      );
    };
  }, []);

  useLayoutEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const nextPrimitive = getLiveDictAreaPixiCompactRowPrimitive({
      getComputedStyle: window.getComputedStyle,
      rowElement: compactRowPrimitiveRef.current,
    });

    setCompactRowPrimitive((currentPrimitive) =>
      currentPrimitive.cornerRadiusPx === nextPrimitive.cornerRadiusPx &&
      currentPrimitive.horizontalPaddingPx ===
        nextPrimitive.horizontalPaddingPx &&
      currentPrimitive.surfaceKind === nextPrimitive.surfaceKind
        ? currentPrimitive
        : nextPrimitive,
    );
  }, [darkMode]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || managedScenes.length === 0) {
      host?.replaceChildren();
      return;
    }
    if (hostSize.width <= 0 || hostSize.height <= 0) {
      host.replaceChildren();
      return;
    }

    const renderableScenes = managedScenes.flatMap((managedScene) => {
      const localBounds = getLiveDictAreaPixiManagedSceneLocalBounds({
        host,
        sceneBounds: managedScene.bounds,
        viewportZoom,
      });

      return localBounds === null
        ? []
        : [
            {
              localBounds,
              managedScene,
            },
          ];
    });
    if (renderableScenes.length === 0) {
      host.replaceChildren();
      return;
    }

    let cancelled = false;
    let frameId = 0;

    const renderManagedScene = async () => {
      const renderResolution = getLiveDictAreaPixiRenderResolution({
        canvasHeight: hostSize.height,
        canvasWidth: hostSize.width,
        devicePixelRatio,
        viewportZoom,
      });
      const textResolution =
        getLiveDictAreaPixiTextResolution(renderResolution);
      const textStyleSet = getLiveDictAreaPixiTextStyleSet({
        edgeLabelElement: edgeLabelTextStyleRef.current,
        edgeRowElement: edgeRowTextStyleRef.current,
        getComputedStyle: window.getComputedStyle,
        rowElement: rowTextStyleRef.current,
      });
      const presentationMode = getLiveDictAreaPixiPresentationMode(
        viewportZoom,
        {
          overviewEnabled: readLiveDictAreaPixiOverviewEnabledFromWindow(),
        },
      );
      let app = appRef.current;

      if (!app) {
        app = new Application();
        await app.init({
          antialias: true,
          autoDensity: true,
          autoStart: false,
          backgroundAlpha: 0,
          height: hostSize.height,
          preference: "webgl",
          resolution: renderResolution,
          width: hostSize.width,
        });

        if (cancelled) {
          destroyLiveDictAreaPixiPageRuntimeHostApplication(app);
          return;
        }

        app.canvas.className = "block h-full w-full";
        configureLiveDictAreaPixiStaticScene(app);
        appRef.current = app;
      } else {
        app.renderer.resize(hostSize.width, hostSize.height, renderResolution);
      }

      if (host.firstChild !== app.canvas) {
        host.replaceChildren(app.canvas);
      }

      app.canvas.style.height = "100%";
      app.canvas.style.width = "100%";

      renderableScenes.forEach(({ localBounds, managedScene }, index) => {
        const palette = getLiveDictAreaPixiPalette({
          darkMode,
          getComputedStyle: window.getComputedStyle,
          host: managedScene.styleSourceElement,
          sectionStyleColor: null,
        });
        const paramColumnWidth = getLiveDictAreaPixiParamColumnWidth({
          getComputedStyle: window.getComputedStyle,
          host: managedScene.styleSourceElement,
        });
        const textFontFamily = getLiveDictAreaPixiTextFontFamily({
          fallbackElement: document.body,
          getComputedStyle: window.getComputedStyle,
          host: managedScene.styleSourceElement,
        });

        drawLiveDictAreaPixiScene({
          app,
          clearStage: index === 0,
          compactRowPrimitive,
          darkMode,
          edgeRowInteractionState: {
            focusedPortId: null,
            hoveredPortId: null,
            pressedPortId: null,
          },
          layout: managedScene.layout,
          origin: {
            x: localBounds.left,
            y: localBounds.top,
          },
          palette,
          paramColumnWidth,
          presentationMode,
          textResolution,
          textFontFamily,
          textStyleSet,
          valueRowInteractionState: {
            focusedRowId: null,
            hoveredRowId: null,
            pressedRowId: null,
          },
        });
      });

      app.render();
    };

    frameId = requestAnimationFrame(() => {
      void renderManagedScene();
    });

    return () => {
      cancelled = true;
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [
    compactRowPrimitive,
    darkMode,
    devicePixelRatio,
    fontLoadVersion,
    hostSize.height,
    hostSize.width,
    managedScenes,
    viewportZoom,
  ]);

  useEffect(() => {
    if (managedScenes.length > 0) {
      return;
    }

    const app = appRef.current;
    if (!app) {
      return;
    }

    appRef.current = null;
    destroyLiveDictAreaPixiPageRuntimeHostApplication(app);
    hostRef.current?.replaceChildren();
  }, [managedScenes]);

  useEffect(() => {
    return () => {
      const app = appRef.current;
      if (!app) {
        return;
      }

      appRef.current = null;
      destroyLiveDictAreaPixiPageRuntimeHostApplication(app);
    };
  }, []);

  if (!runtime) {
    return null;
  }

  const pixiSceneCount = runtime.registeredScenes.filter(
    (scene) => scene.renderMode === "pixi",
  ).length;
  const domContextLostScenes = runtime.registeredScenes.filter(
    (scene) => scene.renderMode === "dom-context-lost",
  );
  const managedSceneIds = managedScenes.map(
    (managedScene) => managedScene.runtimeSceneId,
  );
  const managedSceneNames = managedScenes
    .map((managedScene) => managedScene.sectionName ?? "")
    .filter((sectionName) => sectionName.length > 0);
  const domContextLostSceneCount =
    runtime.registeredSceneCount - pixiSceneCount;
  const compactRowPrimitiveLayout = buildParamContainerLayout({
    bg: "",
    border: "",
    isTopLevelWithPad: false,
    paramHoverClassName: "",
    variant: "leaf",
  });

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[4] overflow-hidden"
      data-live-dict-area-pixi-page-runtime-host="true"
      data-live-dict-area-pixi-runtime-context-lost={
        runtime.contextLost ? "true" : "false"
      }
      data-live-dict-area-pixi-runtime-count={runtime.registeredSceneCount}
      data-live-dict-area-pixi-runtime-dom-context-lost-count={
        domContextLostSceneCount
      }
      data-live-dict-area-pixi-runtime-dom-context-lost-scene-names={domContextLostScenes
        .map((scene) => scene.sectionName ?? "")
        .filter((sectionName) => sectionName.length > 0)
        .join(",")}
      data-live-dict-area-pixi-runtime-dom-context-lost-scenes={domContextLostScenes
        .map((scene) => scene.sectionId ?? "")
        .filter((sectionId) => sectionId.length > 0)
        .join(",")}
      data-live-dict-area-pixi-runtime-lost-scene={
        runtime.contextLostScene?.sectionId ?? ""
      }
      data-live-dict-area-pixi-runtime-managed-scene-count={
        managedScenes.length
      }
      data-live-dict-area-pixi-runtime-managed-scene-id={
        managedSceneIds[0] ?? ""
      }
      data-live-dict-area-pixi-runtime-managed-scene-ids={managedSceneIds.join(
        ",",
      )}
      data-live-dict-area-pixi-runtime-managed-scene-name={
        managedSceneNames[0] ?? ""
      }
      data-live-dict-area-pixi-runtime-managed-scene-names={managedSceneNames.join(
        ",",
      )}
      data-live-dict-area-pixi-runtime-pixi-count={pixiSceneCount}
      data-live-dict-area-pixi-runtime-scenes={runtime.registeredScenes
        .map((scene) => scene.sectionId ?? "")
        .join(",")}
    >
      <div
        aria-hidden="true"
        className="absolute left-0 top-0 h-0 overflow-hidden opacity-0"
      >
        <p
          className="text-[0.5rem] font-bold uppercase"
          ref={edgeLabelTextStyleRef}
        />
        <span className="text-[0.65rem]" ref={edgeRowTextStyleRef} />
        <article
          className={compactRowPrimitiveLayout.className}
          ref={compactRowPrimitiveRef}
          style={compactRowPrimitiveLayout.style}
        >
          <p className="font-sans text-xs font-semibold">Row</p>
        </article>
        <p className="font-sans text-xs font-semibold" ref={rowTextStyleRef} />
      </div>
      <div className="absolute inset-0" ref={hostRef} />
    </div>
  );
}

function areRegisteredScenesEqual(
  a: LiveDictAreaPixiRegisteredScene,
  b: LiveDictAreaPixiRegisteredScene,
) {
  return (
    a.runtimeSceneId === b.runtimeSceneId &&
    a.sectionId === b.sectionId &&
    a.sectionName === b.sectionName &&
    a.renderMode === b.renderMode &&
    a.layout === b.layout &&
    a.sceneBoundary === b.sceneBoundary &&
    a.styleSourceElement === b.styleSourceElement &&
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

function getLiveDictAreaPixiSharedRuntimeManagedScenes(
  scenes: LiveDictAreaPixiRegisteredScene[],
) {
  return LIVE_DICT_AREA_PIXI_SHARED_RUNTIME_CANARY_SECTION_NAMES.flatMap(
    (sectionName) => {
      const managedScene = scenes.find(
        (
          scene,
        ): scene is LiveDictAreaPixiRegisteredScene & {
          bounds: LiveDictAreaPixiRegisteredSceneBounds;
          layout: LiveDictAreaPixiLayout;
          styleSourceElement: HTMLElement;
        } =>
          scene.renderMode === "pixi" &&
          scene.sectionName === sectionName &&
          scene.bounds !== null &&
          scene.layout !== null &&
          scene.styleSourceElement !== null,
      );

      return managedScene ? [managedScene] : [];
    },
  );
}

function destroyLiveDictAreaPixiPageRuntimeHostApplication(
  app: Application,
): void {
  app.destroy({ removeView: true }, true);
}

function getLiveDictAreaPixiManagedSceneLocalBounds({
  host,
  sceneBounds,
  viewportZoom,
}: {
  host: HTMLDivElement;
  sceneBounds: LiveDictAreaPixiRegisteredSceneBounds;
  viewportZoom: number;
}) {
  if (!Number.isFinite(viewportZoom) || viewportZoom <= 0) {
    return null;
  }

  const hostBounds = host.getBoundingClientRect();
  const left = (sceneBounds.left - hostBounds.left) / viewportZoom;
  const top = (sceneBounds.top - hostBounds.top) / viewportZoom;
  const width = sceneBounds.width / viewportZoom;
  const height = sceneBounds.height / viewportZoom;

  if (
    !Number.isFinite(left) ||
    !Number.isFinite(top) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }

  return {
    height,
    left,
    top,
    width,
  };
}
