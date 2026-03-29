import type { DictAreaBlockFrameMountPacket } from "./groupContainerBlockFramePackets";
import type { LiveDictAreaPinnedParamAreaRendererPacket } from "./groupContainerSceneRendererPackets";

export type LiveDictAreaPinnedParamAreaVisualPacket = {
  blockId: "pinned";
  header: {
    icon: "pin";
    title: string;
  };
  kind: "pinned-param-area";
  list: {
    isSelectingParams: boolean;
    listKey: "pinned";
    requiredParamIdsToPaths: Record<string, string[]>;
    rowCount: number;
    rows: LiveDictAreaPinnedParamAreaRendererPacket["rows"];
    selectedParamIds: string[];
    topLevelParamIds: string[];
  };
  maxNestedDepth: number;
  mount: DictAreaBlockFrameMountPacket;
  shouldRoundBottom: boolean;
};

export function buildLiveDictAreaPinnedParamAreaVisualPacket({
  isSelectingParams,
  rendererPacket,
  selectedParamIds,
}: {
  isSelectingParams: boolean;
  rendererPacket: LiveDictAreaPinnedParamAreaRendererPacket;
  selectedParamIds: string[];
}): LiveDictAreaPinnedParamAreaVisualPacket {
  return {
    blockId: rendererPacket.blockId,
    header: {
      icon: "pin",
      title: rendererPacket.title,
    },
    kind: "pinned-param-area",
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
    shouldRoundBottom: rendererPacket.shouldRoundBottom,
  };
}
