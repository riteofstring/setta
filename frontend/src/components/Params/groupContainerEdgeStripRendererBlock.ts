import type { LiveDictAreaEdgeStripCanaryRenderer } from "./groupContainerEdgeStripCanaryRenderer";

export type LiveDictAreaEdgeStripRendererBlock = {
  domPacket: LiveDictAreaEdgeStripCanaryRenderer["domPacket"];
  key: LiveDictAreaEdgeStripCanaryRenderer["key"];
  kind: "edge-strip";
  sectionId: string;
};

export function buildLiveDictAreaEdgeStripRendererBlock({
  canaryRenderer,
  sectionId,
}: {
  canaryRenderer: LiveDictAreaEdgeStripCanaryRenderer;
  sectionId: string;
}): LiveDictAreaEdgeStripRendererBlock {
  return {
    domPacket: canaryRenderer.domPacket,
    key: canaryRenderer.key,
    kind: canaryRenderer.kind,
    sectionId,
  };
}
