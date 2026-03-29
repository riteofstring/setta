import { useReactFlow } from "forks/xyflow/core/store";
import {
  Application,
  Container,
  Graphics,
  Text,
  type ColorSource,
} from "pixi.js";
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
  getLiveDictAreaPixiEdgeRowFrame,
  LIVE_DICT_AREA_PIXI_EDGE_ROW_FRAME_RADIUS_PX,
} from "./liveDictAreaPixiEdgeRowFrame";
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
  getLiveDictAreaPixiClippingContainer,
  getLiveDictAreaPixiColorControlStyle,
  getLiveDictAreaPixiComboboxControlStyle,
  getLiveDictAreaPixiCompactRowPrimitive,
  getLiveDictAreaPixiDetailRowChrome,
  getLiveDictAreaPixiDetailRowInteractionChrome,
  getLiveDictAreaPixiEdgePortChrome,
  getLiveDictAreaPixiLogicalCanvasWidth,
  getLiveDictAreaPixiPalette,
  getLiveDictAreaPixiParamColumnWidth,
  getLiveDictAreaPixiPresentationMode,
  getLiveDictAreaPixiRenderResolution,
  getLiveDictAreaPixiSwitchControlStyle,
  getLiveDictAreaPixiTextFontFamily,
  getLiveDictAreaPixiTextResolution,
  getLiveDictAreaPixiTextStyleSet,
  getLiveDictAreaPixiUsableMaxCanvasHeight,
  readLiveDictAreaPixiOverviewEnabledFromWindow,
  subscribeToLiveDictAreaPixiFontLoadInvalidation,
  type LiveDictAreaPixiCompactRowPrimitive,
  type LiveDictAreaPixiDetailRowInteractionState,
  type LiveDictAreaPixiEdgePortInteractionState,
  type LiveDictAreaPixiPalette,
  type LiveDictAreaPixiPresentationMode,
  type LiveDictAreaPixiTextStyleSet,
} from "./liveDictAreaPixiSceneView";
import { buildParamContainerLayout } from "./paramContainerView";

