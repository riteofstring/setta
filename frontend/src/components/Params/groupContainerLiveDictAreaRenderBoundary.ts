import type { MouseEventHandler } from "react";
import {
  buildLiveDictAreaBoundary,
  type LiveDictAreaBoundary,
  type LiveDictAreaBoundaryInput,
} from "./groupContainerLiveDictAreaBoundary";
import {
  buildLiveDictAreaRenderer,
  type LiveDictAreaRenderer,
} from "./groupContainerLiveDictAreaRenderer";

export type LiveDictAreaRenderBoundaryInput = LiveDictAreaBoundaryInput & {
  handleColumnResizeStart: MouseEventHandler<HTMLDivElement>;
  sectionId: string;
};

export type LiveDictAreaRenderBoundary = LiveDictAreaRenderer & {
  liveDictAreaBoundary: LiveDictAreaBoundary;
};

export function buildLiveDictAreaRenderBoundary({
  handleColumnResizeStart,
  sectionId,
  ...liveDictAreaBoundaryInput
}: LiveDictAreaRenderBoundaryInput): LiveDictAreaRenderBoundary {
  const liveDictAreaBoundary = buildLiveDictAreaBoundary(
    liveDictAreaBoundaryInput,
  );
  const liveDictAreaRenderer = buildLiveDictAreaRenderer({
    handleColumnResizeStart,
    liveDictAreaBoundary,
    sectionId,
  });

  return {
    ...liveDictAreaRenderer,
    liveDictAreaBoundary,
  };
}
