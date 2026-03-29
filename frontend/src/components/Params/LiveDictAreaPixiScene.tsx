import { useReactFlow } from "forks/xyflow/core/store";
import { Application, Graphics, Text, type ColorSource } from "pixi.js";
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocalStorage } from "state/definitions";
import type { LiveDictAreaSceneBoundary } from "./groupContainerLiveDictAreaSceneBoundary";
import {
  buildLiveDictAreaPixiLayout,
  type LiveDictAreaPixiEdgePortLayout,
  type LiveDictAreaPixiEdgeStripLayout,
  type LiveDictAreaPixiLayout,
  type LiveDictAreaPixiParamAreaLayout,
  type LiveDictAreaPixiRowLayout,
} from "./liveDictAreaPixiLayout";
import {
  getLiveDictAreaPixiLogicalCanvasWidth,
  getLiveDictAreaPixiRenderResolution,
  subscribeToLiveDictAreaPixiFontLoadInvalidation,
} from "./liveDictAreaPixiSceneView";

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
  const viewportZoom = useReactFlow((state) => state.transform[2]);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const [hostWidth, setHostWidth] = useState(0);
  const [devicePixelRatio, setDevicePixelRatio] = useState(() =>
    typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
  );
  const [fontLoadVersion, setFontLoadVersion] = useState(0);
  const logicalCanvasWidth = getLiveDictAreaPixiLogicalCanvasWidth(hostWidth);
  const renderResolution = getLiveDictAreaPixiRenderResolution({
    devicePixelRatio,
    viewportZoom,
  });
  const summaryLayout = useMemo(
    () =>
      buildLiveDictAreaPixiLayout({
        liveDictAreaSceneBoundary,
        width: logicalCanvasWidth,
      }),
    [liveDictAreaSceneBoundary, logicalCanvasWidth],
  );

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const updateWidth = (nextWidth: number) => {
      setHostWidth((currentWidth) =>
        currentWidth === nextWidth ? currentWidth : nextWidth,
      );
    };

    updateWidth(host.clientWidth || host.offsetWidth || 0);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      updateWidth(
        Math.floor(
          entry?.borderBoxSize?.[0]?.inlineSize ??
            entry?.contentRect.width ??
            host.clientWidth ??
            host.offsetWidth ??
            0,
        ),
      );
    });
    observer.observe(host);

    return () => {
      observer.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    if (typeof document === "undefined") {
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
    const host = hostRef.current;
    if (
      !host ||
      summaryLayout.canvasWidth <= 0 ||
      summaryLayout.canvasHeight <= 0
    ) {
      return;
    }
    let cancelled = false;
    let frameId = 0;

    const renderSceneForHost = async () => {
      let app = appRef.current;

      if (!app) {
        app = new Application();
        await app.init({
          antialias: true,
          autoDensity: true,
          autoStart: false,
          backgroundAlpha: 0,
          height: summaryLayout.canvasHeight,
          preference: "webgl",
          resolution: renderResolution,
          width: summaryLayout.canvasWidth,
        });

        if (cancelled) {
          app.destroy(true, true);
          return;
        }

        app.canvas.className = "block h-full w-full";
        configureLiveDictAreaPixiStaticScene(app);
        appRef.current = app;
      } else {
        app.renderer.resize(
          summaryLayout.canvasWidth,
          summaryLayout.canvasHeight,
          renderResolution,
        );
      }

      if (host.firstChild !== app.canvas) {
        host.replaceChildren(app.canvas);
      }
      const nextCanvasHeight = `${summaryLayout.canvasHeight}px`;
      if (host.style.height !== nextCanvasHeight) {
        host.style.height = nextCanvasHeight;
      }
      configureLiveDictAreaPixiStaticScene(app);
      app.canvas.style.height = `${summaryLayout.canvasHeight}px`;
      app.canvas.style.width = "100%";

      drawLiveDictAreaPixiScene({
        app,
        layout: summaryLayout,
        palette: getLiveDictAreaPixiPalette(darkMode),
        renderResolution,
      });

      app.render();
    };

    frameId = requestAnimationFrame(() => {
      void renderSceneForHost();
    });

    return () => {
      cancelled = true;
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [darkMode, fontLoadVersion, renderResolution, summaryLayout]);

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
  renderResolution,
}: {
  app: Application;
  layout: LiveDictAreaPixiLayout;
  palette: LiveDictAreaPixiPalette;
  renderResolution: number;
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
          renderResolution,
        }),
      );
      continue;
    }

    app.stage.addChild(
      drawLiveDictAreaParamArea({
        block,
        palette,
        renderResolution,
      }),
    );
  }
}

function drawLiveDictAreaEdgeStrip({
  block,
  palette,
  renderResolution,
}: {
  block: LiveDictAreaPixiEdgeStripLayout;
  palette: LiveDictAreaPixiPalette;
  renderResolution: number;
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
      renderResolution,
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
        renderResolution,
      }),
    );
  }

  for (const port of block.outputPorts) {
    graphics.addChild(
      drawEdgePort({
        palette,
        port,
        renderResolution,
      }),
    );
  }

  return graphics;
}

function drawLiveDictAreaParamArea({
  block,
  palette,
  renderResolution,
}: {
  block: LiveDictAreaPixiParamAreaLayout;
  palette: LiveDictAreaPixiPalette;
  renderResolution: number;
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
      renderResolution,
      text: block.title.toUpperCase(),
      x: block.x + LIVE_DICT_AREA_PIXI_LAYOUT.titleInsetX,
      y: block.y + 9,
    }),
  );

  for (const row of block.rows) {
    graphics.addChild(
      drawParamRow({
        palette,
        renderResolution,
        row,
      }),
    );
  }

  return graphics;
}

function drawParamRow({
  palette,
  renderResolution,
  row,
}: {
  palette: LiveDictAreaPixiPalette;
  renderResolution: number;
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
    resolution: renderResolution,
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
      resolution: renderResolution,
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
  renderResolution,
}: {
  palette: LiveDictAreaPixiPalette;
  port: LiveDictAreaPixiEdgePortLayout;
  renderResolution: number;
}) {
  const graphics = new Graphics();
  const dotX = port.align === "left" ? port.x + 4 : port.x - 4;

  graphics.circle(dotX, port.y + 6, 3);
  graphics.fill(port.isSelected ? palette.portSelectedDot : palette.portDot);

  const label = new Text({
    resolution: renderResolution,
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
  renderResolution,
  text,
  x,
  y,
}: {
  palette: LiveDictAreaPixiPalette;
  renderResolution: number;
  text: string;
  x: number;
  y: number;
}) {
  const title = new Text({
    resolution: renderResolution,
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