export type LiveDictAreaPixiSceneProps = {
  edgeRowInteractionState?: {
    focusedPortId: string | null;
    hoveredPortId: string | null;
    pressedPortId: string | null;
  };
  valueRowInteractionState?: {
    focusedRowId: string | null;
    hoveredRowId: string | null;
    pressedRowId: string | null;
  };
  liveDictAreaSceneBoundary: LiveDictAreaSceneBoundary;
  onSummaryLayoutChange?: (layout: LiveDictAreaPixiLayout | null) => void;
  onWebglContextLost?: () => void;
  renderBackend?: "local-app" | "shared-page-runtime";
  sectionId?: string | null;
  sectionName?: string | null;
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

function destroyLiveDictAreaPixiSceneApplication(app: Application): void {
  // Each card owns its renderer view, but the Pixi pools are page-global.
  // Avoid the boolean renderer destroy flag here so one scene fallback does
  // not clear shared pooled textures for sibling live scenes that are still mounted.
  app.destroy({ removeView: true }, true);
}

function _LiveDictAreaPixiScene({
  edgeRowInteractionState = {
    focusedPortId: null,
    hoveredPortId: null,
    pressedPortId: null,
  },
  valueRowInteractionState = {
    focusedRowId: null,
    hoveredRowId: null,
    pressedRowId: null,
  },
  liveDictAreaSceneBoundary,
  onSummaryLayoutChange,
  onWebglContextLost,
  renderBackend = "local-app",
  sectionId = null,
  sectionName = null,
}: LiveDictAreaPixiSceneProps) {
  const darkMode = useLocalStorage((state) => state.darkMode);
  const viewportZoom = useReactFlow((state) => state.transform[2]);
  const sceneRootRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const edgeLabelTextStyleRef = useRef<HTMLParagraphElement | null>(null);
  const edgeRowTextStyleRef = useRef<HTMLSpanElement | null>(null);
  const compactRowPrimitiveRef = useRef<HTMLElement | null>(null);
  const rowTextStyleRef = useRef<HTMLParagraphElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const webglContextLossCleanupRef = useRef<(() => void) | null>(null);
  const [hostWidth, setHostWidth] = useState(0);
  const [availableCanvasHeight, setAvailableCanvasHeight] = useState<
    number | null
  >(null);
  const [devicePixelRatio, setDevicePixelRatio] = useState(() =>
    typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
  );
  const [fontLoadVersion, setFontLoadVersion] = useState(0);
  const [compactRowPrimitive, setCompactRowPrimitive] =
    useState<LiveDictAreaPixiCompactRowPrimitive>(() =>
      getLiveDictAreaPixiCompactRowPrimitive({}),
    );
  const logicalCanvasWidth = getLiveDictAreaPixiLogicalCanvasWidth(hostWidth);
  const sectionStyleColor = getLiveDictAreaPixiSectionStyleColor(
    liveDictAreaSceneBoundary,
  );
  const overviewPresentationEnabled =
    readLiveDictAreaPixiOverviewEnabledFromWindow();
  const presentationMode = getLiveDictAreaPixiPresentationMode(viewportZoom, {
    overviewEnabled: overviewPresentationEnabled,
  });
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
  const renderResolution = getLiveDictAreaPixiRenderResolution({
    canvasHeight: summaryLayout.canvasHeight,
    canvasWidth: summaryLayout.canvasWidth,
    devicePixelRatio,
    viewportZoom,
  });
  const textResolution = getLiveDictAreaPixiTextResolution(renderResolution);
  const compactRowPrimitiveLayout = buildParamContainerLayout({
    bg: "",
    border: "",
    isTopLevelWithPad: false,
    paramHoverClassName: "",
    variant: "leaf",
  });
  const onWebglContextLostRef = useRef(onWebglContextLost);

  onWebglContextLostRef.current = onWebglContextLost;

  useLayoutEffect(() => {
    onSummaryLayoutChange?.(
      hostWidth > 0 && availableCanvasHeight !== null ? summaryLayout : null,
    );
  }, [availableCanvasHeight, hostWidth, onSummaryLayoutChange, summaryLayout]);

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
    const clippingContainer = getLiveDictAreaPixiClippingContainer(sceneRoot);
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
    if (renderBackend !== "local-app") {
      return;
    }
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
      const sceneRoot = sceneRootRef.current;
      if (sceneRoot) {
        sceneRoot.dataset.liveDictAreaScenePanelBackground =
          palette.panelBackground;
        sceneRoot.dataset.liveDictAreaSceneRowBackground =
          palette.rowBackground;
        sceneRoot.dataset.liveDictAreaSceneRowBackgroundAlt =
          palette.rowBackgroundAlt;
      }
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
          destroyLiveDictAreaPixiSceneApplication(app);
          return;
        }

        app.canvas.className = "block h-full w-full";
        const handleWebglContextLost = (event: Event) => {
          event.preventDefault();
          onWebglContextLostRef.current?.();
        };
        app.canvas.addEventListener("webglcontextlost", handleWebglContextLost);
        webglContextLossCleanupRef.current = () => {
          app.canvas.removeEventListener(
            "webglcontextlost",
            handleWebglContextLost,
          );
        };
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
        compactRowPrimitive,
        darkMode,
        edgeRowInteractionState,
        layout: summaryLayout,
        palette,
        paramColumnWidth,
        presentationMode,
        textResolution,
        textFontFamily,
        textStyleSet,
        valueRowInteractionState,
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
    compactRowPrimitive,
    darkMode,
    edgeRowInteractionState,
    fontLoadVersion,
    presentationMode,
    renderBackend,
    renderResolution,
    sectionStyleColor,
    summaryLayout,
    textResolution,
    valueRowInteractionState,
  ]);

  useEffect(() => {
    if (renderBackend === "local-app") {
      return;
    }

    webglContextLossCleanupRef.current?.();
    webglContextLossCleanupRef.current = null;
    const app = appRef.current;
    if (!app) {
      return;
    }

    appRef.current = null;
    destroyLiveDictAreaPixiSceneApplication(app);
    hostRef.current?.replaceChildren();
  }, [renderBackend]);

  useEffect(() => {
    return () => {
      webglContextLossCleanupRef.current?.();
      webglContextLossCleanupRef.current = null;
      const app = appRef.current;
      if (!app) {
        return;
      }
      appRef.current = null;
      destroyLiveDictAreaPixiSceneApplication(app);
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
      data-live-dict-area-scene-compact-row-horizontal-padding={
        compactRowPrimitive.horizontalPaddingPx
      }
      data-live-dict-area-scene-compact-row-radius={
        compactRowPrimitive.cornerRadiusPx
      }
      data-live-dict-area-scene-compact-row-surface={
        compactRowPrimitive.surfaceKind
      }
      data-live-dict-area-scene-edge-focused-port-id={
        edgeRowInteractionState.focusedPortId ?? undefined
      }
      data-live-dict-area-scene-edge-hovered-port-id={
        edgeRowInteractionState.hoveredPortId ?? undefined
      }
      data-live-dict-area-scene-edge-pressed-port-id={
        edgeRowInteractionState.pressedPortId ?? undefined
      }
      data-live-dict-area-scene-value-focused-row-id={
        valueRowInteractionState.focusedRowId ?? undefined
      }
      data-live-dict-area-scene-value-hovered-row-id={
        valueRowInteractionState.hoveredRowId ?? undefined
      }
      data-live-dict-area-scene-value-pressed-row-id={
        valueRowInteractionState.pressedRowId ?? undefined
      }
      data-live-dict-area-scene-presentation-mode={presentationMode}
      data-live-dict-area-scene-row-count={summaryLayout.totalRowCount}
      data-live-dict-area-scene-render-backend={renderBackend}
      data-live-dict-area-scene-readable-row-count={
        summaryLayout.readableRowCount
      }
      data-live-dict-area-scene-section-id={sectionId ?? undefined}
      data-live-dict-area-scene-section-name={sectionName ?? undefined}
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
        <article
          className={compactRowPrimitiveLayout.className}
          ref={compactRowPrimitiveRef}
          style={compactRowPrimitiveLayout.style}
        >
          <p className="font-sans text-xs font-semibold">Row</p>
        </article>
        <p className="font-sans text-xs font-semibold" ref={rowTextStyleRef} />
      </div>
      <div
        className="section-w-full"
        ref={hostRef}
        style={{ height: `${summaryLayout.canvasHeight}px` }}
      />
      {sectionId === null
        ? null
        : summaryLayout.blocks.map((block) => (
            <div
              key={`${sectionId}-${block.blockId}`}
              aria-hidden="true"
              className="pointer-events-none absolute opacity-0"
              data-live-dict-area-scene-block-anchor="true"
              data-live-dict-area-scene-block-id={block.blockId}
              data-live-dict-area-scene-block-kind={block.kind}
              data-live-dict-area-scene-block-title={block.title}
              data-live-dict-area-scene-section-id={sectionId}
              style={{
                height: block.height,
                left: block.x,
                top: block.y,
                width: block.width,
              }}
            />
          ))}
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

export function drawLiveDictAreaPixiScene({
  app,
  compactRowPrimitive,
  darkMode,
  edgeRowInteractionState,
  layout,
  origin = { x: 0, y: 0 },
  palette,
  paramColumnWidth,
  presentationMode,
  textResolution,
  textFontFamily,
  textStyleSet,
  valueRowInteractionState,
}: {
  app: Application;
  compactRowPrimitive: LiveDictAreaPixiCompactRowPrimitive;
  darkMode: boolean;
  edgeRowInteractionState: {
    focusedPortId: string | null;
    hoveredPortId: string | null;
    pressedPortId: string | null;
  };
  layout: LiveDictAreaPixiLayout;
  origin?: { x: number; y: number };
  palette: LiveDictAreaPixiPalette;
  paramColumnWidth: number;
  presentationMode: LiveDictAreaPixiPresentationMode;
  textResolution: number;
  textFontFamily: string;
  textStyleSet: LiveDictAreaPixiTextStyleSet;
  valueRowInteractionState: {
    focusedRowId: string | null;
    hoveredRowId: string | null;
    pressedRowId: string | null;
  };
}) {
  for (const child of app.stage.removeChildren()) {
    child.destroy();
  }

  const sceneContainer = new Container();
  sceneContainer.x = origin.x;
  sceneContainer.y = origin.y;

  for (const block of layout.blocks) {
    if (block.kind === "edge-strip") {
      sceneContainer.addChild(
        drawLiveDictAreaEdgeStrip({
          block,
          edgeRowInteractionState,
          palette,
          textResolution,
          textFontFamily,
          textStyleSet,
        }),
      );
      continue;
    }

    sceneContainer.addChild(
      drawLiveDictAreaParamArea({
        block,
        compactRowPrimitive,
        darkMode,
        palette,
        paramColumnWidth,
        presentationMode,
        textResolution,
        textFontFamily,
        textStyleSet,
        valueRowInteractionState,
      }),
    );
  }

  app.stage.addChild(sceneContainer);
}

function drawLiveDictAreaEdgeStrip({
  block,
  edgeRowInteractionState,
  palette,
  textResolution,
  textFontFamily,
  textStyleSet,
}: {
  block: LiveDictAreaPixiEdgeStripLayout;
  edgeRowInteractionState: {
    focusedPortId: string | null;
    hoveredPortId: string | null;
    pressedPortId: string | null;
  };
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
        block,
        edgePortInteractionState:
          port.side === "in"
            ? {
                isFocused: edgeRowInteractionState.focusedPortId === port.id,
                isHovered: edgeRowInteractionState.hoveredPortId === port.id,
                isPressed: edgeRowInteractionState.pressedPortId === port.id,
              }
            : {
                isFocused: false,
                isHovered: false,
                isPressed: false,
              },
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
        block,
        edgePortInteractionState: {
          isFocused: false,
          isHovered: false,
          isPressed: false,
        },
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
  compactRowPrimitive,
  darkMode,
  palette,
  paramColumnWidth,
  presentationMode,
  textResolution,
  textFontFamily,
  textStyleSet,
  valueRowInteractionState,
}: {
  block: LiveDictAreaPixiParamAreaLayout;
  compactRowPrimitive: LiveDictAreaPixiCompactRowPrimitive;
  darkMode: boolean;
  palette: LiveDictAreaPixiPalette;
  paramColumnWidth: number;
  presentationMode: LiveDictAreaPixiPresentationMode;
  textResolution: number;
  textFontFamily: string;
  textStyleSet: LiveDictAreaPixiTextStyleSet;
  valueRowInteractionState: {
    focusedRowId: string | null;
    hoveredRowId: string | null;
    pressedRowId: string | null;
  };
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

  if (presentationMode === "overview") {
    graphics.addChild(
      drawParamAreaOverview({
        block,
        palette,
      }),
    );

    return graphics;
  }

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
        compactRowPrimitive,
        darkMode,
        palette,
        paramColumnWidth,
        row,
        textResolution,
        textFontFamily,
        textStyleSet,
        valueRowInteractionState:
          row.kind === "value"
            ? {
                isFocused: valueRowInteractionState.focusedRowId === row.id,
                isHovered: valueRowInteractionState.hoveredRowId === row.id,
                isPressed: valueRowInteractionState.pressedRowId === row.id,
              }
            : {
                isFocused: false,
                isHovered: false,
                isPressed: false,
              },
      }),
    );
  }

  return graphics;
}

