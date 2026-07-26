import { graphLiveEdgeClipY, graphNodeGeometry, type GraphFitFrame } from "./graph-visual-language";
import { graphFieldHaloSlots } from "./graph-shaders";
import { graphNodeStateStride } from "./graph-scene-packer";
import { packedValueAt } from "../packed-graph-vocabulary";
import type { GraphRenderFrame } from "./director-graph-renderer";

export function collectGraphHalos(
  frame: GraphRenderFrame,
  fit: GraphFitFrame,
  halos: Float32Array,
  cssHeight: number,
): number {
  let count = 0;
  for (
    let index = frame.nodes.from;
    index < frame.nodes.to && count < graphFieldHaloSlots;
    index += 1
  ) {
    const open = packedValueAt(frame.scene.nodeState, index * graphNodeStateStride + 1);
    if (open < 0.12) {
      continue;
    }
    const worldY = packedValueAt(frame.worldY, index);
    const clipY = graphLiveEdgeClipY + (frame.view.cameraWorldY - worldY);
    if (clipY < -1.35 || clipY > 1.35) {
      continue;
    }
    const working =
      !frame.view.reducedMotion &&
      frame.view.timeSeconds >= packedValueAt(frame.snapshot.nodes.bornAt, index) &&
      frame.view.timeSeconds < packedValueAt(frame.snapshot.nodes.settleAt, index);
    const diameter =
      (graphNodeGeometry.baseDiameter + (working ? graphNodeGeometry.workingBonus : 0)) *
      graphNodeGeometry.cssDiameterScale *
      fit.size;
    halos[count * 3] = packedValueAt(frame.snapshot.nodes.lane, index) * fit.fitX;
    halos[count * 3 + 1] = clipY * fit.fitY;
    halos[count * 3 + 2] = Math.max(0.012, diameter / Math.max(1, cssHeight));
    count += 1;
  }
  halos.fill(0, count * 3);
  return count;
}
