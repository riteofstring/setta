import type { LiveDictAreaPinnedParamAreaRendererBlock } from "./groupContainerLiveDictAreaRenderer";

export type LiveDictAreaPinnedParamAreaSurfaceProps = {
  domPacket: LiveDictAreaPinnedParamAreaRendererBlock["domPacket"];
  handleColumnResizeStart:
    LiveDictAreaPinnedParamAreaRendererBlock["handleColumnResizeStart"];
  sectionId: LiveDictAreaPinnedParamAreaRendererBlock["sectionId"];
};

export type LiveDictAreaPinnedParamAreaSurfaceBlock = {
  key: LiveDictAreaPinnedParamAreaRendererBlock["key"];
  kind: LiveDictAreaPinnedParamAreaRendererBlock["kind"];
  props: LiveDictAreaPinnedParamAreaSurfaceProps;
};

export function buildLiveDictAreaPinnedParamAreaSurfaceBlock({
  rendererBlock,
}: {
  rendererBlock: LiveDictAreaPinnedParamAreaRendererBlock;
}): LiveDictAreaPinnedParamAreaSurfaceBlock {
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
