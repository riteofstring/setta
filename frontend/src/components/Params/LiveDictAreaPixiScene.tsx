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
  LIVE_DICT_AREA_PIXI_LAYOUT,
  type LiveDictAreaPixiEdgePortLayout,
  type LiveDictAreaPixiEdgeStripLayout,
  type LiveDictAreaPixiLayout,
  type LiveDictAreaPixiParamAreaLayout,
  type LiveDictAreaPixiRowLayout,
} from "./liveDictAreaPixiLayout";
import {
  getLiveDictAreaPixiAvailableCanvasHeight,
  getLiveDictAreaPixiLogicalCanvasWidth,
  getLiveDictAreaPixiPalette,
  getLiveDictAreaPixiParamColumnWidth,
  getLiveDictAreaPixiRenderResolution,
  getLiveDictAreaPixiTextFontFamily,
  getLiveDictAreaPixiTextResolution,
  getLiveDictAreaPixiTextStyleSet,
  getLiveDictAreaPixiUsableMaxCanvasHeight,
  subscribeToLiveDictAreaPixiFontLoadInvalidation,
  type LiveDictAreaPixiPalette,
  type LiveDictAreaPixiTextStyleSet,
} from "./liveDictAreaPixiSceneView";

type LiveDictAreaPixiSceneProps = {
  liveDictAreaSceneBoundary: LiveDictAreaSceneBoundary;
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
  const sceneRootRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const edgeLabelTextStyleRef = useRef<HTMLParagraphElement | null>(null);
  const edgeRowTextStyleRef = useRef<HTMLSpanElement | null>(null);
  const rowTextStyleRef = useRef<HTMLParagraphElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const [hostWidth, setHostWidth] = useState(0);
  const [availableCanvasHeight, setAvailableCanvasHeight] = useState<
    number | null
  >(null);
  const [devicePixelRatio, setDevicePixelRatio] = useState(() =>
    typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
  );
  const [fontLoadVersion, setFontLoadVersion] = useState(0);
  const logicalCanvasWidth = getLiveDictAreaPixiLogicalCanvasWidth(hostWidth);
  const renderResolution = getLiveDictAreaPixiRenderResolution({
    devicePixelRatio,
    viewportZoom,
  });
  const sectionStyleColor = getLiveDictAreaPixiSectionStyleColor(
    liveDictAreaSceneBoundary,
  );
  const textResolution = getLiveDictAreaPixiTextResolution(renderResolution);
  const usableMaxCanvasHeight = getLiveDictAreaPixiUsableMaxCanvasHeight(
    availableCanvasHeight,
  );
  const summaryLayout = useMemo(
    () =>
      buildLiveDictAreaPixiLayout({
        liveDictAreaSceneBoundary,
        maxCanvasHeight: usableMaxCanvasHeight,
        width: logicalCanvasWidth,
      }),
    [liveDictAreaSceneBoundary, logicalCanvasWidth, usableMaxCanvasHeight],
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
    const sceneRoot = sceneRootRef.current;
    if (!sceneRoot) {
      setAvailableCanvasHeight(null);
      return;
    }
    const clippingContainer =
      sceneRoot.closest<HTMLElement>("section") ??
      sceneRoot.closest<HTMLElement>(".section-main-full-w") ??
      sceneRoot.parentElement;
    if (!clippingContainer) {
      setAvailableCanvasHeight(null);
      return;
    }

    const updateAvailableHeight = () => {
      const normalizedHeight = getLiveDictAreaPixiAvailableCanvasHeight({
        clippingContainer,
        sceneRoot,
      });

      setAvailableCanvasHeight((currentHeight) =>
        currentHeight === normalizedHeight ? currentHeight : normalizedHeight,
      );
    };

    updateAvailableHeight();

    const observer = new ResizeObserver(() => {
      updateAvailableHeight();
    });
    observer.observe(sceneRoot);
    observer.observe(clippingContainer);
    window.addEventListener("resize", updateAvailableHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateAvailableHeight);
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
      const textFontFamily = getLiveDictAreaPixiTextFontFamily({
        fallbackElement: document.body,
        getComputedStyle: window.getComputedStyle,
        host,
      });
      const paramColumnWidth = getLiveDictAreaPixiParamColumnWidth({
        getComputedStyle: window.getComputedStyle,
        host,
      });
      const textStyleSet = getLiveDictAreaPixiTextStyleSet({
        edgeLabelElement: edgeLabelTextStyleRef.current,
        edgeRowElement: edgeRowTextStyleRef.current,
        getComputedStyle: window.getComputedStyle,
        rowElement: rowTextStyleRef.current,
      });
      const palette = getLiveDictAreaPixiPalette({
        darkMode,
        getComputedStyle: window.getComputedStyle,
        host,
        sectionStyleColor,
      });
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
        palette,
        paramColumnWidth,
        textResolution,
        textFontFamily,
        textStyleSet,
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
  }, [
    darkMode,
    fontLoadVersion,
    renderResolution,
    sectionStyleColor,
    summaryLayout,
    textResolution,
  ]);

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
      className="relative"
      data-live-dict-area-scene="pixi"
      data-live-dict-area-scene-available-height={
        availableCanvasHeight === null ? "" : availableCanvasHeight
      }
      data-live-dict-area-scene-block-count={summaryLayout.blocks.length}
      data-live-dict-area-scene-row-count={summaryLayout.totalRowCount}
      data-live-dict-area-scene-value-preview-count={
        summaryLayout.valuePreviewCount
      }
      ref={sceneRootRef}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 h-0 overflow-hidden opacity-0"
      >
        <p
          className="text-[0.5rem] font-bold uppercase"
          ref={edgeLabelTextStyleRef}
        />
        <span className="text-[0.65rem]" ref={edgeRowTextStyleRef} />
        <p className="font-sans text-xs font-semibold" ref={rowTextStyleRef} />
      </div>
      <div
        className="section-w-full"
        ref={hostRef}
        style={{ height: `${summaryLayout.canvasHeight}px` }}
      />
    </div>
  );
}

