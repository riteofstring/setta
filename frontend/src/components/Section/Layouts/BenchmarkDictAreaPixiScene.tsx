import { Application, Graphics, Text, type ColorSource } from "pixi.js";
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocalStorage } from "state/definitions";
import { useSettingsAllSettingsBenchmark } from "../../Pages/Project/settingsAllSettingsBenchmark";
import {
  BENCHMARK_DICT_AREA_PIXI_LAYOUT,
  buildBenchmarkDictAreaPixiLayout,
  type BenchmarkDictAreaPixiLayout,
  type BenchmarkDictAreaPixiParamAreaLayout,
  type BenchmarkDictAreaPixiRowLayout,
} from "./benchmarkDictAreaPixiLayout";
import type { BenchmarkDictAreaScenePacket } from "./dictAreaScenePackets";

type BenchmarkDictAreaPixiSceneProps = {
  bgColor: string;
  scenePacket: BenchmarkDictAreaScenePacket;
};

type BenchmarkDictAreaPixiPalette = {
  bodyText: ColorSource;
  border: ColorSource;
  dotFill: ColorSource;
  groupTagText: ColorSource;
  mutedText: ColorSource;
  panelBackground: ColorSource;
  panelBackgroundAlt: ColorSource;
  rowBackground: ColorSource;
};

function _BenchmarkDictAreaPixiScene({
  bgColor,
  scenePacket,
}: BenchmarkDictAreaPixiSceneProps) {
  const benchmark = useSettingsAllSettingsBenchmark();
  const darkMode = useLocalStorage((state) => state.darkMode);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const [hostWidth, setHostWidth] = useState(0);

  const layout = useMemo(
    () =>
      buildBenchmarkDictAreaPixiLayout({
        scenePacket,
        width: hostWidth,
      }),
    [hostWidth, scenePacket],
  );

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const updateWidth = () => {
      const nextWidth = Math.floor(host.getBoundingClientRect().width);
      setHostWidth((currentWidth) =>
        currentWidth === nextWidth ? currentWidth : nextWidth,
      );
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(host);

    return () => {
      observer.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || layout.canvasWidth <= 0 || layout.canvasHeight <= 0) {
      return;
    }

    let cancelled = false;

    const renderScene = async () => {
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
        host.replaceChildren(app.canvas);
        appRef.current = app;
      } else {
        app.renderer.resize(layout.canvasWidth, layout.canvasHeight);
        host.replaceChildren(app.canvas);
      }

      app.canvas.style.height = `${layout.canvasHeight}px`;
      app.canvas.style.width = "100%";

      drawBenchmarkDictAreaPixiScene({
        app,
        layout,
        palette: getBenchmarkDictAreaPixiPalette(darkMode),
      });

      app.render();
    };

    void renderScene();

    return () => {
      cancelled = true;
    };
  }, [darkMode, layout]);

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
    <section
      className={`section-row-pin-main relative -mt-3 flex min-h-0 flex-col pt-2 ${bgColor}`}
      data-settings-benchmark-dict-area={benchmark.stage}
      data-settings-benchmark-scene="pixi"
      data-settings-benchmark-scene-row-count={layout.totalRowCount}
    >
      <div
        className="section-w-full"
        ref={hostRef}
        style={{ height: `${layout.canvasHeight}px` }}
      />
    </section>
  );
}

export const BenchmarkDictAreaPixiScene = React.memo(
  _BenchmarkDictAreaPixiScene,
);

function drawBenchmarkDictAreaPixiScene({
  app,
  layout,
  palette,
}: {
  app: Application;
  layout: BenchmarkDictAreaPixiLayout;
  palette: BenchmarkDictAreaPixiPalette;
}) {
  for (const child of app.stage.removeChildren()) {
    child.destroy();
  }

  app.stage.addChild(
    drawBenchmarkPanel({
      height: layout.toolbar.height,
      palette,
      title: layout.toolbar.title,
      width: layout.toolbar.width,
      x: layout.toolbar.x,
      y: layout.toolbar.y,
    }),
  );
  app.stage.addChild(
    drawBenchmarkEdgesSummary({
      layout,
      palette,
    }),
  );

  for (const paramArea of layout.paramAreas) {
    app.stage.addChild(
      drawBenchmarkParamArea({
        palette,
        paramArea,
      }),
    );
  }
}

function drawBenchmarkPanel({
  height,
  palette,
  title,
  width,
  x,
  y,
}: {
  height: number;
  palette: BenchmarkDictAreaPixiPalette;
  title: string;
  width: number;
  x: number;
  y: number;
}) {
  const graphics = drawRoundedPanel({
    fill: palette.panelBackground,
    height,
    stroke: palette.border,
    width,
    x,
    y,
  });
  const titleText = new Text({
    style: {
      fill: palette.mutedText,
      fontFamily: "Inter, sans-serif",
      fontSize: 10,
      fontWeight: "600",
      letterSpacing: 2,
    },
    text: title.toUpperCase(),
  });

  titleText.x = x + BENCHMARK_DICT_AREA_PIXI_LAYOUT.titleInsetX;
  titleText.y = y + 11;

  graphics.addChild(titleText);

  return graphics;
}