function drawParamAreaOverview({
  block,
  palette,
}: {
  block: LiveDictAreaPixiParamAreaLayout;
  palette: LiveDictAreaPixiPalette;
}) {
  const graphics = new Graphics();
  const summaryRows = getOverviewRows(block.rows);
  if (summaryRows.length === 0) {
    return graphics;
  }

  const bodyInsetX = LIVE_DICT_AREA_PIXI_LAYOUT.rowInsetX;
  const bodyTop = block.y + 8;
  const bodyBottom = block.y + block.height - 8;
  const availableBodyHeight = Math.max(0, bodyBottom - bodyTop);
  const bandGap = summaryRows.length === 1 ? 0 : 8;
  const bandHeight = Math.max(
    12,
    Math.floor(
      (availableBodyHeight - bandGap * (summaryRows.length - 1)) /
        summaryRows.length,
    ),
  );
  const bandWidth =
    block.width - LIVE_DICT_AREA_PIXI_LAYOUT.rowInsetX * 2 - bodyInsetX;

  summaryRows.forEach((row, index) => {
    const y = bodyTop + index * (bandHeight + bandGap);
    graphics.addChild(
      drawOverviewRowBand({
        fill:
          row.kind === "group"
            ? palette.rowBackgroundAlt
            : palette.rowBackground,
        hasValuePreview: row.valueText !== null,
        height: bandHeight,
        palette,
        width: bandWidth,
        x: block.x + bodyInsetX,
        y,
      }),
    );
  });

  return graphics;
}

