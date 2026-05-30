import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  useLocalStorage,
  useProjectState,
  useSettings,
  useTypeErrors,
} from "state/definitions";
import {
  CODEMIRROR_TOOLTIP_PARENT_ID,
  SETTA_POPOVER_PORTAL_PARENT_ID,
} from "utils/constants";
import type { BackgroundVariantEnum } from "utils/generatedTypes";
import { renderWorkspaceCanvas } from "./workspaceCanvasRenderer";
import {
  createWorkspaceCanvasControllerState,
  syncWorkspaceControllerViewport,
  type WorkspaceCanvasControllerState,
} from "./workspaceController";
import {
  beginWorkspaceCodeHighlightRequest,
  completeWorkspaceCodeHighlightRequest,
  createWorkspaceCodeHighlightCacheState,
  getWorkspaceCodeHighlightCacheEntry,
  type WorkspaceCodeHighlightCacheState,
} from "./workspaceHighlightCache";
import {
  clearWorkspaceCanvasParitySnapshot,
  publishWorkspaceCanvasParitySnapshot,
} from "./workspaceParitySnapshot";
import {
  highlightWorkspaceCodePreview,
  WORKSPACE_PASSIVE_CODE_HIGHLIGHTER_REVISION,
  type WorkspacePassiveCodeHighlightRequest,
} from "./workspacePassiveCodeHighlighter";
import { deriveWorkspaceScene, type WorkspaceSize } from "./workspaceScene";
import type { WorkspaceDictRowScene } from "./workspaceSceneTypes";
import {
  beginWorkspaceTextMeasurementRequest,
  completeWorkspaceTextMeasurementRequest,
  createWorkspaceTextMeasurementCacheState,
  getWorkspaceTextMeasurementCacheEntry,
  measureWorkspaceTextPreview,
  type WorkspaceTextMeasurementCacheState,
  type WorkspaceTextMeasurementRequest,
  type WorkspaceTextPreview,
} from "./workspaceTextMeasurementCache";

type WorkspaceCanvasEnvironment = {
  devicePixelRatio: number;
  isDarkMode: boolean;
  themeRevision: number;
  fontRevision: number;
};

type WorkspaceCanvasGridSettings = {
  show: boolean;
  color: string;
  variant: (typeof BackgroundVariantEnum)[keyof typeof BackgroundVariantEnum];
  patternSize: number;
  gap: readonly [number, number];
};

type WorkspaceDictRowWithCodePreview = WorkspaceDictRowScene & {
  codePreview: NonNullable<WorkspaceDictRowScene["codePreview"]>;
};

