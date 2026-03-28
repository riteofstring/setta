import type { MouseEventHandler } from "react";
import {
  buildLiveDictAreaEdgeStripSurfaceBlock,
  type LiveDictAreaEdgeStripSurfaceBlock,
} from "./groupContainerEdgeStripSurfaceBlock";
import {
  buildLiveDictAreaRenderBoundary,
  type LiveDictAreaRenderBoundary,
  type LiveDictAreaRenderBoundaryInput,
} from "./groupContainerLiveDictAreaRenderBoundary";
import type {
  LiveDictAreaPinnedParamAreaDomPacket,
  LiveDictAreaUnpinnedParamAreaDomPacket,
} from "./groupContainerNodeCanaryPacket";

export type {
  LiveDictAreaEdgeStripSurfaceBlock,
  LiveDictAreaEdgeStripSurfaceProps,
} from "./groupContainerEdgeStripSurfaceBlock";

export type LiveDictAreaPinnedParamAreaSurfaceProps = {
  domPacket: LiveDictAreaPinnedParamAreaDomPacket;
  handleColumnResizeStart: MouseEventHandler<HTMLDivElement>;
  sectionId: string;
};

export type LiveDictAreaUnpinnedParamAreaSurfaceProps = {
  domPacket: LiveDictAreaUnpinnedParamAreaDomPacket;
  handleColumnResizeStart: MouseEventHandler<HTMLDivElement>;
  sectionId: string;
};

export type LiveDictAreaSurfaceBlock =
  | LiveDictAreaEdgeStripSurfaceBlock
  | {
      key: string;
      kind: "pinned-param-area";
      props: LiveDictAreaPinnedParamAreaSurfaceProps;
    }
  | {
      key: string;
      kind: "unpinned-param-area";
      props: LiveDictAreaUnpinnedParamAreaSurfaceProps;
    };

export type LiveDictAreaSurface = Omit<LiveDictAreaRenderBoundary, "blocks"> & {
  blocks: LiveDictAreaSurfaceBlock[];
  liveDictAreaRenderBoundary: LiveDictAreaRenderBoundary;
};

export function buildLiveDictAreaSurface(
  input: LiveDictAreaRenderBoundaryInput,
): LiveDictAreaSurface {
  const liveDictAreaRenderBoundary = buildLiveDictAreaRenderBoundary(input);

  return {
    ...liveDictAreaRenderBoundary,
    blocks: liveDictAreaRenderBoundary.blocks.map(
      buildLiveDictAreaSurfaceBlock,
    ),
    liveDictAreaRenderBoundary,
  };
}

function buildLiveDictAreaSurfaceBlock(
  block: LiveDictAreaRenderBoundary["blocks"][number],
): LiveDictAreaSurfaceBlock {
  if (block.kind === "edge-strip") {
    return buildLiveDictAreaEdgeStripSurfaceBlock({
      rendererBlock: block,
    });
  }

  if (block.kind === "pinned-param-area") {
    return {
      key: block.key,
      kind: block.kind,
      props: {
        domPacket: block.domPacket,
        handleColumnResizeStart: block.handleColumnResizeStart,
        sectionId: block.sectionId,
      },
    };
  }

  return {
    key: block.key,
    kind: block.kind,
    props: {
      domPacket: block.domPacket,
      handleColumnResizeStart: block.handleColumnResizeStart,
      sectionId: block.sectionId,
    },
  };
}
