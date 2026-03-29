import type {
  DictAreaNodeLayoutEdgeBlockPacket,
  DictAreaNodeLayoutPacket,
} from "../Section/Layouts/dictAreaNodeLayoutPackets";
import type { LiveDictAreaNodeLayoutParamAreaView } from "./groupContainerNodeLayoutView";

export type DictAreaBlockFrameMountPacket = {
  frameId: string;
  mountKind: "fixed" | "grow";
  orderIndex: number;
  shouldMeasureAsFixed: boolean;
};

export type LiveDictAreaEdgeStripFramePacket =
  DictAreaNodeLayoutEdgeBlockPacket & {
    frame: DictAreaBlockFrameMountPacket;
  };

export type LiveDictAreaParamAreaFramePacket =
  LiveDictAreaNodeLayoutParamAreaView & {
    frame: DictAreaBlockFrameMountPacket;
    kind: "param-area";
  };

export type LiveDictAreaBlockFramePacket =
  | LiveDictAreaEdgeStripFramePacket
  | LiveDictAreaParamAreaFramePacket;

export type LiveDictAreaBlockFramePackets = {
  blockFrames: LiveDictAreaBlockFramePacket[];
  edgeStripFrame: LiveDictAreaEdgeStripFramePacket | null;
  pinnedParamAreaFrame: LiveDictAreaParamAreaFramePacket | null;
  unpinnedParamAreaFrame: LiveDictAreaParamAreaFramePacket | null;
};

export function buildLiveDictAreaBlockFramePackets({
  nodeLayoutPacket,
  paramAreas,
}: {
  nodeLayoutPacket: DictAreaNodeLayoutPacket;
  paramAreas: LiveDictAreaNodeLayoutParamAreaView[];
}): LiveDictAreaBlockFramePackets {
  const paramAreasById = new Map(
    paramAreas.map((paramArea) => [paramArea.id, paramArea]),
  );
  const blockFrames = nodeLayoutPacket.blocks.flatMap((block, orderIndex) => {
    const frame = buildBlockFrameMountPacket({
      blockId: block.id,
      grow: block.grow,
      orderIndex,
    });

    if (block.kind === "edge-strip") {
      return [{ ...block, frame }];
    }

    const paramArea = paramAreasById.get(block.id);
    if (!paramArea) {
      return [];
    }

    return [{ ...paramArea, frame, kind: "param-area" }];
  });

  return {
    blockFrames,
    edgeStripFrame:
      blockFrames.find((blockFrame) => blockFrame.kind === "edge-strip") ??
      null,
    pinnedParamAreaFrame:
      blockFrames.find(
        (blockFrame) =>
          blockFrame.kind === "param-area" && blockFrame.id === "pinned",
      ) ?? null,
    unpinnedParamAreaFrame:
      blockFrames.find(
        (blockFrame) =>
          blockFrame.kind === "param-area" && blockFrame.id === "unpinned",
      ) ?? null,
  };
}

function buildBlockFrameMountPacket({
  blockId,
  grow,
  orderIndex,
}: {
  blockId: string;
  grow: boolean;
  orderIndex: number;
}): DictAreaBlockFrameMountPacket {
  return {
    frameId: `dict-area-block:${blockId}`,
    mountKind: grow ? "grow" : "fixed",
    orderIndex,
    shouldMeasureAsFixed: !grow,
  };
}
