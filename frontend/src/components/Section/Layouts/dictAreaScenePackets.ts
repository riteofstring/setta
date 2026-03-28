import type { BenchmarkParamRow } from "./dictAreaView";

export type BenchmarkDictAreaSceneParamRowKind = "group" | "value";

export type BenchmarkDictAreaSceneParamRowPacket = {
  depth: number;
  id: string;
  kind: BenchmarkDictAreaSceneParamRowKind;
  label: string;
};

export type BenchmarkDictAreaSceneParamAreaId = "pinned" | "unpinned";

export type BenchmarkDictAreaSceneParamAreaPacket = {
  grow: boolean;
  id: BenchmarkDictAreaSceneParamAreaId;
  rowCount: number;
  rows: BenchmarkDictAreaSceneParamRowPacket[];
  title: string;
};

export type BenchmarkDictAreaScenePacket = {
  edgeSummary: {
    inputPortCount: number;
    outputPortCount: number;
  };
  paramAreas: BenchmarkDictAreaSceneParamAreaPacket[];
};

export function buildBenchmarkDictAreaScenePacket({
  hideUnpinnedParams,
  inputPortCount,
  outputPortCount,
  pinnedRows,
  unpinnedRows,
}: {
  hideUnpinnedParams: boolean;
  inputPortCount: number;
  outputPortCount: number;
  pinnedRows: BenchmarkParamRow[];
  unpinnedRows: BenchmarkParamRow[];
}): BenchmarkDictAreaScenePacket {
  const paramAreas: BenchmarkDictAreaSceneParamAreaPacket[] = [
    buildBenchmarkDictAreaSceneParamAreaPacket({
      grow: false,
      id: "pinned",
      rows: pinnedRows,
      title: "Pinned Params",
    }),
  ];

  if (!hideUnpinnedParams) {
    paramAreas.push(
      buildBenchmarkDictAreaSceneParamAreaPacket({
        grow: true,
        id: "unpinned",
        rows: unpinnedRows,
        title: "Params",
      }),
    );
  }

  return {
    edgeSummary: {
      inputPortCount,
      outputPortCount,
    },
    paramAreas,
  };
}

function buildBenchmarkDictAreaSceneParamAreaPacket({
  grow,
  id,
  rows,
  title,
}: {
  grow: boolean;
  id: BenchmarkDictAreaSceneParamAreaId;
  rows: BenchmarkParamRow[];
  title: string;
}): BenchmarkDictAreaSceneParamAreaPacket {
  return {
    grow,
    id,
    rowCount: rows.length,
    rows: rows.map(buildBenchmarkDictAreaSceneParamRowPacket),
    title,
  };
}

function buildBenchmarkDictAreaSceneParamRowPacket(
  row: BenchmarkParamRow,
): BenchmarkDictAreaSceneParamRowPacket {
  return {
    depth: row.depth,
    id: row.id,
    kind: row.isParent ? "group" : "value",
    label: row.label,
  };
}