export function WorkspaceCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const viewportSize = useWorkspaceCanvasSize(containerRef);
  const environment = useWorkspaceCanvasEnvironment();
  const projectState = useProjectState();
  const typeErrors = useTypeErrors((state) => state.errors);
  const showMinimap = useLocalStorage((state) => state.showMinimap);
  const minimapSide = useLocalStorage((state) => state.minimapSide);
  const minimapOverviewOffset = useLocalStorage(
    (state) => state.overviewTrueWidth,
  );
  const minimapUiEditorOffset = useLocalStorage(
    (state) => state.uiEditorTrueWidth,
  );
  const gridSettings = useWorkspaceCanvasGridSettings(environment.isDarkMode);
  const [highlightCache, setHighlightCache] =
    useState<WorkspaceCodeHighlightCacheState>(() =>
      createWorkspaceCodeHighlightCacheState(),
    );
  const [textMeasurementCache, setTextMeasurementCache] =
    useState<WorkspaceTextMeasurementCacheState>(() =>
      createWorkspaceTextMeasurementCacheState(),
    );
  const [controllerState, setControllerState] =
    useState<WorkspaceCanvasControllerState>(() =>
      syncWorkspaceControllerViewport(
        createWorkspaceCanvasControllerState(),
        projectState,
        viewportSize,
      ),
    );
  useEffect(() => {
    setControllerState((current) =>
      syncWorkspaceControllerViewport(current, projectState, viewportSize),
    );
  }, [projectState, viewportSize]);
  const projectRevision = useMonotonicRevisionToken(projectState);
  const sectionScrollRevision = useMemo(
    () => serializeSectionScrollRevision(controllerState.sectionScrollOffsets),
    [controllerState.sectionScrollOffsets],
  );
  const scene = useMemo(
    () =>
      deriveWorkspaceScene({
        projectState,
        viewportSize,
        minimapSide,
        minimapOverviewOffset,
        minimapUiEditorOffset,
        controllerState,
        typeErrors,
        revisionKeys: {
          projectRevision,
          viewportRevision: [
            serializeWorkspaceViewportRevision(controllerState),
            viewportSize.width,
            viewportSize.height,
          ].join(":"),
          sectionScrollRevision,
          themeRevision: [
            environment.isDarkMode ? "dark" : "light",
            environment.themeRevision,
          ].join(":"),
          fontRevision: String(environment.fontRevision),
          devicePixelRatioRevision: String(environment.devicePixelRatio),
          textMeasurementRevision: [
            environment.fontRevision,
            environment.devicePixelRatio,
          ].join(":"),
          highlighterRevision: WORKSPACE_PASSIVE_CODE_HIGHLIGHTER_REVISION,
        },
        highlightCache,
        textMeasurementCache,
      }),
    [
      controllerState,
      environment.devicePixelRatio,
      environment.fontRevision,
      environment.isDarkMode,
      environment.themeRevision,
      highlightCache,
      minimapOverviewOffset,
      minimapSide,
      minimapUiEditorOffset,
      projectRevision,
      projectState,
      sectionScrollRevision,
      textMeasurementCache,
      typeErrors,
      viewportSize,
    ],
  );

  useWorkspacePassiveCodeHighlighting({
    scene,
    highlightCache,
    setHighlightCache,
    isDarkMode: environment.isDarkMode,
  });
  useWorkspaceTextMeasurement({
    scene,
    textMeasurementCache,
    setTextMeasurementCache,
  });
  useWorkspaceCanvasDraw({
    canvasRef,
    scene,
    viewportSize,
    environment,
    gridSettings,
    showMinimap,
  });
  useWorkspaceCanvasParitySnapshot({ canvasRef, scene, showMinimap });
  useWorkspacePointerCleanup(canvasRef, activePointerIdRef);

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-0 w-full min-w-0 overflow-hidden"
      data-workspace-canvas-root="true"
    >
      <canvas
        ref={canvasRef}
        aria-label="Workspace"
        className="block h-full w-full outline-none"
        data-workspace-canvas-surface="true"
        onPointerDown={(event) => {
          activePointerIdRef.current = event.pointerId;
          event.currentTarget.focus({ preventScroll: true });
        }}
        onPointerUp={(event) => {
          if (activePointerIdRef.current === event.pointerId) {
            activePointerIdRef.current = null;
          }
        }}
        onPointerCancel={(event) => {
          if (activePointerIdRef.current === event.pointerId) {
            activePointerIdRef.current = null;
          }
        }}
        role="application"
        tabIndex={0}
      />
      <WorkspaceCanvasOverlayHost />
    </div>
  );
}

function useWorkspaceCanvasParitySnapshot({
  canvasRef,
  scene,
  showMinimap,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  scene: ReturnType<typeof deriveWorkspaceScene>;
  showMinimap: boolean;
}) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      clearWorkspaceCanvasParitySnapshot();
      return clearWorkspaceCanvasParitySnapshot;
    }
    publishWorkspaceCanvasParitySnapshot(scene, canvas, showMinimap);
    return clearWorkspaceCanvasParitySnapshot;
  }, [canvasRef, scene, showMinimap]);
}

