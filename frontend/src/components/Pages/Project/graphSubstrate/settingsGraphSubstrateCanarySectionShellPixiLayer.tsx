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
import type { SettingsGraphSubstrateCanarySceneSection } from "./settingsGraphSubstrateCanarySceneSnapshot";
import { useSettingsGraphSubstrateCanarySceneStore } from "./settingsGraphSubstrateCanarySceneStore";
import {
  resolveSettingsGraphSubstrateCanarySectionShellPixiDrawables,
  type SettingsGraphSubstrateCanarySectionShellPixiDrawable,
} from "./settingsGraphSubstrateCanarySectionShellPixiModel";
import type { GraphViewport } from "./viewportTransform";

type SettingsGraphSubstrateCanarySectionShellPixiLayerProps = {
  draggingSectionId: string | null;
  hoveredSectionId: string | null;
  sceneSections: Array<SettingsGraphSubstrateCanarySceneSection>;
  viewport: GraphViewport | null;
};

export function SettingsGraphSubstrateCanarySectionShellPixiLayer({
  draggingSectionId,
  hoveredSectionId,
  sceneSections,
  viewport,
}: SettingsGraphSubstrateCanarySectionShellPixiLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<Application | null>(null);
  const graphicsRef = useRef<Graphics | null>(null);
  const drawablesRef = useRef<
    Array<SettingsGraphSubstrateCanarySectionShellPixiDrawable>
  >([]);
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
    for (const section of sceneSections) {
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
      sceneSections,
      sectionSeedNodes,
      viewport,
    });
  }, [
    activeSectionIds,
    darkMode,
    draggingSectionId,
    hoveredSectionId,
    previewStyleColors,
    sceneSections,
    sectionSeedNodes,
    viewport,
  ]);

  drawablesRef.current = drawables;

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

      const syncCanvas = () => {
        syncSettingsGraphSubstrateCanarySectionShellPixiCanvas({
          app,
          drawables: drawablesRef.current,
          graphics,
          hostRef: canvasRef,
        });
      };

      syncCanvas();
      resizeObserver = new ResizeObserver(syncCanvas);
      resizeObserver.observe(host);
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
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
    syncSettingsGraphSubstrateCanarySectionShellPixiCanvas({
      app,
      drawables,
      graphics,
      hostRef: canvasRef,
    });
  }, [drawables]);

  if (drawables.length === 0) {
    return null;
  }

  return (
    <canvas
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      data-testid="graph-substrate-canary-section-pixi-layer"
      ref={canvasRef}
      style={{ zIndex: 1 }}
    />
  );
}

function syncSettingsGraphSubstrateCanarySectionShellPixiCanvas({
  app,
  drawables,
  graphics,
  hostRef,
}: {
  app: Application;
  drawables: Array<SettingsGraphSubstrateCanarySectionShellPixiDrawable>;
  graphics: Graphics;
  hostRef: RefObject<HTMLCanvasElement | null>;
}) {
  const host = hostRef.current?.parentElement;
  if (!host) {
    return;
  }

  const width = host.clientWidth;
  const height = host.clientHeight;
  if (width <= 0 || height <= 0) {
    return;
  }

  if (app.renderer.width !== width || app.renderer.height !== height) {
    app.renderer.resize(width, height);
  }

  graphics.clear();
  for (const drawable of drawables) {
    if (drawable.fill) {
      graphics
        .roundRect(
          drawable.screenX,
          drawable.screenY,
          drawable.screenWidth,
          drawable.screenHeight,
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
          drawable.screenX,
          drawable.screenY,
          drawable.screenWidth,
          drawable.screenHeight,
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
          drawable.screenX,
          drawable.screenY,
          drawable.screenWidth,
          drawable.screenHeight,
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
          drawable.screenX,
          drawable.screenY,
          drawable.screenWidth,
          drawable.screenHeight,
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
          drawable.topDragHandle.screenX,
          drawable.topDragHandle.screenY,
          drawable.topDragHandle.screenWidth,
          drawable.topDragHandle.screenHeight,
          drawable.topDragHandle.cornerRadius,
        )
        .fill({
          alpha: drawable.topDragHandle.fill.alpha,
          color: drawable.topDragHandle.fill.color,
        });
    }
  }
  app.render();
}