function drawOverviewRowBand({
  fill,
  hasValuePreview,
  height,
  palette,
  width,
  x,
  y,
}: {
  fill: ColorSource;
  hasValuePreview: boolean;
  height: number;
  palette: LiveDictAreaPixiPalette;
  width: number;
  x: number;
  y: number;
}) {
  const graphics = new Graphics();

  graphics.roundRect(x, y, width, height, 10);
  graphics.fill(fill);

  const insetX = 12;
  const insetY = Math.max(8, Math.floor(height * 0.24));
  const barHeight = Math.max(10, Math.floor(height * 0.22));
  const labelWidth = Math.max(32, Math.floor(width * 0.42));
  const valueWidth = hasValuePreview
    ? Math.max(28, Math.floor(width * 0.2))
    : 0;
  const secondaryBarWidth = Math.max(24, Math.floor(width * 0.28));

  graphics.roundRect(x + insetX, y + insetY, labelWidth, barHeight, 999);
  graphics.fill(palette.bodyText);

  graphics.roundRect(
    x + insetX,
    y + height - insetY - barHeight,
    secondaryBarWidth,
    barHeight,
    999,
  );
  graphics.fill(palette.titleText);

  if (hasValuePreview) {
    graphics.roundRect(
      x + width - insetX - valueWidth,
      y + insetY,
      valueWidth,
      barHeight,
      999,
    );
    graphics.fill(palette.portSelectedDot);
  }

  return graphics;
}