function useWorkspacePassiveCodeHighlighting({
  scene,
  highlightCache,
  setHighlightCache,
  isDarkMode,
}: {
  scene: ReturnType<typeof deriveWorkspaceScene>;
  highlightCache: WorkspaceCodeHighlightCacheState;
  setHighlightCache: Dispatch<SetStateAction<WorkspaceCodeHighlightCacheState>>;
  isDarkMode: boolean;
}) {
  const mountedRef = useRef(true);
  const requestCounterRef = useRef(0);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  useEffect(() => {
    const requests = collectWorkspacePassiveCodeHighlightRequests({
      scene,
      highlightCache,
      isDarkMode,
    });
    if (requests.length === 0) {
      return;
    }

    const requestsWithIds = requests.map((request) => {
      requestCounterRef.current += 1;
      return {
        request,
        requestId: `${request.cacheKey}:${requestCounterRef.current}`,
      };
    });

    setHighlightCache((current) => {
      let next = current;
      for (const { request, requestId } of requestsWithIds) {
        if (getWorkspaceCodeHighlightCacheEntry(next, request.cacheKey)) {
          continue;
        }
        next = beginWorkspaceCodeHighlightRequest(
          next,
          request.cacheKey,
          requestId,
        );
      }
      return next;
    });

    for (const { request, requestId } of requestsWithIds) {
      void Promise.resolve()
        .then(() => highlightWorkspaceCodePreview(request))
        .then((tokenRuns) => {
          if (!mountedRef.current) {
            return;
          }
          setHighlightCache((current) => {
            const result = completeWorkspaceCodeHighlightRequest(
              current,
              request.cacheKey,
              requestId,
              tokenRuns,
            );
            return result.cache;
          });
        });
    }
  }, [highlightCache, isDarkMode, scene, setHighlightCache]);
}

function collectWorkspacePassiveCodeHighlightRequests({
  scene,
  highlightCache,
  isDarkMode,
}: {
  scene: ReturnType<typeof deriveWorkspaceScene>;
  highlightCache: WorkspaceCodeHighlightCacheState;
  isDarkMode: boolean;
}): Array<WorkspacePassiveCodeHighlightRequest> {
  const requests: Array<WorkspacePassiveCodeHighlightRequest> = [];
  for (const sectionId of scene.sectionOrder) {
    const section = scene.sectionsById[sectionId];
    if (!section || section.renderModel.kind !== "dict") {
      continue;
    }
    for (const row of section.renderModel.dict.rows) {
      if (!shouldRequestWorkspacePassiveCodeHighlight(row, highlightCache)) {
        continue;
      }
      const codePreview = row.codePreview;
      requests.push({
        cacheKey: codePreview.cacheKey,
        code: row.passiveValue.text,
        language: codePreview.language,
        themeId: isDarkMode ? "dark" : "light",
        maxLines: 6,
        maxColumns: 160,
      });
    }
  }
  return requests;
}

function shouldRequestWorkspacePassiveCodeHighlight(
  row: WorkspaceDictRowScene,
  highlightCache: WorkspaceCodeHighlightCacheState,
): row is WorkspaceDictRowWithCodePreview {
  const codePreview = row.codePreview;
  if (!row.visible || !codePreview || codePreview.tokenRuns) {
    return false;
  }
  return !getWorkspaceCodeHighlightCacheEntry(
    highlightCache,
    codePreview.cacheKey,
  );
}

function useWorkspaceTextMeasurement({
  scene,
  textMeasurementCache,
  setTextMeasurementCache,
}: {
  scene: ReturnType<typeof deriveWorkspaceScene>;
  textMeasurementCache: WorkspaceTextMeasurementCacheState;
  setTextMeasurementCache: Dispatch<
    SetStateAction<WorkspaceTextMeasurementCacheState>
  >;
}) {
  const mountedRef = useRef(true);
  const requestCounterRef = useRef(0);
  const measurementContextRef = useRef<CanvasRenderingContext2D | null>(null);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  useEffect(() => {
    const context = getWorkspaceTextMeasurementContext(measurementContextRef);
    if (!context) {
      return;
    }
    const requests = collectWorkspaceTextMeasurementRequests({
      scene,
      textMeasurementCache,
    });
    if (requests.length === 0) {
      return;
    }

    const requestsWithIds = requests.map((request) => {
      requestCounterRef.current += 1;
      return {
        request,
        requestId: `${request.cacheKey}:${requestCounterRef.current}`,
      };
    });

    setTextMeasurementCache((current) => {
      let next = current;
      for (const { request, requestId } of requestsWithIds) {
        if (getWorkspaceTextMeasurementCacheEntry(next, request.cacheKey)) {
          continue;
        }
        next = beginWorkspaceTextMeasurementRequest(
          next,
          request.cacheKey,
          requestId,
        );
      }
      return next;
    });

    for (const { request, requestId } of requestsWithIds) {
      void Promise.resolve()
        .then(() => measureWorkspaceTextPreview(context, request))
        .then((result) => {
          if (!mountedRef.current) {
            return;
          }
          setTextMeasurementCache((current) => {
            const completion = completeWorkspaceTextMeasurementRequest(
              current,
              request.cacheKey,
              requestId,
              result,
            );
            return completion.cache;
          });
        });
    }
  }, [scene, setTextMeasurementCache, textMeasurementCache]);
}

