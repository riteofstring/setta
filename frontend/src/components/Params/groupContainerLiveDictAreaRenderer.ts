import type { MouseEventHandler } from "react";
import type { LiveDictAreaBoundary } from "./groupContainerLiveDictAreaBoundary";
import {
  buildLiveDictAreaEdgeStripRendererBlock,
  type LiveDictAreaEdgeStripRendererBlock,
} from "./groupContainerEdgeStripRendererBlock";
import {
  buildLiveDictAreaPinnedParamAreaRendererBlock,
  type LiveDictAreaPinnedParamAreaRendererBlock,
} from "./groupContainerPinnedParamAreaRendererBlock";
import type {
  LiveDictAreaUnpinnedParamAreaDomPacket,
} from "./groupContainerNodeCanaryPacket";

export type { LiveDictAreaEdgeStripRendererBlock } from "./groupContainerEdgeStripRendererBlock";
export type { LiveDictAreaPinnedParamAreaRendererBlock } from "./groupContainerPinnedParamAreaRendererBlock";

export type LiveDictAreaUnpinnedParamAreaRendererBlock = {
  domPacket: LiveDictAreaUnpinnedParamAreaDomPacket;
  handleColumnResizeStart: MouseEventHandler<HTMLDivElement>;
  key: string;
  kind: "unpinned-param-area";
  sectionId: string;
};

export type LiveDictAreaRendererBlock =
  | LiveDictAreaEdgeStripRendererBlock
  | LiveDictAreaPinnedParamAreaRendererBlock
  | LiveDictAreaUnpinnedParamAreaRendererBlock;

export type LiveDictAreaRenderer = Omit<LiveDictAreaBoundary, "blocks"> & {
  blocks: LiveDictAreaRendererBlock[];
};

export function buildLiveDictAreaRenderer({
  handleColumnResizeStart,
  liveDictAreaBoundary,
  sectionId,
}: {
  handleColumnResizeStart: MouseEventHandler<HTMLDivElement>;
  liveDictAreaBoundary: LiveDictAreaBoundary;
  sectionId: string;
}): LiveDictAreaRenderer {
  return {
    ...liveDictAreaBoundary,
    blocks: liveDictAreaBoundary.blocks.map((block) =>
      buildLiveDictAreaRendererBlock({
        block,
        handleColumnResizeStart,
        sectionId,
      }),
    ),
  };
}

function buildLiveDictAreaRendererBlock({
  block,
  handleColumnResizeStart,
  sectionId,
}: {
  block: LiveDictAreaBoundary["blocks"][number];
  handleColumnResizeStart: MouseEventHandler<HTMLDivElement>;
  sectionId: string;
}): LiveDictAreaRendererBlock {
  if (block.kind === "edge-strip") {
    return buildLiveDictAreaEdgeStripRendererBlock({
      canaryRenderer: block,
      sectionId,
    });
  }

  if (block.kind === "pinned-param-area") {
    return buildLiveDictAreaPinnedParamAreaRendererBlock({
      canaryRenderer: block,
      handleColumnResizeStart,
      sectionId,
    });
  }

  return {
    domPacket: block.domPacket,
    handleColumnResizeStart,
    key: block.key,
    kind: block.kind,
    sectionId,
  };
}