function getOverviewRows(rows: LiveDictAreaPixiRowLayout[]) {
  if (rows.length === 0) {
    return [];
  }

  const targetRowCount = rows.length >= 6 ? 3 : rows.length >= 3 ? 2 : 1;
  const selectedRows: LiveDictAreaPixiRowLayout[] = [];

  for (let index = 0; index < targetRowCount; index += 1) {
    const rowIndex =
      targetRowCount === 1
        ? 0
        : Math.round((index * (rows.length - 1)) / (targetRowCount - 1));
    const nextRow = rows[rowIndex];
    if (!nextRow || selectedRows.includes(nextRow)) {
      continue;
    }
    selectedRows.push(nextRow);
  }

  return selectedRows;
}

function drawParamRow({
  compactRowPrimitive,
  darkMode,
  palette,
  paramColumnWidth,
  row,
  textResolution,
  textFontFamily,
  textStyleSet,
  valueRowInteractionState,
}: {
  compactRowPrimitive: LiveDictAreaPixiCompactRowPrimitive;
  darkMode: boolean;
  palette: LiveDictAreaPixiPalette;
  paramColumnWidth: number;
  row: LiveDictAreaPixiRowLayout;
  textResolution: number;
  textFontFamily: string;
  textStyleSet: LiveDictAreaPixiTextStyleSet;
  valueRowInteractionState: LiveDictAreaPixiDetailRowInteractionState;
}) {
  const rowChrome = getLiveDictAreaPixiDetailRowChrome({
    compactRowPrimitive,
    palette,
    paramColumnWidth,
    rowKind: row.kind,
    rowContentX: row.contentX,
    rowSurfaceX: row.x,
    rowWidth: row.width,
  });
  const valueRowChrome = getLiveDictAreaPixiDetailRowInteractionChrome({
    detailRowChrome: rowChrome,
    interactionState: valueRowInteractionState,
    palette,
  });
  const graphics = new Graphics();

  if (valueRowChrome.fill && rowChrome.rowBackgroundWidth > 0) {
    graphics.roundRect(
      row.x,
      row.y,
      rowChrome.rowBackgroundWidth,
      row.blockHeight,
      rowChrome.cornerRadiusPx,
    );
    graphics.fill(valueRowChrome.fill);
    if (valueRowChrome.stroke) {
      graphics.stroke({
        alpha: 1,
        color: valueRowChrome.stroke,
        width: 1.5,
      });
    }
  }

  const rowRightEdgeX = rowChrome.rowRightEdgeX;
  const valueColumnX = rowChrome.valueColumnX;
  const colorControlStyle = getLiveDictAreaPixiColorControlStyle({
    darkMode,
    editorKind: row.editorKind,
  });
  const switchControlStyle = getLiveDictAreaPixiSwitchControlStyle({
    palette,
    valuePresentationKind: row.valuePresentationKind,
    valueText: row.valueText,
  });
  const comboboxControlStyle =
    row.valuePresentationKind === "combobox"
      ? getLiveDictAreaPixiComboboxControlStyle({
          palette,
        })
      : null;
  const label = buildFittedRowText({
    maxWidth: valueColumnX - rowChrome.labelX - rowChrome.contentInsetPx,
    textResolution,
    style: {
      fill: valueRowChrome.labelFill,
      fontFamily: textFontFamily,
      fontSize: textStyleSet.rowFontSize,
      fontWeight: textStyleSet.rowFontWeight,
    },
    text: row.labelText,
  });

  if (label) {
    label.x = rowChrome.labelX;
    label.y = row.y + 4;
    graphics.addChild(label);
  }

  if (colorControlStyle) {
    drawColorPickerValueControl({
      controlStyle: colorControlStyle,
      graphics,
      row,
      rowRightEdgeX,
      textResolution,
      textFontFamily,
      textStyleSet,
      valueColumnX,
    });
  } else if (switchControlStyle) {
    drawSwitchValueControl({
      controlStyle: switchControlStyle,
      graphics,
      row,
      valueColumnX,
    });
  } else if (comboboxControlStyle) {
    drawComboboxValueControl({
      controlStyle: comboboxControlStyle,
      graphics,
      row,
      rowRightEdgeX,
      textResolution,
      textFontFamily,
      textStyleSet,
      valueColumnX,
    });
  } else if (row.valueText) {
    const valueLabel = buildFittedRowText({
      maxWidth: rowRightEdgeX - valueColumnX,
      textResolution,
      style: {
        fill: valueRowChrome.valueFill,
        fontFamily: textFontFamily,
        fontSize: textStyleSet.edgeRowFontSize,
        fontWeight: textStyleSet.edgeRowFontWeight,
      },
      text: row.valueText,
    });

    if (valueLabel) {
      valueLabel.x = valueColumnX;
      valueLabel.y = row.y + 4;
      graphics.addChild(valueLabel);
    }
  }

  return graphics;
}