function drawBenchmarkEdgesSummary({
  layout,
  palette,
}: {
  layout: BenchmarkDictAreaPixiLayout;
  palette: BenchmarkDictAreaPixiPalette;
}) {
  const graphics = drawRoundedPanel({
    fill: palette.panelBackground,
    height: layout.edgeSummary.height,
    stroke: palette.border,
    width: layout.edgeSummary.width,
    x: layout.edgeSummary.x,
    y: layout.edgeSummary.y,
  });
  const inputText = new Text({
    style: {
      fill: palette.bodyText,
      fontFamily: "Inter, sans-serif",
      fontSize: 11,
      fontWeight: "500",
    },
    text: `Inputs: ${layout.edgeSummary.inputPortCount}`,
  });
  const outputText = new Text({
    style: {
      fill: palette.bodyText,
      fontFamily: "Inter, sans-serif",
      fontSize: 11,
      fontWeight: "500",
    },
    text: `Outputs: ${layout.edgeSummary.outputPortCount}`,
  });

  inputText.x =
    layout.edgeSummary.x + BENCHMARK_DICT_AREA_PIXI_LAYOUT.titleInsetX;
  inputText.y = layout.edgeSummary.y + 10;
  outputText.x =
    layout.edgeSummary.x +
    layout.edgeSummary.width -
    BENCHMARK_DICT_AREA_PIXI_LAYOUT.titleInsetX -
    outputText.width;
  outputText.y = layout.edgeSummary.y + 10;

  graphics.addChild(inputText);
  graphics.addChild(outputText);

  return graphics;
}

function drawBenchmarkParamArea({
  palette,
  paramArea,
}: {
  palette: BenchmarkDictAreaPixiPalette;
  paramArea: BenchmarkDictAreaPixiParamAreaLayout;
}) {
  const graphics = drawRoundedPanel({
    fill: palette.panelBackgroundAlt,
    height: paramArea.height,
    stroke: palette.border,
    width: paramArea.width,
    x: paramArea.x,
    y: paramArea.y,
  });
  const titleText = new Text({
    style: {
      fill: palette.mutedText,
      fontFamily: "Inter, sans-serif",
      fontSize: 10,
      fontWeight: "600",
      letterSpacing: 1.4,
    },
    text: paramArea.title.toUpperCase(),
  });
  const countText = new Text({
    style: {
      fill: palette.mutedText,
      fontFamily: "Inter, sans-serif",
      fontSize: 10,
      fontWeight: "500",
    },
    text: `${paramArea.rowCount} rows`,
  });

  titleText.x = paramArea.x + BENCHMARK_DICT_AREA_PIXI_LAYOUT.titleInsetX;
  titleText.y = paramArea.y + 9;
  countText.x =
    paramArea.x +
    paramArea.width -
    BENCHMARK_DICT_AREA_PIXI_LAYOUT.titleInsetX -
    countText.width;
  countText.y = paramArea.y + 9;

  graphics.addChild(titleText);
  graphics.addChild(countText);

  for (const row of paramArea.rows) {
    graphics.addChild(
      drawBenchmarkParamRow({
        area: paramArea,
        palette,
        row,
      }),
    );
  }

  return graphics;
}

function drawBenchmarkParamRow({
  area,
  palette,
  row,
}: {
  area: BenchmarkDictAreaPixiParamAreaLayout;
  palette: BenchmarkDictAreaPixiPalette;
  row: BenchmarkDictAreaPixiRowLayout;
}) {
  const graphics = new Graphics();
  const blockWidth =
    area.width - row.x - BENCHMARK_DICT_AREA_PIXI_LAYOUT.titleInsetX;

  graphics
    .roundRect(row.x, row.y, blockWidth, row.blockHeight, 4)
    .fill({ alpha: 0.7, color: palette.rowBackground });
  graphics
    .circle(
      row.x + BENCHMARK_DICT_AREA_PIXI_LAYOUT.rowInsetX,
      row.y + row.blockHeight / 2,
      4,
    )
    .fill({ color: palette.dotFill });

  const labelText = new Text({
    style: {
      fill: palette.bodyText,
      fontFamily: "Inter, sans-serif",
      fontSize: 11,
      fontWeight: "500",
    },
    text: row.label,
  });

  labelText.x = row.labelX;
  labelText.y = row.y + 3;
  graphics.addChild(labelText);

  if (row.groupTag) {
    const groupTag = new Text({
      style: {
        fill: palette.groupTagText,
        fontFamily: "Inter, sans-serif",
        fontSize: 9,
        fontWeight: "600",
        letterSpacing: 1.2,
      },
      text: row.groupTag.toUpperCase(),
    });

    groupTag.x =
      area.x +
      area.width -
      BENCHMARK_DICT_AREA_PIXI_LAYOUT.titleInsetX -
      groupTag.width;
    groupTag.y = row.y + 4;
    graphics.addChild(groupTag);
  }

  return graphics;
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

  graphics
    .roundRect(x, y, width, height, BENCHMARK_DICT_AREA_PIXI_LAYOUT.panelRadius)
    .fill({ color: fill })
    .stroke({ color: stroke, width: 1 });

  return graphics;
}

function getBenchmarkDictAreaPixiPalette(
  darkMode: boolean,
): BenchmarkDictAreaPixiPalette {
  if (darkMode) {
    return {
      bodyText: 0xd7dee8,
      border: 0x334155,
      dotFill: 0x64748b,
      groupTagText: 0x94a3b8,
      mutedText: 0x94a3b8,
      panelBackground: 0x111827,
      panelBackgroundAlt: 0x0f172a,
      rowBackground: 0x162031,
    };
  }

  return {
    bodyText: 0x475569,
    border: 0xc5ceda,
    dotFill: 0x94a3b8,
    groupTagText: 0x94a3b8,
    mutedText: 0x64748b,
    panelBackground: 0xf8fafc,
    panelBackgroundAlt: 0xffffff,
    rowBackground: 0xf1f5f9,
  };
}
