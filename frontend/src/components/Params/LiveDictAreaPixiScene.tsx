import { Application, Graphics, Text, type ColorSource } from "pixi.js";
import React, { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useLocalStorage } from "state/definitions";
import type { LiveDictAreaSceneBoundary } from "./groupContainerLiveDictAreaSceneBoundary";
import {
  buildLiveDictAreaPixiLayout,
  LIVE_DICT_AREA_PIXI_LAYOUT,
  type LiveDictAreaPixiEdgePortLayout,
  type LiveDictAreaPixiEdgeStripLayout,
  type LiveDictAreaPixiLayout,
  type LiveDictAreaPixiParamAreaLayout,
  type LiveDictAreaPixiRowLayout,
} from "./liveDictAreaPixiLayout";

type LiveDictAreaPixiSceneProps = {
  liveDictAreaSceneBoundary: LiveDictAreaSceneBoundary;
};

type LiveDictAreaPixiPalette = {
  bodyText: ColorSource;
  border: ColorSource;
  groupTagText: ColorSource;
  panelBackground: ColorSource;
  panelBackgroundAlt: ColorSource;
  portDot: ColorSource;
  portSelectedDot: ColorSource;
  rowBackground: ColorSource;
  rowBackgroundAlt: ColorSource;
  rowPlaceholderFill: ColorSource;
  titleText: ColorSource;
};

type LiveDictAreaPixiStaticSceneApplication = {
  canvas: {
    style: {
      pointerEvents: string;
    };
  };
  stage: Pick<Application["stage"], "eventMode" | "interactiveChildren">;
};

export function configureLiveDictAreaPixiStaticScene(
  app: LiveDictAreaPixiStaticSceneApplication,
): void {
  app.stage.eventMode = "none";
  app.stage.interactiveChildren = false;
  app.canvas.style.pointerEvents = "none";
}

function _LiveDictAreaPixiScene({
  liveDictAreaSceneBoundary,
}: LiveDictAreaPixiSceneProps) {
  const darkMode = useLocalStorage((state) => state.darkMode);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const summaryLayout = useMemo(
    () =>
      buildLiveDictAreaPixiLayout({
        liveDictAreaSceneBoundary,
        width: LIVE_DICT_AREA_PIXI_LAYOUT.canvasMinWidth,
      }),
    [liveDictAreaSceneBoundary],
  );

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    let cancelled = false;
    let frameId = 0;
    let lastObservedWidth = 0;

    const renderSceneForHost = async () => {
      const nextWidth = Math.max(
        Math.floor(host.getBoundingClientRect().width),
        LIVE_DICT_AREA_PIXI_LAYOUT.canvasMinWidth,
      );
      const layout = buildLiveDictAreaPixiLayout({
        liveDictAreaSceneBoundary,
        width: nextWidth,
      });
      if (layout.canvasWidth <= 0 || layout.canvasHeight <= 0) {
        return;
      }

      let app = appRef.current;

      if (!app) {
        app = new Application();
        await app.init({
          antialias: true,
          autoDensity: true,
          autoStart: false,
          backgroundAlpha: 0,
          height: layout.canvasHeight,
          preference: "webgl",
          resolution: window.devicePixelRatio || 1,
          width: layout.canvasWidth,
        });

        if (cancelled) {
          app.destroy(true, true);
          return;
        }

        app.canvas.className = "block h-full w-full";
        configureLiveDictAreaPixiStaticScene(app);
        appRef.current = app;
      } else {
        app.renderer.resize(layout.canvasWidth, layout.canvasHeight);
      }

      if (host.firstChild !== app.canvas) {
        host.replaceChildren(app.canvas);
      }
      const nextCanvasHeight = `${layout.canvasHeight}px`;
      if (host.style.height !== nextCanvasHeight) {
        host.style.height = nextCanvasHeight;
      }
      configureLiveDictAreaPixiStaticScene(app);
      app.canvas.style.height = `${layout.canvasHeight}px`;
      app.canvas.style.width = "100%";

      drawLiveDictAreaPixiScene({
        app,
        layout,
        palette: getLiveDictAreaPixiPalette(darkMode),
      });

      app.render();
    };

    const scheduleRender = () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(() => {
        void renderSceneForHost();
      });
    };

    scheduleRender();

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const nextObservedWidth = Math.floor(
        entry?.borderBoxSize?.[0]?.inlineSize ?? entry?.contentRect.width ?? 0,
      );
      if (nextObservedWidth <= 0 || nextObservedWidth === lastObservedWidth) {
        return;
      }
      lastObservedWidth = nextObservedWidth;
      scheduleRender();
    });
    observer.observe(host);

    return () => {
      cancelled = true;
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      observer.disconnect();
    };
  }, [darkMode, liveDictAreaSceneBoundary]);

  useEffect(() => {
    return () => {
      const app = appRef.current;
      if (!app) {
        return;
      }
      appRef.current = null;
      app.destroy(true, true);
    };
  }, []);

  return (
    <div
      data-live-dict-area-scene="pixi"
      data-live-dict-area-scene-block-count={summaryLayout.blocks.length}
      data-live-dict-area-scene-row-count={summaryLayout.totalRowCount}
    >
      <div
        className="section-w-full"
        ref={hostRef}
        style={{ height: `${summaryLayout.canvasHeight}px` }}
      />
    </div>
  );
}

