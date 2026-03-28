import type { MouseEventHandler } from "react";
import type { LiveDictAreaBoundary } from "./groupContainerLiveDictAreaBoundary";
import type {
  LiveDictAreaEdgeStripDomPacket,
  LiveDictAreaPinnedParamAreaDomPacket,
  LiveDictAreaUnpinnedParamAreaDomPacket,
} from "./groupContainerNodeCanaryPacket";

export type LiveDictAreaEdgeStripRendererBlock = {
  domPacket: LiveDictAreaEdgeStripDomPacket;
  key: string;
  kind: "edge-strip";
  sectionId: string;
};

export type LiveDictAreaPinnedParamAreaRendererBlock = {
  domPacket: LiveDictAreaPinnedParamAreaDomPacket;
  handleColumnResizeStart: MouseEventHandler<HTMLDivElement>;
  key: string;
  kind: "pinned-param-area";
  sectionId: string;
};

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
    return {
      domPacket: block.domPacket,
      key: block.key,
      kind: block.kind,
      sectionId,
    };
  }

  if (block.kind === "pinned-param-area") {
    return {
      domPacket: block.domPacket,
      handleColumnResizeStart,
      key: block.key,
      kind: block.kind,
      sectionId,
    };
  }

  return {
    domPacket: block.domPacket,
    handleColumnResizeStart,
    key: block.key,
    kind: block.kind,
    sectionId,
  };
}