function collectWorkspaceTextMeasurementRequests({
  scene,
  textMeasurementCache,
}: {
  scene: ReturnType<typeof deriveWorkspaceScene>;
  textMeasurementCache: WorkspaceTextMeasurementCacheState;
}): Array<WorkspaceTextMeasurementRequest> {
  const requests: Array<WorkspaceTextMeasurementRequest> = [];
  const addPreview = (preview: WorkspaceTextPreview | null) => {
    if (
      !preview ||
      preview.ready ||
      preview.text.length === 0 ||
      getWorkspaceTextMeasurementCacheEntry(
        textMeasurementCache,
        preview.cacheKey,
      )
    ) {
      return;
    }
    requests.push({
      cacheKey: preview.cacheKey,
      text: preview.text,
      font: preview.font,
      maxWidth: preview.maxWidth,
    });
  };

  for (const sectionId of scene.sectionOrder) {
    const section = scene.sectionsById[sectionId];
    if (!section) {
      continue;
    }
    addPreview(section.titleTextPreview);
    if (section.renderModel.kind !== "dict") {
      continue;
    }
    for (const row of section.renderModel.dict.rows) {
      if (!row.visible) {
        continue;
      }
      addPreview(row.textPreviews.label);
      addPreview(row.textPreviews.value);
      addPreview(row.textPreviews.control);
    }
  }
  return requests;
}

function getWorkspaceTextMeasurementContext(
  contextRef: MutableRefObject<CanvasRenderingContext2D | null>,
) {
  if (contextRef.current) {
    return contextRef.current;
  }
  if (typeof document === "undefined") {
    return null;
  }
  const canvas = document.createElement("canvas");
  contextRef.current = canvas.getContext("2d");
  return contextRef.current;
}

function WorkspaceCanvasOverlayHost() {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      data-workspace-canvas-overlay-host="true"
    >
      <div
        className="setta-codemirror-tooltips pointer-events-auto absolute left-0 top-0 z-[300] h-px w-px overflow-visible"
        id={CODEMIRROR_TOOLTIP_PARENT_ID}
      />
      <div
        className="setta-popover-portals pointer-events-auto absolute left-0 top-0 z-[320] h-px w-px overflow-visible"
        id={SETTA_POPOVER_PORTAL_PARENT_ID}
      />
    </div>
  );
}

function useWorkspaceCanvasSize(
  containerRef: RefObject<HTMLElement | null>,
): WorkspaceSize {
  const [size, setSize] = useState<WorkspaceSize>({ width: 1, height: 1 });

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof window === "undefined") {
      return undefined;
    }

    const updateSize = () => {
      const next = readElementSize(element);
      setSize((current) => (areSizesEqual(current, next) ? current : next));
    };

    updateSize();
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateSize);
    resizeObserver?.observe(element);
    window.addEventListener("resize", updateSize);
    window.visualViewport?.addEventListener("resize", updateSize);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateSize);
      window.visualViewport?.removeEventListener("resize", updateSize);
    };
  }, [containerRef]);

  return size;
}