export const LiveDictAreaPixiScene = React.memo(_LiveDictAreaPixiScene);

function drawLiveDictAreaPixiScene({
  app,
  layout,
  palette,
}: {
  app: Application;
  layout: LiveDictAreaPixiLayout;
  palette: LiveDictAreaPixiPalette;
}) {
  for (const child of app.stage.removeChildren()) {
    child.destroy();
  }

  for (const block of layout.blocks) {
    if (block.kind === "edge-strip") {
      app.stage.addChild(
        drawLiveDictAreaEdgeStrip({
          block,
          palette,
        }),
      );
      continue;
    }

    app.stage.addChild(
      drawLiveDictAreaParamArea({
        block,
        palette,
      }),
    );
  }
}

function drawLiveDictAreaEdgeStrip({
  block,
  palette,
}: {
  block: LiveDictAreaPixiEdgeStripLayout;
  palette: LiveDictAreaPixiPalette;
}) {
  const graphics = drawRoundedPanel({
    fill: palette.panelBackground,
    height: block.height,
    stroke: palette.border,
    width: block.width,
    x: block.x,
    y: block.y,
  });

  graphics.addChild(
    drawSceneTitle({
      palette,
      text: block.title.toUpperCase(),
      x: block.x + LIVE_DICT_AREA_PIXI_LAYOUT.titleInsetX,
      y: block.y + 9,
    }),
  );

  for (const port of block.inputPorts) {
    graphics.addChild(
      drawEdgePort({
        palette,
        port,
      }),
    );
  }

  for (const port of block.outputPorts) {
    graphics.addChild(
      drawEdgePort({
        palette,
        port,
      }),
    );
  }

  return graphics;
}

function drawLiveDictAreaParamArea({
  block,
  palette,
}: {
  block: LiveDictAreaPixiParamAreaLayout;
  palette: LiveDictAreaPixiPalette;
}) {
  const panelFill =
    block.kind === "pinned-param-area"
      ? palette.panelBackground
      : palette.panelBackgroundAlt;
  const graphics = drawRoundedPanel({
    fill: panelFill,
    height: block.height,
    stroke: palette.border,
    width: block.width,
    x: block.x,
    y: block.y,
  });

  graphics.addChild(
    drawSceneTitle({
      palette,
      text: block.title.toUpperCase(),
      x: block.x + LIVE_DICT_AREA_PIXI_LAYOUT.titleInsetX,
      y: block.y + 9,
    }),
  );

  for (const row of block.rows) {
    graphics.addChild(
      drawParamRow({
        palette,
        row,
      }),
    );
  }

  return graphics;
}

