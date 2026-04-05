import _ from "lodash";
import { Application, Graphics } from "pixi.js";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";
import { useActiveSectionUI } from "state/activeSectionUI";
import { useLocalStorage, useTemporaryMiscState } from "state/definitions";
import { getSectionStylePreviewColorKey } from "utils/constants";
import { updateSettingsGraphSubstrateCanaryInstrumentationSnapshot } from "./settingsGraphSubstrateCanaryInstrumentation";
import type { SettingsGraphSubstrateCanarySceneSection } from "./settingsGraphSubstrateCanarySceneSnapshot";
import { useSettingsGraphSubstrateCanarySceneStore } from "./settingsGraphSubstrateCanarySceneStore";
import { shouldPresentSettingsGraphSubstrateCanarySectionShell } from "./settingsGraphSubstrateCanarySectionPresentation";
import {
  areSettingsGraphSubstrateCanarySectionShellPixiDrawablesEqual,
  resolveSettingsGraphSubstrateCanarySectionShellPixiDrawables,
  type SettingsGraphSubstrateCanarySectionShellPixiDrawable,
} from "./settingsGraphSubstrateCanarySectionShellPixiModel";
import type { GraphRect, GraphViewport } from "./viewportTransform";

type SettingsGraphSubstrateCanarySectionShellPixiLayerProps = {
  draggingSectionId: string | null;
  hoveredSectionId: string | null;
  sceneSections: Array<SettingsGraphSubstrateCanarySceneSection>;
  visibleViewportRect: GraphRect | null;
  viewport: GraphViewport | null;
};