function useWorkspaceCanvasEnvironment(): WorkspaceCanvasEnvironment {
  const [environment, setEnvironment] = useState<WorkspaceCanvasEnvironment>(
    () => ({
      devicePixelRatio: readDevicePixelRatio(),
      isDarkMode: readIsDarkMode(),
      themeRevision: 0,
      fontRevision: 0,
    }),
  );

  useEffect(() => {
    return watchWorkspaceCanvasEnvironment(setEnvironment);
  }, []);

  return environment;
}

function useWorkspaceCanvasGridSettings(
  isDarkMode: boolean,
): WorkspaceCanvasGridSettings {
  const snapToGrid = useLocalStorage((state) => state.snapToGrid);
  const gui = useSettings((state) => state.gui);
  return useMemo(
    () => ({
      show: snapToGrid && !!gui.showGridLines,
      color: isDarkMode ? gui.gridColorDarkMode : gui.gridColor,
      variant: gui.gridPattern,
      patternSize: gui.gridPatternSize,
      gap: gui.snapGrid,
    }),
    [
      gui.gridColor,
      gui.gridColorDarkMode,
      gui.gridPattern,
      gui.gridPatternSize,
      gui.showGridLines,
      gui.snapGrid,
      isDarkMode,
      snapToGrid,
    ],
  );
}

function watchWorkspaceCanvasEnvironment(
  setEnvironment: Dispatch<SetStateAction<WorkspaceCanvasEnvironment>>,
) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return undefined;
  }

  const pixelRatioWatcher = createPixelRatioWatcher(setEnvironment);
  const themeObserver = observeWorkspaceCanvasTheme(setEnvironment);
  const disposeFontObserver = observeWorkspaceCanvasFonts(setEnvironment);

  return () => {
    pixelRatioWatcher.dispose();
    themeObserver?.disconnect();
    disposeFontObserver();
  };
}

function createPixelRatioWatcher(
  setEnvironment: Dispatch<SetStateAction<WorkspaceCanvasEnvironment>>,
) {
  let dispose = watchDevicePixelRatio((devicePixelRatio) => {
    updateWorkspaceCanvasDevicePixelRatio(setEnvironment, devicePixelRatio);
  });
  const handleResize = () => {
    dispose();
    dispose = watchDevicePixelRatio((devicePixelRatio) => {
      updateWorkspaceCanvasDevicePixelRatio(setEnvironment, devicePixelRatio);
    });
  };
  window.addEventListener("resize", handleResize);
  return {
    dispose: () => {
      dispose();
      window.removeEventListener("resize", handleResize);
    },
  };
}

function updateWorkspaceCanvasDevicePixelRatio(
  setEnvironment: Dispatch<SetStateAction<WorkspaceCanvasEnvironment>>,
  devicePixelRatio: number,
) {
  setEnvironment((current) =>
    current.devicePixelRatio === devicePixelRatio
      ? current
      : { ...current, devicePixelRatio },
  );
}

function observeWorkspaceCanvasTheme(
  setEnvironment: Dispatch<SetStateAction<WorkspaceCanvasEnvironment>>,
) {
  if (typeof MutationObserver === "undefined") {
    return null;
  }
  const observer = new MutationObserver(() => {
    const isDarkMode = readIsDarkMode();
    setEnvironment((current) =>
      current.isDarkMode === isDarkMode
        ? current
        : {
            ...current,
            isDarkMode,
            themeRevision: current.themeRevision + 1,
          },
    );
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style"],
  });
  return observer;
}

function observeWorkspaceCanvasFonts(
  setEnvironment: Dispatch<SetStateAction<WorkspaceCanvasEnvironment>>,
) {
  const updateFontRevision = () => {
    setEnvironment((current) => ({
      ...current,
      fontRevision: current.fontRevision + 1,
    }));
  };
  const fonts = document.fonts;
  fonts?.addEventListener?.("loadingdone", updateFontRevision);
  fonts?.addEventListener?.("loadingerror", updateFontRevision);
  void fonts?.ready?.then(updateFontRevision);
  return () => {
    fonts?.removeEventListener?.("loadingdone", updateFontRevision);
    fonts?.removeEventListener?.("loadingerror", updateFontRevision);
  };
}

