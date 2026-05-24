import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import {
  useLocalStorage,
  useProjectState,
  useTypeErrors,
} from "state/definitions";
import {
  CODEMIRROR_TOOLTIP_PARENT_ID,
  SETTA_POPOVER_PORTAL_PARENT_ID,
} from "utils/constants";
import { renderWorkspaceCanvas } from "./workspaceCanvasRenderer";
import {
  createWorkspaceCanvasControllerState,
  syncWorkspaceControllerViewport,
  type WorkspaceCanvasControllerState,
} from "./workspaceController";
import { deriveWorkspaceScene, type WorkspaceSize } from "./workspaceScene";

type WorkspaceCanvasEnvironment = {
  devicePixelRatio: number;
  isDarkMode: boolean;
  themeRevision: number;
  fontRevision: number;
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
          themeRevision: String(environment.themeRevision),
          fontRevision: String(environment.fontRevision),
          devicePixelRatioRevision: String(environment.devicePixelRatio),
          textMeasurementRevision: [
            environment.fontRevision,
            environment.devicePixelRatio,
          ].join(":"),
          highlighterRevision: "0",
        },
      }),
    [
      controllerState,
      environment.devicePixelRatio,
      environment.fontRevision,
      environment.themeRevision,
      projectRevision,
      projectState,
      sectionScrollRevision,
      typeErrors,
      viewportSize,
    ],
  );

  useWorkspaceCanvasDraw({
    canvasRef,
    scene,
    viewportSize,
    environment,
    showMinimap,
  });
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
    if (typeof window === "undefined" || typeof document === "undefined") {
      return undefined;
    }

    let disposePixelRatioWatcher = watchDevicePixelRatio((devicePixelRatio) => {
      setEnvironment((current) =>
        current.devicePixelRatio === devicePixelRatio
          ? current
          : { ...current, devicePixelRatio },
      );
    });
    const updateDevicePixelRatio = () => {
      disposePixelRatioWatcher();
      disposePixelRatioWatcher = watchDevicePixelRatio((devicePixelRatio) => {
        setEnvironment((current) =>
          current.devicePixelRatio === devicePixelRatio
            ? current
            : { ...current, devicePixelRatio },
        );
      });
    };

    const updateTheme = () => {
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
    };

    const updateFontRevision = () => {
      setEnvironment((current) => ({
        ...current,
        fontRevision: current.fontRevision + 1,
      }));
    };

    window.addEventListener("resize", updateDevicePixelRatio);
    const themeObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(updateTheme);
    themeObserver?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    const fonts = document.fonts;
    fonts?.addEventListener?.("loadingdone", updateFontRevision);
    fonts?.addEventListener?.("loadingerror", updateFontRevision);
    void fonts?.ready?.then(updateFontRevision);

    return () => {
      disposePixelRatioWatcher();
      window.removeEventListener("resize", updateDevicePixelRatio);
      themeObserver?.disconnect();
      fonts?.removeEventListener?.("loadingdone", updateFontRevision);
      fonts?.removeEventListener?.("loadingerror", updateFontRevision);
    };
  }, []);

  return environment;
}

function useWorkspaceCanvasDraw({
  canvasRef,
  scene,
  viewportSize,
  environment,
  showMinimap,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  scene: ReturnType<typeof deriveWorkspaceScene>;
  viewportSize: WorkspaceSize;
  environment: WorkspaceCanvasEnvironment;
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
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [canvasRef, environment, scene, showMinimap, viewportSize]);

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
