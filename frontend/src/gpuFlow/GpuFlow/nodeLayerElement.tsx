import type { ReactNode } from "react";

import {
  HtmlSurfaceNodeLayer,
  type GpuNodeLayout,
} from "../htmlSurfaces/frame";

export function renderGpuFlowNodeLayerElement({
  nodeClassName,
  nodes,
  onNodeElementChange,
  renderNode,
}: {
  readonly nodeClassName: string | undefined;
  readonly nodes: readonly GpuNodeLayout[] | undefined;
  readonly onNodeElementChange: (
    nodeId: string,
    element: HTMLElement | null,
  ) => void;
  readonly renderNode: ((node: GpuNodeLayout) => ReactNode) | undefined;
}) {
  if (!nodes && !renderNode) {
    return null;
  }
  if (nodes?.length === 0 && !renderNode) {
    return null;
  }
  if (!nodes || !renderNode) {
    throw new Error(
      "Setta GPU flow node rendering requires both nodes and renderNode.",
    );
  }
  return (
    <HtmlSurfaceNodeLayer
      className={nodeClassName}
      nodes={nodes}
      onNodeElementChange={onNodeElementChange}
      renderNode={renderNode}
    />
  );
}