export const LiveDictAreaPixiScene = React.memo(_LiveDictAreaPixiScene);

function getLiveDictAreaPixiSectionStyleColor(
  liveDictAreaSceneBoundary: LiveDictAreaSceneBoundary,
) {
  const { canaryPacket } = liveDictAreaSceneBoundary.liveDictAreaBoundary;

  return (
    canaryPacket.pinnedParamAreaBlock?.domPacket.styleColor ??
    canaryPacket.unpinnedParamAreaBlock?.domPacket.styleColor ??
    canaryPacket.edgeStripBlock?.domPacket.styleColor ??
    null
  );
}

function drawLiveDictAreaPixiScene({
  app,
  layout,
  palette,
  paramColumnWidth,
  textResolution,
  textFontFamily,
  textStyleSet,
}: {
  app: Application;
  layout: LiveDictAreaPixiLayout;
  palette: LiveDictAreaPixiPalette;
  paramColumnWidth: number;
  textResolution: number;
  textFontFamily: string;
  textStyleSet: LiveDictAreaPixiTextStyleSet;
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
          textResolution,
          textFontFamily,
          textStyleSet,
        }),
      );
      continue;
    }

    app.stage.addChild(
      drawLiveDictAreaParamArea({
        block,
        palette,
        paramColumnWidth,
        textResolution,
        textFontFamily,
        textStyleSet,
      }),
    );
  }
}

function drawLiveDictAreaEdgeStrip({
  block,
  palette,
  textResolution,
  textFontFamily,
  textStyleSet,
}: {
  block: LiveDictAreaPixiEdgeStripLayout;
  palette: LiveDictAreaPixiPalette;
  textResolution: number;
  textFontFamily: string;
  textStyleSet: LiveDictAreaPixiTextStyleSet;
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
      textResolution,
      text: block.title.toUpperCase(),
      textFontFamily,
      textStyleSet,
      x: block.x + LIVE_DICT_AREA_PIXI_LAYOUT.titleInsetX,
      y: block.y + 9,
    }),
  );

  for (const port of block.inputPorts) {
    graphics.addChild(
      drawEdgePort({
        palette,
        port,
        textResolution,
        textFontFamily,
        textStyleSet,
      }),
    );
  }

  for (const port of block.outputPorts) {
    graphics.addChild(
      drawEdgePort({
        palette,
        port,
        textResolution,
        textFontFamily,
        textStyleSet,
      }),
    );
  }

  return graphics;
}