function drawColorPickerValueControl({
  controlStyle,
  graphics,
  row,
  rowRightEdgeX,
  textResolution,
  textFontFamily,
  textStyleSet,
  valueColumnX,
}: {
  controlStyle: {
    backgroundFill: string;
    borderFill: string;
    textFill: string;
  };
  graphics: Graphics;
  row: LiveDictAreaPixiRowLayout;
  rowRightEdgeX: number;
  textResolution: number;
  textFontFamily: string;
  textStyleSet: LiveDictAreaPixiTextStyleSet;
  valueColumnX: number;
}) {
  const controlWidth = rowRightEdgeX - valueColumnX;
  if (controlWidth <= 18) {
    return;
  }

  const controlX = valueColumnX;
  const controlY = row.y + 2;
  const controlHeight = Math.max(row.blockHeight - 4, 0);
  const chevron = new Text({
    resolution: textResolution,
    style: {
      fill: controlStyle.textFill,
      fontFamily: textFontFamily,
      fontSize: textStyleSet.edgeRowFontSize,
      fontWeight: textStyleSet.rowFontWeight,
    },
    text: "\u25be",
  });
  const chevronInsetX = 8;
  const label =
    row.valueText && row.valueText.trim().length > 0
      ? buildFittedRowText({
          maxWidth:
            controlWidth -
            chevron.width -
            chevronInsetX * 2 -
            chevronInsetX / 2,
          textResolution,
          style: {
            fill: controlStyle.textFill,
            fontFamily: textFontFamily,
            fontSize: textStyleSet.edgeRowFontSize,
            fontWeight: textStyleSet.rowFontWeight,
          },
          text: row.valueText,
        })
      : null;

  graphics.roundRect(controlX, controlY, controlWidth, controlHeight, 8);
  graphics.fill(controlStyle.backgroundFill);
  graphics.stroke({
    alpha: 1,
    color: controlStyle.borderFill,
    width: 1,
  });

  if (label) {
    label.x = controlX + chevronInsetX;
    label.y = row.y + 4;
    graphics.addChild(label);
  }

  chevron.x = controlX + controlWidth - chevron.width - chevronInsetX;
  chevron.y = row.y + 4;
  graphics.addChild(chevron);
}

