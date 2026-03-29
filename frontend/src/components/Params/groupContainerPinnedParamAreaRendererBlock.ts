import type { MouseEventHandler } from "react";
import type { LiveDictAreaPinnedParamAreaCanaryRenderer } from "./groupContainerPinnedParamAreaCanaryRenderer";

export type LiveDictAreaPinnedParamAreaRendererBlock = {
  domPacket: LiveDictAreaPinnedParamAreaCanaryRenderer["domPacket"];
  handleColumnResizeStart: MouseEventHandler<HTMLDivElement>;
  key: LiveDictAreaPinnedParamAreaCanaryRenderer["key"];
  kind: "pinned-param-area";
  sectionId: string;
};

export function buildLiveDictAreaPinnedParamAreaRendererBlock({
  canaryRenderer,
  handleColumnResizeStart,
  sectionId,
}: {
  canaryRenderer: LiveDictAreaPinnedParamAreaCanaryRenderer;
  handleColumnResizeStart: MouseEventHandler<HTMLDivElement>;
  sectionId: string;
}): LiveDictAreaPinnedParamAreaRendererBlock {
  return {
    domPacket: canaryRenderer.domPacket,
    handleColumnResizeStart,
    key: canaryRenderer.key,
    kind: canaryRenderer.kind,
    sectionId,
  };
}
