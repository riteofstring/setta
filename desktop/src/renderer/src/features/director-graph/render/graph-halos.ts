import { graphLiveEdgeClipY, type GraphFitFrame } from "./graph-visual-language";
import { graphFieldHaloSlots, graphLoadingTargetSlots } from "./graph-shaders";
import { graphNodeStateStride } from "./graph-scene-packer";
import { graphNodeCssDiameter, graphNodeVisualScale } from "./graph-view-state";
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
    const diameter = graphNodeCssDiameter(
      worldY,
      frame.view.cameraWorldY,
      working,
      graphNodeVisualScale(index, frame.view.directorNodeEnd, frame.view.supportingNodeScale),
    );
    halos[count * 3] = packedValueAt(frame.snapshot.nodes.lane, index) * fit.fitX;
    halos[count * 3 + 1] = clipY * fit.fitY;
    halos[count * 3 + 2] = Math.max(0.012, diameter / Math.max(1, cssHeight));
    count += 1;
  }
  halos.fill(0, count * 3);
  return count;
}

/**
 * Finds the newest visible nodes in the Director lane for the loading current.
 *
 * The uniform is deliberately tiny and is filled back-to-front: a resync over
 * a long history should energise the Director activity the user can see now,
 * not spend particles on an off-screen beginning. An empty or off-screen
 * Director still gets the authored live-edge anchor, which is where its first
 * node will arrive.
 */
export function collectGraphLoadingTargets(
  frame: GraphRenderFrame,
  fit: GraphFitFrame,
  targets: Float32Array,
): number {
  if (frame.view.loadingAmount <= 0.001) {
    targets[0] = 0;
    targets[1] = graphLiveEdgeClipY * fit.fitY;
    targets.fill(0, 2);
    return 1;
  }
  let count = 0;
  for (
    let index = frame.view.directorNodeEnd - 1;
    index >= 0 && count < graphLoadingTargetSlots;
    index -= 1
  ) {
    const open = packedValueAt(frame.scene.nodeState, index * graphNodeStateStride + 1);
    if (open < 0.12) {
      continue;
    }
    const worldY = packedValueAt(frame.worldY, index);
    const clipX = packedValueAt(frame.snapshot.nodes.lane, index) * fit.fitX;
    const clipY = (graphLiveEdgeClipY + (frame.view.cameraWorldY - worldY)) * fit.fitY;
    if (Math.abs(clipX) > 1.1 || clipY < -0.92 || clipY > 0.92) {
      continue;
    }
    targets[count * 2] = clipX;
    targets[count * 2 + 1] = clipY;
    count += 1;
  }
  if (count === 0) {
    targets[0] = 0;
    targets[1] = graphLiveEdgeClipY * fit.fitY;
    count = 1;
  }
  targets.fill(0, count * 2);
  return count;
}
