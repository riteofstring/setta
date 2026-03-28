import type { MouseEventHandler } from "react";
import type { LiveDictAreaUnpinnedParamAreaCanaryRenderer } from "./groupContainerUnpinnedParamAreaCanaryRenderer";

export type LiveDictAreaUnpinnedParamAreaRendererBlock = {
  domPacket: LiveDictAreaUnpinnedParamAreaCanaryRenderer["domPacket"];
  handleColumnResizeStart: MouseEventHandler<HTMLDivElement>;
  key: LiveDictAreaUnpinnedParamAreaCanaryRenderer["key"];
  kind: "unpinned-param-area";
  sectionId: string;
};

export function buildLiveDictAreaUnpinnedParamAreaRendererBlock({
  canaryRenderer,
  handleColumnResizeStart,
  sectionId,
}: {
  canaryRenderer: LiveDictAreaUnpinnedParamAreaCanaryRenderer;
  handleColumnResizeStart: MouseEventHandler<HTMLDivElement>;
  sectionId: string;
}): LiveDictAreaUnpinnedParamAreaRendererBlock {
  return {
    domPacket: canaryRenderer.domPacket,
    handleColumnResizeStart,
    key: canaryRenderer.key,
    kind: canaryRenderer.kind,
    sectionId,
  };
}
