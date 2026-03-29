import type { LiveDictAreaEdgeStripRendererBlock } from "./groupContainerEdgeStripRendererBlock";

export type LiveDictAreaEdgeStripSurfaceProps = {
  domPacket: LiveDictAreaEdgeStripRendererBlock["domPacket"];
  sectionId: LiveDictAreaEdgeStripRendererBlock["sectionId"];
};

export type LiveDictAreaEdgeStripSurfaceBlock = {
  key: LiveDictAreaEdgeStripRendererBlock["key"];
  kind: LiveDictAreaEdgeStripRendererBlock["kind"];
  props: LiveDictAreaEdgeStripSurfaceProps;
};

export function buildLiveDictAreaEdgeStripSurfaceBlock({
  rendererBlock,
}: {
  rendererBlock: LiveDictAreaEdgeStripRendererBlock;
}): LiveDictAreaEdgeStripSurfaceBlock {
  return {
    key: rendererBlock.key,
    kind: rendererBlock.kind,
    props: {
      domPacket: rendererBlock.domPacket,
      sectionId: rendererBlock.sectionId,
    },
  };
}