function useWorkspaceCanvasDraw({
  canvasRef,
  scene,
  viewportSize,
  environment,
  gridSettings,
  showMinimap,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  scene: ReturnType<typeof deriveWorkspaceScene>;
  viewportSize: WorkspaceSize;
  environment: WorkspaceCanvasEnvironment;
  gridSettings: WorkspaceCanvasGridSettings;
  showMinimap: boolean;
}) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof window === "undefined") {
      return undefined;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return undefined;
    }

    resizeCanvasBackingStore(
      canvas,
      viewportSize,
      environment.devicePixelRatio,
    );
    const frameId = window.requestAnimationFrame(() => {
      renderWorkspaceCanvas(context, scene, {
        width: viewportSize.width,
        height: viewportSize.height,
        devicePixelRatio: environment.devicePixelRatio,
        isDarkMode: environment.isDarkMode,
        showMinimap,
        grid: gridSettings,
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [canvasRef, environment, gridSettings, scene, showMinimap, viewportSize]);

  useEffect(
    () => () => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) {
        return;
      }
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
    },
    [canvasRef],
  );
}

function useWorkspacePointerCleanup(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  activePointerIdRef: MutableRefObject<number | null>,
) {
  useEffect(
    () => () => {
      const canvas = canvasRef.current;
      const pointerId = activePointerIdRef.current;
      if (
        canvas &&
        pointerId !== null &&
        canvas.hasPointerCapture?.(pointerId)
      ) {
        canvas.releasePointerCapture(pointerId);
      }
      activePointerIdRef.current = null;
    },
    [activePointerIdRef, canvasRef],
  );
}

function useMonotonicRevisionToken(value: unknown) {
  const revisionRef = useRef({ value, revision: 0 });
  if (revisionRef.current.value !== value) {
    revisionRef.current = {
      value,
      revision: revisionRef.current.revision + 1,
    };
  }
  return String(revisionRef.current.revision);
}

function resizeCanvasBackingStore(
  canvas: HTMLCanvasElement,
  size: WorkspaceSize,
  devicePixelRatio: number,
) {
  const width = Math.max(1, Math.round(size.width * devicePixelRatio));
  const height = Math.max(1, Math.round(size.height * devicePixelRatio));
  if (canvas.width !== width) {
    canvas.width = width;
  }
  if (canvas.height !== height) {
    canvas.height = height;
  }
}

function readElementSize(element: HTMLElement): WorkspaceSize {
  const rect = element.getBoundingClientRect();
  return {
    width: Math.max(1, rect.width || element.clientWidth || 1),
    height: Math.max(1, rect.height || element.clientHeight || 1),
  };
}

function areSizesEqual(left: WorkspaceSize, right: WorkspaceSize) {
  return left.width === right.width && left.height === right.height;
}

function readDevicePixelRatio() {
  return typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
}

function readIsDarkMode() {
  return (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
  );
}

function watchDevicePixelRatio(onChange: (devicePixelRatio: number) => void) {
  const devicePixelRatio = readDevicePixelRatio();
  onChange(devicePixelRatio);
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return () => {};
  }
  const mediaQuery = window.matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
  const handleChange = () => {
    onChange(readDevicePixelRatio());
  };
  mediaQuery.addEventListener?.("change", handleChange);
  return () => {
    mediaQuery.removeEventListener?.("change", handleChange);
  };
}

function serializeSectionScrollRevision(offsets: Record<string, number>) {
  return Object.entries(offsets)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sectionId, offset]) => `${sectionId}:${offset}`)
    .join("|");
}

function serializeWorkspaceViewportRevision(
  controllerState: WorkspaceCanvasControllerState,
) {
  const viewportState = controllerState.viewport;
  if (!viewportState) {
    return "viewport:unsynced";
  }
  const { viewport } = viewportState;
  return [viewportState.sourceKey, viewport.x, viewport.y, viewport.zoom].join(
    ":",
  );
}
