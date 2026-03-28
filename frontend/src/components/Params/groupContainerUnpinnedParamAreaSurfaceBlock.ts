import type { LiveDictAreaUnpinnedParamAreaRendererBlock } from "./groupContainerLiveDictAreaRenderer";

export type LiveDictAreaUnpinnedParamAreaSurfaceProps = {
  domPacket: LiveDictAreaUnpinnedParamAreaRendererBlock["domPacket"];
  handleColumnResizeStart:
    LiveDictAreaUnpinnedParamAreaRendererBlock["handleColumnResizeStart"];
  sectionId: LiveDictAreaUnpinnedParamAreaRendererBlock["sectionId"];
};

export type LiveDictAreaUnpinnedParamAreaSurfaceBlock = {
  key: LiveDictAreaUnpinnedParamAreaRendererBlock["key"];
  kind: LiveDictAreaUnpinnedParamAreaRendererBlock["kind"];
  props: LiveDictAreaUnpinnedParamAreaSurfaceProps;
};

export function buildLiveDictAreaUnpinnedParamAreaSurfaceBlock({
  rendererBlock,
}: {
  rendererBlock: LiveDictAreaUnpinnedParamAreaRendererBlock;
}): LiveDictAreaUnpinnedParamAreaSurfaceBlock {
  return {
    key: rendererBlock.key,
    kind: rendererBlock.kind,
    props: {
      domPacket: rendererBlock.domPacket,
      handleColumnResizeStart: rendererBlock.handleColumnResizeStart,
      sectionId: rendererBlock.sectionId,
    },
  };
}