function drawLiveDictAreaParamArea({
  block,
  palette,
  paramColumnWidth,
  textResolution,
  textFontFamily,
  textStyleSet,
}: {
  block: LiveDictAreaPixiParamAreaLayout;
  palette: LiveDictAreaPixiPalette;
  paramColumnWidth: number;
  textResolution: number;
  textFontFamily: string;
  textStyleSet: LiveDictAreaPixiTextStyleSet;
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

  if (block.headerHeight > 0) {
    graphics.addChild(
      drawSceneTitle({
        palette,
        textResolution,
        text: block.title.toUpperCase(),
        textFontFamily,
        textStyleSet,
        x: block.x + LIVE_DICT_AREA_PIXI_LAYOUT.titleInsetX,
        y: block.y + 9,
      }),
    );
  }

  for (const row of block.rows) {
    graphics.addChild(
      drawParamRow({
        palette,
        paramColumnWidth,
        row,
        textResolution,
        textFontFamily,
        textStyleSet,
      }),
    );
  }

  return graphics;
}

function drawParamRow({
  palette,
  paramColumnWidth,
  row,
  textResolution,
  textFontFamily,
  textStyleSet,
}: {
  palette: LiveDictAreaPixiPalette;
  paramColumnWidth: number;
  row: LiveDictAreaPixiRowLayout;
  textResolution: number;
  textFontFamily: string;
  textStyleSet: LiveDictAreaPixiTextStyleSet;
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

  const rowRightEdgeX = row.width - LIVE_DICT_AREA_PIXI_LAYOUT.rowInsetX * 2;
  const valueColumnX =
    row.x +
    LIVE_DICT_AREA_PIXI_LAYOUT.rowInsetX +
    paramColumnWidth +
    LIVE_DICT_AREA_PIXI_LAYOUT.rowInsetX +
    2;
  const label = buildFittedRowText({
    maxWidth: valueColumnX - row.labelX - 12,
    textResolution,
    style: {
      fill: palette.bodyText,
      fontFamily: textFontFamily,
      fontSize: textStyleSet.rowFontSize,
      fontWeight: textStyleSet.rowFontWeight,
    },
    text: row.labelText,
  });

  if (label) {
    label.x = row.labelX;
    label.y = row.y + 4;
    graphics.addChild(label);
  }

  if (row.valueText) {
    const valueLabel = buildFittedRowText({
      maxWidth: rowRightEdgeX - valueColumnX,
      textResolution,
      style: {
        fill: palette.bodyText,
        fontFamily: textFontFamily,
        fontSize: textStyleSet.edgeRowFontSize,
        fontWeight: textStyleSet.edgeRowFontWeight,
      },
      text: row.valueText,
    });

    if (valueLabel) {
      valueLabel.x = rowRightEdgeX - valueLabel.width;
      valueLabel.y = row.y + 4;
      graphics.addChild(valueLabel);
    }
  }

  return graphics;
}

function buildFittedRowText({
  maxWidth,
  textResolution,
  style,
  text,
}: {
  maxWidth: number;
  textResolution: number;
  style: {
    fill: ColorSource;
    fontFamily: string;
    fontSize: number;
    fontWeight: string;
  };
  text: string;
}) {
  if (maxWidth <= 0 || text.trim().length === 0) {
    return null;
  }

  const label = new Text({
    resolution: textResolution,
    style,
    text,
  });
  if (label.width <= maxWidth) {
    return label;
  }

  const ellipsis = "...";
  label.text = ellipsis;
  if (label.width > maxWidth) {
    label.destroy();
    return null;
  }

  let bestText = ellipsis;
  let low = 0;
  let high = text.length;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const nextText = `${text.slice(0, mid).trimEnd()}${ellipsis}`;
    label.text = nextText;

    if (label.width <= maxWidth) {
      bestText = nextText;
      low = mid + 1;
      continue;
    }

    high = mid - 1;
  }

  label.text = bestText;
  return label;
}

function drawEdgePort({
  palette,
  port,
  textResolution,
  textFontFamily,
  textStyleSet,
}: {
  palette: LiveDictAreaPixiPalette;
  port: LiveDictAreaPixiEdgePortLayout;
  textResolution: number;
  textFontFamily: string;
  textStyleSet: LiveDictAreaPixiTextStyleSet;
}) {
  const graphics = new Graphics();
  const dotX = port.align === "left" ? port.x + 4 : port.x - 4;

  graphics.circle(dotX, port.y + 6, 3);
  graphics.fill(port.isSelected ? palette.portSelectedDot : palette.portDot);

  const label = new Text({
    resolution: textResolution,
    style: {
      fill: palette.bodyText,
      fontFamily: textFontFamily,
      fontSize: textStyleSet.edgeRowFontSize,
      fontWeight: port.isSelected
        ? textStyleSet.rowFontWeight
        : textStyleSet.edgeRowFontWeight,
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
  textResolution,
  text,
  textFontFamily,
  textStyleSet,
  x,
  y,
}: {
  palette: LiveDictAreaPixiPalette;
  textResolution: number;
  text: string;
  textFontFamily: string;
  textStyleSet: LiveDictAreaPixiTextStyleSet;
  x: number;
  y: number;
}) {
  const title = new Text({
    resolution: textResolution,
    style: {
      fill: palette.titleText,
      fontFamily: textFontFamily,
      fontSize: textStyleSet.titleFontSize,
      fontWeight: textStyleSet.titleFontWeight,
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