function drawParamRow({
  palette,
  row,
}: {
  palette: LiveDictAreaPixiPalette;
  row: LiveDictAreaPixiRowLayout;
}) {
  const fill =
    row.kind === "placeholder"
      ? palette.rowPlaceholderFill
      : row.kind === "group"
        ? palette.rowBackgroundAlt
        : palette.rowBackground;
  const graphics = new Graphics();

  graphics.roundRect(
    row.x,
    row.y,
    row.width - row.x - LIVE_DICT_AREA_PIXI_LAYOUT.rowInsetX,
    row.blockHeight,
    8,
  );
  graphics.fill(fill);

  const label = new Text({
    style: {
      fill: palette.bodyText,
      fontFamily: "Inter, sans-serif",
      fontSize: 11,
      fontWeight: row.kind === "group" ? "600" : "500",
    },
    text: row.labelText,
  });

  label.x = row.labelX;
  label.y = row.y + 4;
  graphics.addChild(label);

  if (row.kindTag) {
    const tag = new Text({
      style: {
        fill: palette.groupTagText,
        fontFamily: "Inter, sans-serif",
        fontSize: 9,
        fontWeight: "600",
      },
      text: row.kindTag,
    });

    tag.x = row.labelX + Math.max(label.width + 8, 72);
    tag.y = row.y + 5;
    graphics.addChild(tag);
  }

  return graphics;
}

function drawEdgePort({
  palette,
  port,
}: {
  palette: LiveDictAreaPixiPalette;
  port: LiveDictAreaPixiEdgePortLayout;
}) {
  const graphics = new Graphics();
  const dotX = port.align === "left" ? port.x + 4 : port.x - 4;

  graphics.circle(dotX, port.y + 6, 3);
  graphics.fill(port.isSelected ? palette.portSelectedDot : palette.portDot);

  const label = new Text({
    style: {
      fill: palette.bodyText,
      fontFamily: "Inter, sans-serif",
      fontSize: 11,
      fontWeight: port.isSelected ? "600" : "500",
    },
    text: port.label,
  });

  label.x = port.align === "left" ? port.x : port.x - label.width;
  label.y = port.y;
  graphics.addChild(label);

  return graphics;
}

function drawSceneTitle({
  palette,
  text,
  x,
  y,
}: {
  palette: LiveDictAreaPixiPalette;
  text: string;
  x: number;
  y: number;
}) {
  const title = new Text({
    style: {
      fill: palette.titleText,
      fontFamily: "Inter, sans-serif",
      fontSize: 10,
      fontWeight: "600",
      letterSpacing: 1.5,
    },
    text,
  });

  title.x = x;
  title.y = y;

  return title;
}

function drawRoundedPanel({
  fill,
  height,
  stroke,
  width,
  x,
  y,
}: {
  fill: ColorSource;
  height: number;
  stroke: ColorSource;
  width: number;
  x: number;
  y: number;
}) {
  const graphics = new Graphics();

  graphics.roundRect(
    x,
    y,
    width,
    height,
    LIVE_DICT_AREA_PIXI_LAYOUT.panelRadius,
  );
  graphics.fill(fill);
  graphics.stroke({
    alpha: 1,
    color: stroke,
    width: 1,
  });

  return graphics;
}

function getLiveDictAreaPixiPalette(
  darkMode: boolean,
): LiveDictAreaPixiPalette {
  if (darkMode) {
    return {
      bodyText: "#e5e7eb",
      border: "#334155",
      groupTagText: "#93c5fd",
      panelBackground: "#111827",
      panelBackgroundAlt: "#0f172a",
      portDot: "#94a3b8",
      portSelectedDot: "#38bdf8",
      rowBackground: "#172036",
      rowBackgroundAlt: "#1e293b",
      rowPlaceholderFill: "#1f2937",
      titleText: "#94a3b8",
    };
  }

  return {
    bodyText: "#0f172a",
    border: "#cbd5e1",
    groupTagText: "#2563eb",
    panelBackground: "#f8fafc",
    panelBackgroundAlt: "#f1f5f9",
    portDot: "#64748b",
    portSelectedDot: "#0284c7",
    rowBackground: "#ffffff",
    rowBackgroundAlt: "#eef2ff",
    rowPlaceholderFill: "#f8fafc",
    titleText: "#475569",
  };
}
