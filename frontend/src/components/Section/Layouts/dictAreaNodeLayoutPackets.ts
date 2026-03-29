import { getEdgeStripEstimatedHeight } from "../../Params/edgeStripUtils";

export type DictAreaNodeLayoutRowPacket = {
  depth: number;
  id: string;
  kind: string;
  label: string | null;
};

export type DictAreaNodeLayoutParamAreaPacket = {
  grow: boolean;
  id: string;
  minHeight?: number | null;
  rowCount: number;
  rows: DictAreaNodeLayoutRowPacket[];
  shouldApplyMinHeight?: boolean;
  title: string;
};

export type DictAreaNodeLayoutEdgeBlockPacket = {
  estimatedHeight: number;
  grow: false;
  id: "edges";
  inputPortCount: number;
  kind: "edge-strip";
  outputPortCount: number;
  portRowCount: number;
  title: "Edges";
};

export type DictAreaNodeLayoutParamAreaBlockPacket = {
  grow: boolean;
  id: string;
  kind: "param-area";
  minHeight: number | null;
  rowCount: number;
  rows: DictAreaNodeLayoutRowPacket[];
  shouldApplyMinHeight: boolean;
  title: string;
};

export type DictAreaNodeLayoutBlockPacket =
  | DictAreaNodeLayoutEdgeBlockPacket
  | DictAreaNodeLayoutParamAreaBlockPacket;

export type DictAreaNodeLayoutPacket = {
  blocks: DictAreaNodeLayoutBlockPacket[];
  fixedBlockIds: string[];
  growBlockIds: string[];
  totalMinHeight: number;
  totalVisibleParamRowCount: number;
};

export function buildDictAreaNodeLayoutPacket({
  inputPortCount,
  outputPortCount,
  paramAreas,
}: {
  inputPortCount: number;
  outputPortCount: number;
  paramAreas: DictAreaNodeLayoutParamAreaPacket[];
}): DictAreaNodeLayoutPacket {
  const blocks: DictAreaNodeLayoutBlockPacket[] = [];
  const edgeBlock = buildEdgeBlock({
    inputPortCount,
    outputPortCount,
  });

  if (edgeBlock) {
    blocks.push(edgeBlock);
  }

  paramAreas.forEach((paramArea) => {
    blocks.push({
      grow: paramArea.grow,
      id: paramArea.id,
      kind: "param-area",
      minHeight: normalizeMinHeight(paramArea.minHeight),
      rowCount: paramArea.rowCount,
      rows: paramArea.rows,
      shouldApplyMinHeight: Boolean(paramArea.shouldApplyMinHeight),
      title: paramArea.title,
    });
  });

  return {
    blocks,
    fixedBlockIds: blocks
      .filter((block) => !block.grow)
      .map((block) => block.id),
    growBlockIds: blocks.filter((block) => block.grow).map((block) => block.id),
    totalMinHeight: blocks.reduce(
      (sum, block) => sum + getBlockMinHeightContribution(block),
      0,
    ),
    totalVisibleParamRowCount: paramAreas.reduce(
      (sum, paramArea) => sum + paramArea.rowCount,
      0,
    ),
  };
}

function buildEdgeBlock({
  inputPortCount,
  outputPortCount,
}: {
  inputPortCount: number;
  outputPortCount: number;
}): DictAreaNodeLayoutEdgeBlockPacket | null {
  const estimatedHeight = getEdgeStripEstimatedHeight(
    inputPortCount,
    outputPortCount,
  );

  if (estimatedHeight <= 0) {
    return null;
  }

  return {
    estimatedHeight,
    grow: false,
    id: "edges",
    inputPortCount,
    kind: "edge-strip",
    outputPortCount,
    portRowCount: Math.max(inputPortCount, outputPortCount),
    title: "Edges",
  };
}

function normalizeMinHeight(
  minHeight: number | null | undefined,
): number | null {
  if (
    typeof minHeight !== "number" ||
    !Number.isFinite(minHeight) ||
    minHeight <= 0
  ) {
    return null;
  }
  return Math.ceil(minHeight);
}

function getBlockMinHeightContribution(
  block: DictAreaNodeLayoutBlockPacket,
): number {
  if (block.kind === "edge-strip") {
    return block.estimatedHeight;
  }

  if (!block.shouldApplyMinHeight || block.minHeight === null) {
    return 0;
  }

  return block.minHeight;
}
