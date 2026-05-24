import type { GpuNodeLayout } from "../htmlSurfaces/frame";
import type { GpuRetainedContentRow } from "../retainedContentSceneTypes";

import { createGpuFlowRetainedContentNativeVisualSignature } from "./flowFrameVisuals";
import type { GpuFlowNodeLayerState } from "./flowLayerState";

export function createGpuFlowRenderedSceneNodeIds({
  layer,
  nodeElementById,
}: {
  readonly layer: GpuFlowNodeLayerState;
  readonly nodeElementById: ReadonlyMap<string, HTMLElement>;
}): readonly string[] {
  return (layer.nodes ?? [])
    .map((node: GpuNodeLayout) => node.nodeId)
    .filter((nodeId) => nodeElementById.has(nodeId));
}

export function createGpuFlowRetainedRuntimeFrameSourceSignature({
  layer,
  nodeElementById,
}: {
  readonly layer: GpuFlowNodeLayerState;
  readonly nodeElementById: ReadonlyMap<string, HTMLElement>;
}): string {
  return JSON.stringify({
    browserVisualSources: createGpuFlowRetainedBrowserVisualSourceSignature(
      layer,
    ),
    mountedSceneNodeIds: createGpuFlowRenderedSceneNodeIds({
      layer,
      nodeElementById,
    }),
    nativeVisuals: createGpuFlowRetainedContentNativeVisualSignature(layer),
  });
}

function createGpuFlowRetainedBrowserVisualSourceSignature(
  layer: GpuFlowNodeLayerState,
) {
  const scene = layer.scene;
  return {
    domControlRows:
      scene?.contentSurfaces.flatMap((surface) => {
        const retainedScene = surface.retainedScene;
        if (!retainedScene) {
          return [];
        }
        const rows = retainedScene.rows.flatMap((row) => {
          const rowSignature =
            createGpuFlowRetainedDomControlRowSourceSignature(row);
          return rowSignature ? [rowSignature] : [];
        });
        if (rows.length === 0) {
          return [];
        }
        return [
          {
            rows,
            surfaceId: surface.id,
          },
        ];
      }) ?? [],
    nativeDomIslands:
      scene?.domIslands.map((island) => ({
        id: island.id,
        kind: island.kind,
        source: island.source,
      })) ?? [],
  };
}

function createGpuFlowRetainedDomControlRowSourceSignature(
  row: GpuRetainedContentRow,
) {
  if (!isGpuFlowRetainedDomControlRowSource(row)) {
    return null;
  }
  return {
    activation: row.state.domControlActivation,
    controlKind: row.control?.kind ?? null,
    nativeControlActive: row.state.nativeControlActive,
    nativeLabelActive: row.state.nativeLabelActive,
    rowId: row.id,
  };
}

function isGpuFlowRetainedDomControlRowSource(
  row: GpuRetainedContentRow,
): boolean {
  return (
    row.state.nativeControlActive ||
    row.state.nativeLabelActive ||
    row.state.domControlActivation !== null
  );
}
