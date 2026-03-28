import type { DictAreaBlockFrameMountPacket } from "./groupContainerBlockFramePackets";
import type { LiveDictAreaUnpinnedParamAreaRendererPacket } from "./groupContainerSceneRendererPackets";

export type LiveDictAreaUnpinnedParamAreaVisualPacket = {
  blockId: "unpinned";
  container: {
    minHeight: number | null;
    shouldApplyMinHeight: boolean;
  };
  kind: "unpinned-param-area";
  list: {
    listKey: "unpinned";
    requiredParamIdsToPaths: Record<string, string[]>;
    rowCount: number;
    rows: LiveDictAreaUnpinnedParamAreaRendererPacket["rows"];
    topLevelParamIds: string[];
  };
  maxNestedDepth: number;
  mount: DictAreaBlockFrameMountPacket;
};

export function buildLiveDictAreaUnpinnedParamAreaVisualPacket({
  rendererPacket,
}: {
  rendererPacket: LiveDictAreaUnpinnedParamAreaRendererPacket;
}): LiveDictAreaUnpinnedParamAreaVisualPacket {
  return {
    blockId: rendererPacket.blockId,
    container: {
      minHeight: rendererPacket.minHeight,
      shouldApplyMinHeight: rendererPacket.shouldApplyMinHeight,
    },
    kind: "unpinned-param-area",
    list: {
      listKey: rendererPacket.listKey,
      requiredParamIdsToPaths: rendererPacket.requiredParamIdsToPaths,
      rowCount: rendererPacket.rowCount,
      rows: rendererPacket.rows,
      topLevelParamIds: rendererPacket.topLevelParamIds,
    },
    maxNestedDepth: rendererPacket.maxNestedDepth,
    mount: rendererPacket.mount,
  };
}
