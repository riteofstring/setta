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
    isSelectingParams: boolean;
    listKey: "unpinned";
    requiredParamIdsToPaths: Record<string, string[]>;
    rowCount: number;
    rows: LiveDictAreaUnpinnedParamAreaRendererPacket["rows"];
    selectedParamIds: string[];
    topLevelParamIds: string[];
  };
  maxNestedDepth: number;
  mount: DictAreaBlockFrameMountPacket;
};

export function buildLiveDictAreaUnpinnedParamAreaVisualPacket({
  isSelectingParams,
  rendererPacket,
  selectedParamIds,
}: {
  isSelectingParams: boolean;
  rendererPacket: LiveDictAreaUnpinnedParamAreaRendererPacket;
  selectedParamIds: string[];
}): LiveDictAreaUnpinnedParamAreaVisualPacket {
  return {
    blockId: rendererPacket.blockId,
    container: {
      minHeight: rendererPacket.minHeight,
      shouldApplyMinHeight: rendererPacket.shouldApplyMinHeight,
    },
    kind: "unpinned-param-area",
    list: {
      isSelectingParams,
      listKey: rendererPacket.listKey,
      requiredParamIdsToPaths: rendererPacket.requiredParamIdsToPaths,
      rowCount: rendererPacket.rowCount,
      rows: rendererPacket.rows,
      selectedParamIds,
      topLevelParamIds: rendererPacket.topLevelParamIds,
    },
    maxNestedDepth: rendererPacket.maxNestedDepth,
    mount: rendererPacket.mount,
  };
}