export function SettingsGraphSubstrateCanarySectionShellPixiLayer({
  draggingSectionId,
  hoveredSectionId,
  sceneSections,
  visibleViewportRect,
  viewport,
}: SettingsGraphSubstrateCanarySectionShellPixiLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<Application | null>(null);
  const graphicsRef = useRef<Graphics | null>(null);
  const stableViewportRef = useRef<GraphViewport | null>(viewport);
  const drawablesRef = useRef<
    Array<SettingsGraphSubstrateCanarySectionShellPixiDrawable>
  >([]);
  const stablePresentedSceneSectionsRef = useRef<
    Array<SettingsGraphSubstrateCanarySceneSection>
  >([]);
  const stableDrawablesRef = useRef<
    Array<SettingsGraphSubstrateCanarySectionShellPixiDrawable>
  >([]);
  const pixiSyncCountRef = useRef(0);
  const presentedSceneSections = useMemo(() => {
    const nextPresentedSceneSections = sceneSections.filter((section) =>
      shouldPresentSettingsGraphSubstrateCanarySectionShell({
        draggingSectionId,
        section,
        viewport,
        visibleViewportRect,
      }),
    );
    if (
      areSettingsGraphSubstrateCanaryPresentedSceneSectionsEqual(
        stablePresentedSceneSectionsRef.current,
        nextPresentedSceneSections,
      )
    ) {
      return stablePresentedSceneSectionsRef.current;
    }
    stablePresentedSceneSectionsRef.current = nextPresentedSceneSections;
    return nextPresentedSceneSections;
  }, [draggingSectionId, sceneSections, viewport, visibleViewportRect]);
  const darkMode = useLocalStorage((state) => state.darkMode);
  const activeSectionIds = useActiveSectionUI(
    (state) => state.activeIds,
    _.isEqual,
  );
  const sectionSeedNodes = useSettingsGraphSubstrateCanarySceneStore(
    (state) => state.sectionSeedNodes,
    _.isEqual,
  );
  const previewStyleColors = useTemporaryMiscState((state) => {
    const next: Record<string, string | null | undefined> = {};
    for (const section of presentedSceneSections) {
      next[section.sectionId] = state[
        getSectionStylePreviewColorKey(section.sectionId)
      ] as string | null | undefined;
    }
    return next;
  }, _.isEqual);
  const drawables = useMemo(() => {
    return resolveSettingsGraphSubstrateCanarySectionShellPixiDrawables({
      activeSectionIds,
      darkMode,
      draggingSectionId,
      hoveredSectionId,
      previewStyleColors,
      sceneSections: presentedSceneSections,
      sectionSeedNodes,
    });
  }, [
    activeSectionIds,
    darkMode,
    draggingSectionId,
    hoveredSectionId,
    previewStyleColors,
    presentedSceneSections,
    sectionSeedNodes,
  ]);
  const stableDrawables = useMemo(() => {
    if (
      areSettingsGraphSubstrateCanarySectionShellPixiDrawablesEqual(
        stableDrawablesRef.current,
        drawables,
      )
    ) {
      return stableDrawablesRef.current;
    }

    stableDrawablesRef.current = drawables;
    return drawables;
  }, [drawables]);
  const stableViewport = useMemo(() => {
    if (
      areSettingsGraphSubstrateCanarySectionShellPixiViewportsEqual(
        stableViewportRef.current,
        viewport,
      )
    ) {
      return stableViewportRef.current;
    }

    stableViewportRef.current = viewport;
    return viewport;
  }, [viewport]);

  drawablesRef.current = stableDrawables;

  useLayoutEffect(() => {
    updateSettingsGraphSubstrateCanaryInstrumentationSnapshot({
      pixiDrawableCount: stableDrawables.length,
    });
  }, [stableDrawables.length]);

  useEffect(() => {
    let cancelled = false;
    let initCompleted = false;
    let destroyed = false;
    let resizeObserver: ResizeObserver | null = null;
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;

    if (!canvas || !host) {
      return;
    }

    const app = new Application();
    const graphics = new Graphics();

    const destroyPixi = () => {
      if (destroyed || !initCompleted) {
        return;
      }
      destroyed = true;
      resizeObserver?.disconnect();
      resizeObserver = null;
      graphicsRef.current = null;
      appRef.current = null;
      graphics.destroy();
      app.destroy({ removeView: false });
    };

    void (async () => {
      await app.init({
        autoDensity: true,
        autoStart: false,
        backgroundAlpha: 0,
        canvas,
        antialias: true,
        preference: "webgl",
        resolution: window.devicePixelRatio || 1,
        sharedTicker: false,
      });
      initCompleted = true;
      if (cancelled) {
        destroyPixi();
        return;
      }

      app.stage.eventMode = "none";
      graphics.eventMode = "none";
      app.stage.addChild(graphics);
      appRef.current = app;
      graphicsRef.current = graphics;

      const redrawCanvas = () => {
        if (
          !redrawSettingsGraphSubstrateCanarySectionShellPixiCanvas({
            app,
            drawables: drawablesRef.current,
            graphics,
            hostRef: canvasRef,
            viewport: stableViewportRef.current,
          })
        ) {
          return;
        }
        pixiSyncCountRef.current += 1;
        updateSettingsGraphSubstrateCanaryInstrumentationSnapshot({
          pixiDrawableCount: drawablesRef.current.length,
          pixiSyncCount: pixiSyncCountRef.current,
        });
      };
      const presentViewport = () => {
        presentSettingsGraphSubstrateCanarySectionShellPixiViewport({
          app,
          hostRef: canvasRef,
          viewport: stableViewportRef.current,
        });
      };

      redrawCanvas();
      resizeObserver = new ResizeObserver(presentViewport);
      resizeObserver.observe(host);
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      pixiSyncCountRef.current = 0;
      updateSettingsGraphSubstrateCanaryInstrumentationSnapshot({
        pixiDrawableCount: 0,
        pixiSyncCount: 0,
      });
      if (initCompleted) {
        destroyPixi();
        return;
      }
      graphicsRef.current = null;
      appRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const app = appRef.current;
    const graphics = graphicsRef.current;
    if (!app || !graphics) {
      return;
    }
    if (
      !redrawSettingsGraphSubstrateCanarySectionShellPixiCanvas({
        app,
        drawables: stableDrawables,
        graphics,
        hostRef: canvasRef,
        viewport: stableViewportRef.current,
      })
    ) {
      return;
    }
    pixiSyncCountRef.current += 1;
    updateSettingsGraphSubstrateCanaryInstrumentationSnapshot({
      pixiDrawableCount: stableDrawables.length,
      pixiSyncCount: pixiSyncCountRef.current,
    });
  }, [stableDrawables]);

  useLayoutEffect(() => {
    const app = appRef.current;
    if (!app) {
      return;
    }
    presentSettingsGraphSubstrateCanarySectionShellPixiViewport({
      app,
      hostRef: canvasRef,
      viewport: stableViewport,
    });
  }, [stableViewport]);

  if (stableDrawables.length === 0) {
    return null;
  }

  return (
    <canvas
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      data-testid="graph-substrate-canary-section-pixi-layer"
      ref={canvasRef}
      style={{
        visibility: viewport && viewport.zoom > 0 ? "visible" : "hidden",
        zIndex: 1,
      }}
    />
  );
}

function areSettingsGraphSubstrateCanarySectionShellPixiViewportsEqual(
  left: GraphViewport | null,
  right: GraphViewport | null,
) {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return left.x === right.x && left.y === right.y && left.zoom === right.zoom;
}

function areSettingsGraphSubstrateCanaryPresentedSceneSectionsEqual(
  left: ReadonlyArray<SettingsGraphSubstrateCanarySceneSection>,
  right: ReadonlyArray<SettingsGraphSubstrateCanarySceneSection>,
) {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function redrawSettingsGraphSubstrateCanarySectionShellPixiCanvas({
  app,
  drawables,
  graphics,
  hostRef,
  viewport,
}: {
  app: Application;
  drawables: Array<SettingsGraphSubstrateCanarySectionShellPixiDrawable>;
  graphics: Graphics;
  hostRef: RefObject<HTMLCanvasElement | null>;
  viewport: GraphViewport | null;
}): boolean {
  if (
    !prepareSettingsGraphSubstrateCanarySectionShellPixiViewport({
      app,
      hostRef,
      viewport,
    })
  ) {
    return false;
  }

  graphics.clear();
  for (const drawable of drawables) {
    if (drawable.fill) {
      graphics
        .roundRect(
          drawable.x,
          drawable.y,
          drawable.width,
          drawable.height,
          drawable.cornerRadius,
        )
        .fill({
          alpha: drawable.fill.alpha,
          color: drawable.fill.color,
        });
    }
    if (drawable.surfaceFrame) {
      graphics
        .roundRect(
          drawable.x,
          drawable.y,
          drawable.width,
          drawable.height,
          drawable.cornerRadius,
        )
        .stroke({
          alignment: drawable.surfaceFrame.alignment,
          alpha: drawable.surfaceFrame.alpha,
          color: drawable.surfaceFrame.color,
          join: "round",
          width: drawable.surfaceFrame.width,
        });
    }
    if (drawable.outline) {
      graphics
        .roundRect(
          drawable.x,
          drawable.y,
          drawable.width,
          drawable.height,
          drawable.cornerRadius,
        )
        .stroke({
          alignment: drawable.outline.alignment,
          alpha: drawable.outline.alpha,
          color: drawable.outline.color,
          join: "round",
          width: drawable.outline.width,
        });
    }
    if (drawable.border) {
      graphics
        .roundRect(
          drawable.x,
          drawable.y,
          drawable.width,
          drawable.height,
          drawable.cornerRadius,
        )
        .stroke({
          alignment: drawable.border.alignment,
          alpha: drawable.border.alpha,
          color: drawable.border.color,
          join: "round",
          width: drawable.border.width,
        });
    }
    if (drawable.topDragHandle) {
      graphics
        .roundRect(
          drawable.topDragHandle.x,
          drawable.topDragHandle.y,
          drawable.topDragHandle.width,
          drawable.topDragHandle.height,
          drawable.topDragHandle.cornerRadius,
        )
        .fill({
          alpha: drawable.topDragHandle.fill.alpha,
          color: drawable.topDragHandle.fill.color,
        });
    }
  }
  app.render();
  return true;
}

function presentSettingsGraphSubstrateCanarySectionShellPixiViewport({
  app,
  hostRef,
  viewport,
}: {
  app: Application;
  hostRef: RefObject<HTMLCanvasElement | null>;
  viewport: GraphViewport | null;
}): boolean {
  if (
    !prepareSettingsGraphSubstrateCanarySectionShellPixiViewport({
      app,
      hostRef,
      viewport,
    })
  ) {
    return false;
  }

  app.render();
  return true;
}

function prepareSettingsGraphSubstrateCanarySectionShellPixiViewport({
  app,
  hostRef,
  viewport,
}: {
  app: Application;
  hostRef: RefObject<HTMLCanvasElement | null>;
  viewport: GraphViewport | null;
}): boolean {
  const host = hostRef.current?.parentElement;
  if (!host || !viewport || viewport.zoom <= 0) {
    return false;
  }

  const width = host.clientWidth;
  const height = host.clientHeight;
  if (width <= 0 || height <= 0) {
    return false;
  }

  if (app.renderer.width !== width || app.renderer.height !== height) {
    app.renderer.resize(width, height);
  }

  app.stage.position.set(viewport.x, viewport.y);
  app.stage.scale.set(viewport.zoom);
  return true;
}
