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
import {
  buildLiveDictAreaUnpinnedParamAreaRendererBlock,
  type LiveDictAreaUnpinnedParamAreaRendererBlock,
} from "./groupContainerUnpinnedParamAreaRendererBlock";

export type { LiveDictAreaEdgeStripRendererBlock } from "./groupContainerEdgeStripRendererBlock";
export type { LiveDictAreaPinnedParamAreaRendererBlock } from "./groupContainerPinnedParamAreaRendererBlock";
export type { LiveDictAreaUnpinnedParamAreaRendererBlock } from "./groupContainerUnpinnedParamAreaRendererBlock";

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

  return buildLiveDictAreaUnpinnedParamAreaRendererBlock({
    canaryRenderer: block,
    handleColumnResizeStart,
    sectionId,
  });
}
