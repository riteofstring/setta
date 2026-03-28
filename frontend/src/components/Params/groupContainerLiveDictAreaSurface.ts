import {
  buildLiveDictAreaEdgeStripSurfaceBlock,
  type LiveDictAreaEdgeStripSurfaceBlock,
} from "./groupContainerEdgeStripSurfaceBlock";
import {
  buildLiveDictAreaRenderBoundary,
  type LiveDictAreaRenderBoundary,
  type LiveDictAreaRenderBoundaryInput,
} from "./groupContainerLiveDictAreaRenderBoundary";
import {
  buildLiveDictAreaPinnedParamAreaSurfaceBlock,
  type LiveDictAreaPinnedParamAreaSurfaceBlock,
} from "./groupContainerPinnedParamAreaSurfaceBlock";
import {
  buildLiveDictAreaUnpinnedParamAreaSurfaceBlock,
  type LiveDictAreaUnpinnedParamAreaSurfaceBlock,
} from "./groupContainerUnpinnedParamAreaSurfaceBlock";

export type {
  LiveDictAreaEdgeStripSurfaceBlock,
  LiveDictAreaEdgeStripSurfaceProps,
} from "./groupContainerEdgeStripSurfaceBlock";
export type {
  LiveDictAreaPinnedParamAreaSurfaceBlock,
  LiveDictAreaPinnedParamAreaSurfaceProps,
} from "./groupContainerPinnedParamAreaSurfaceBlock";
export type {
  LiveDictAreaUnpinnedParamAreaSurfaceBlock,
  LiveDictAreaUnpinnedParamAreaSurfaceProps,
} from "./groupContainerUnpinnedParamAreaSurfaceBlock";

export type LiveDictAreaSurfaceBlock =
  | LiveDictAreaEdgeStripSurfaceBlock
  | LiveDictAreaPinnedParamAreaSurfaceBlock
  | LiveDictAreaUnpinnedParamAreaSurfaceBlock;

export type LiveDictAreaSurface = Omit<LiveDictAreaRenderBoundary, "blocks"> & {
  blocks: LiveDictAreaSurfaceBlock[];
  liveDictAreaRenderBoundary: LiveDictAreaRenderBoundary;
};

export function buildLiveDictAreaSurfaceFromRenderBoundary({
  liveDictAreaRenderBoundary,
}: {
  liveDictAreaRenderBoundary: LiveDictAreaRenderBoundary;
}): LiveDictAreaSurface {
  return {
    ...liveDictAreaRenderBoundary,
    blocks: liveDictAreaRenderBoundary.blocks.map(
      buildLiveDictAreaSurfaceBlock,
    ),
    liveDictAreaRenderBoundary,
  };
}

export function buildLiveDictAreaSurface(
  input: LiveDictAreaRenderBoundaryInput,
): LiveDictAreaSurface {
  const liveDictAreaRenderBoundary = buildLiveDictAreaRenderBoundary(input);

  return buildLiveDictAreaSurfaceFromRenderBoundary({
    liveDictAreaRenderBoundary,
  });
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
    return buildLiveDictAreaPinnedParamAreaSurfaceBlock({
      rendererBlock: block,
    });
  }

  return buildLiveDictAreaUnpinnedParamAreaSurfaceBlock({
    rendererBlock: block,
  });
}