function drawComboboxValueControl({
  controlStyle,
  graphics,
  row,
  rowRightEdgeX,
  textResolution,
  textFontFamily,
  textStyleSet,
  valueColumnX,
}: {
  controlStyle: {
    backgroundFill: string;
    borderFill: string;
    textFill: string;
  };
  graphics: Graphics;
  row: LiveDictAreaPixiRowLayout;
  rowRightEdgeX: number;
  textResolution: number;
  textFontFamily: string;
  textStyleSet: LiveDictAreaPixiTextStyleSet;
  valueColumnX: number;
}) {
  const controlWidth = rowRightEdgeX - valueColumnX;
  if (controlWidth <= 18 || !row.valueText) {
    return;
  }

  const controlX = valueColumnX;
  const controlY = row.y + 2;
  const controlHeight = Math.max(row.blockHeight - 4, 0);
  const chevron = new Text({
    resolution: textResolution,
    style: {
      fill: controlStyle.textFill,
      fontFamily: textFontFamily,
      fontSize: textStyleSet.edgeRowFontSize,
      fontWeight: textStyleSet.rowFontWeight,
    },
    text: "\u25be",
  });
  const chevronInsetX = 8;
  const label = buildFittedRowText({
    maxWidth:
      controlWidth - chevron.width - chevronInsetX * 2 - chevronInsetX / 2,
    textResolution,
    style: {
      fill: controlStyle.textFill,
      fontFamily: textFontFamily,
      fontSize: textStyleSet.edgeRowFontSize,
      fontWeight: textStyleSet.rowFontWeight,
    },
    text: row.valueText,
  });

  graphics.roundRect(controlX, controlY, controlWidth, controlHeight, 8);
  graphics.fill(controlStyle.backgroundFill);
  graphics.stroke({
    alpha: 1,
    color: controlStyle.borderFill,
    width: 1,
  });

  if (label) {
    label.x = controlX + chevronInsetX;
    label.y = row.y + 4;
    graphics.addChild(label);
  }

  chevron.x = controlX + controlWidth - chevron.width - chevronInsetX;
  chevron.y = row.y + 4;
  graphics.addChild(chevron);
}

