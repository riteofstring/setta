import type {
  BenchmarkDictAreaScenePacket,
  BenchmarkDictAreaSceneParamAreaPacket,
  BenchmarkDictAreaSceneParamRowPacket,
} from "./dictAreaScenePackets";

export const BENCHMARK_DICT_AREA_PIXI_LAYOUT = {
  areaGap: 8,
  areaHeaderHeight: 28,
  areaPaddingBottom: 8,
  areaPaddingTop: 4,
  canvasMinWidth: 320,
  edgeSummaryHeight: 36,
  headerHeight: 36,
  panelRadius: 12,
  rowHeight: 22,
  rowIndent: 12,
  rowInsetX: 8,
  rowTopOffset: 4,
  sectionGap: 8,
  sectionInsetX: 0,
  sectionInsetY: 0,
  titleInsetX: 12,
} as const;

export type BenchmarkDictAreaPixiToolbarLayout = {
  height: number;
  title: "Benchmark shell";
  width: number;
  x: number;
  y: number;
};

export type BenchmarkDictAreaPixiEdgeSummaryLayout = {
  height: number;
  inputPortCount: number;
  outputPortCount: number;
  width: number;
  x: number;
  y: number;
};

export type BenchmarkDictAreaPixiRowLayout =
  BenchmarkDictAreaSceneParamRowPacket & {
    blockHeight: number;
    groupTag: "Group" | null;
    height: number;
    labelX: number;
    width: number;
    x: number;
    y: number;
  };

export type BenchmarkDictAreaPixiParamAreaLayout = {
  grow: boolean;
  headerHeight: number;
  height: number;
  id: BenchmarkDictAreaSceneParamAreaPacket["id"];
  rowCount: number;
  rows: BenchmarkDictAreaPixiRowLayout[];
  title: string;
  width: number;
  x: number;
  y: number;
};

export type BenchmarkDictAreaPixiLayout = {
  canvasHeight: number;
  canvasWidth: number;
  edgeSummary: BenchmarkDictAreaPixiEdgeSummaryLayout;
  paramAreas: BenchmarkDictAreaPixiParamAreaLayout[];
  totalRowCount: number;
  toolbar: BenchmarkDictAreaPixiToolbarLayout;
};

export function buildBenchmarkDictAreaPixiLayout({
  scenePacket,
  width,
}: {
  scenePacket: BenchmarkDictAreaScenePacket;
  width: number;
}): BenchmarkDictAreaPixiLayout {
  const canvasWidth = Math.max(
    Math.floor(width),
    BENCHMARK_DICT_AREA_PIXI_LAYOUT.canvasMinWidth,
  );
  const toolbar: BenchmarkDictAreaPixiToolbarLayout = {
    height: BENCHMARK_DICT_AREA_PIXI_LAYOUT.headerHeight,
    title: "Benchmark shell",
    width: canvasWidth - BENCHMARK_DICT_AREA_PIXI_LAYOUT.sectionInsetX * 2,
    x: BENCHMARK_DICT_AREA_PIXI_LAYOUT.sectionInsetX,
    y: BENCHMARK_DICT_AREA_PIXI_LAYOUT.sectionInsetY,
  };
  const edgeSummary: BenchmarkDictAreaPixiEdgeSummaryLayout = {
    height: BENCHMARK_DICT_AREA_PIXI_LAYOUT.edgeSummaryHeight,
    inputPortCount: scenePacket.edgeSummary.inputPortCount,
    outputPortCount: scenePacket.edgeSummary.outputPortCount,
    width: toolbar.width,
    x: toolbar.x,
    y: toolbar.y + toolbar.height + BENCHMARK_DICT_AREA_PIXI_LAYOUT.sectionGap,
  };
  let nextAreaY =
    edgeSummary.y +
    edgeSummary.height +
    BENCHMARK_DICT_AREA_PIXI_LAYOUT.sectionGap;

  const paramAreas = scenePacket.paramAreas.map((paramArea) => {
    const layout = buildBenchmarkDictAreaPixiParamAreaLayout({
      canvasWidth,
      paramArea,
      y: nextAreaY,
    });

    nextAreaY += layout.height + BENCHMARK_DICT_AREA_PIXI_LAYOUT.sectionGap;

    return layout;
  });

  return {
    canvasHeight:
      paramAreas.length === 0
        ? edgeSummary.y + edgeSummary.height
        : nextAreaY - BENCHMARK_DICT_AREA_PIXI_LAYOUT.sectionGap,
    canvasWidth,
    edgeSummary,
    paramAreas,
    totalRowCount: paramAreas.reduce(
      (totalRows, paramArea) => totalRows + paramArea.rowCount,
      0,
    ),
    toolbar,
  };
}

function buildBenchmarkDictAreaPixiParamAreaLayout({
  canvasWidth,
  paramArea,
  y,
}: {
  canvasWidth: number;
  paramArea: BenchmarkDictAreaSceneParamAreaPacket;
  y: number;
}): BenchmarkDictAreaPixiParamAreaLayout {
  const width = canvasWidth - BENCHMARK_DICT_AREA_PIXI_LAYOUT.sectionInsetX * 2;
  const rowsStartY =
    y +
    BENCHMARK_DICT_AREA_PIXI_LAYOUT.areaHeaderHeight +
    BENCHMARK_DICT_AREA_PIXI_LAYOUT.areaPaddingTop;
  const rows = paramArea.rows.map((row, rowIndex) =>
    buildBenchmarkDictAreaPixiRowLayout({
      row,
      rowIndex,
      width,
      y: rowsStartY,
    }),
  );
  const rowsHeight =
    rows.length * BENCHMARK_DICT_AREA_PIXI_LAYOUT.rowHeight +
    BENCHMARK_DICT_AREA_PIXI_LAYOUT.areaPaddingBottom;

  return {
    grow: paramArea.grow,
    headerHeight: BENCHMARK_DICT_AREA_PIXI_LAYOUT.areaHeaderHeight,
    height:
      BENCHMARK_DICT_AREA_PIXI_LAYOUT.areaHeaderHeight +
      BENCHMARK_DICT_AREA_PIXI_LAYOUT.areaPaddingTop +
      rowsHeight,
    id: paramArea.id,
    rowCount: paramArea.rowCount,
    rows,
    title: paramArea.title,
    width,
    x: BENCHMARK_DICT_AREA_PIXI_LAYOUT.sectionInsetX,
    y,
  };
}

function buildBenchmarkDictAreaPixiRowLayout({
  row,
  rowIndex,
  width,
  y,
}: {
  row: BenchmarkDictAreaSceneParamRowPacket;
  rowIndex: number;
  width: number;
  y: number;
}): BenchmarkDictAreaPixiRowLayout {
  const x =
    BENCHMARK_DICT_AREA_PIXI_LAYOUT.titleInsetX +
    row.depth * BENCHMARK_DICT_AREA_PIXI_LAYOUT.rowIndent;

  return {
    ...row,
    blockHeight: BENCHMARK_DICT_AREA_PIXI_LAYOUT.rowHeight - 4,
    groupTag: row.kind === "group" ? "Group" : null,
    height: BENCHMARK_DICT_AREA_PIXI_LAYOUT.rowHeight,
    labelX: x + BENCHMARK_DICT_AREA_PIXI_LAYOUT.rowInsetX * 2,
    width,
    x,
    y:
      y +
      rowIndex * BENCHMARK_DICT_AREA_PIXI_LAYOUT.rowHeight +
      BENCHMARK_DICT_AREA_PIXI_LAYOUT.rowTopOffset,
  };
}