function drawSwitchValueControl({
  controlStyle,
  graphics,
  row,
  valueColumnX,
}: {
  controlStyle: {
    isChecked: boolean;
    thumbFill: string;
    trackCheckedFill: string;
    trackUncheckedFill: string;
  };
  graphics: Graphics;
  row: LiveDictAreaPixiRowLayout;
  valueColumnX: number;
}) {
  const trackWidth = 28;
  const trackHeight = 10;
  const thumbDiameter = 10;
  const trackX = valueColumnX;
  const trackY = row.y + Math.max((row.blockHeight - trackHeight) / 2, 0);
  const thumbX =
    trackX +
    (controlStyle.isChecked ? trackWidth - thumbDiameter : 0) +
    thumbDiameter / 2;
  const thumbY = trackY + trackHeight / 2;

  graphics.roundRect(trackX, trackY, trackWidth, trackHeight, trackHeight / 2);
  graphics.fill(
    controlStyle.isChecked
      ? controlStyle.trackCheckedFill
      : controlStyle.trackUncheckedFill,
  );
  graphics.circle(thumbX, thumbY, thumbDiameter / 2);
  graphics.fill(controlStyle.thumbFill);
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
  block,
  edgePortInteractionState,
  palette,
  port,
  textResolution,
  textFontFamily,
  textStyleSet,
}: {
  block: LiveDictAreaPixiEdgeStripLayout;
  edgePortInteractionState: LiveDictAreaPixiEdgePortInteractionState;
  palette: LiveDictAreaPixiPalette;
  port: LiveDictAreaPixiEdgePortLayout;
  textResolution: number;
  textFontFamily: string;
  textStyleSet: LiveDictAreaPixiTextStyleSet;
}) {
  const graphics = new Graphics();
  const portChrome = getLiveDictAreaPixiEdgePortChrome({
    ...edgePortInteractionState,
    isSelected: port.isSelected,
    palette,
    textStyleSet,
  });

  if (portChrome.rowFill || portChrome.rowStroke) {
    const frame = getLiveDictAreaPixiEdgeRowFrame({
      block,
      port,
    });
    graphics.roundRect(
      frame.x,
      frame.y,
      frame.width,
      frame.height,
      LIVE_DICT_AREA_PIXI_EDGE_ROW_FRAME_RADIUS_PX,
    );
    if (portChrome.rowFill) {
      graphics.fill(portChrome.rowFill);
    }
    if (portChrome.rowStroke) {
      graphics.stroke({
        alpha: 1,
        color: portChrome.rowStroke,
        width: 1.5,
      });
    }
  }

  const dotX = port.align === "left" ? port.x + 4 : port.x - 4;

  graphics.circle(dotX, port.y + 6, 3);
  graphics.fill(portChrome.dotFill);

  const label = new Text({
    resolution: textResolution,
    style: {
      fill: portChrome.labelFill,
      fontFamily: textFontFamily,
      fontSize: textStyleSet.edgeRowFontSize,
      fontWeight: portChrome.labelFontWeight,
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
