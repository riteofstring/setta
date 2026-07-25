import { describe, expect, it } from "vitest";

import { GraphLadderLayout } from "./graph-ladder-layout";
import { computeGraphLabelPlacements, graphActiveTurn } from "./graph-labels";
import type { GraphLabelPlacement } from "./graph-labels";
import {
  GraphViewController,
  advanceHoverAmount,
  graphNodeAtPointer,
  graphNodeCssDiameter,
  graphNodeScreenPosition,
  graphOutcomeAtPointer,
  type GraphPointerScene,
} from "./graph-view-state";
import { graphFitFrame, graphWarpToScreen } from "./graph-visual-language";
import { packedGraphFixture } from "../packed-graph-fixtures";
import type { PackedGraphSnapshot } from "../packed-graph-snapshot";
import { packedGraphRoleCode, packedValueAt } from "../packed-graph-vocabulary";

const viewport = { width: 1440, height: 900 };
const noPins = new Map<number, boolean>();

function sceneFor(name: Parameters<typeof packedGraphFixture>[0], timeSeconds: number) {
  const snapshot = packedGraphFixture(name);
  const layout = new GraphLadderLayout();
  let frame = layout.advance(snapshot, {
    timeSeconds,
    deltaSeconds: 1 / 120,
    pinnedTurns: noPins,
    reducedMotion: false,
  });
  for (let step = 0; step < 400 && frame.foldAnimating; step += 1) {
    frame = layout.advance(snapshot, {
      timeSeconds,
      deltaSeconds: 1 / 60,
      pinnedTurns: noPins,
      reducedMotion: false,
    });
  }
  const scene: GraphPointerScene = {
    snapshot,
    worldY: frame.worldY,
    open: frame.open,
    cameraWorldY: frame.liveEdgeWorldY,
    timeSeconds,
    viewport,
  };
  return { snapshot, layout, frame, scene };
}

function screenOf(scene: GraphPointerScene, nodeIndex: number) {
  const fit = graphFitFrame(viewport.width, viewport.height);
  const position = graphNodeScreenPosition(
    packedValueAt(scene.snapshot.nodes.lane, nodeIndex),
    packedValueAt(scene.worldY, nodeIndex),
    scene.cameraWorldY,
    fit,
    viewport,
  );
  return graphWarpToScreen(position.x, position.y, viewport.width, viewport.height);
}

function outcomeNodeOf(snapshot: PackedGraphSnapshot, turn: number): number {
  const outcome = packedValueAt(snapshot.turns.outcomeNode, turn);
  expect(outcome).toBeGreaterThanOrEqual(0);
  return outcome;
}

describe("graph pointer projection", () => {
  it("puts the live edge where the shader puts it", () => {
    const { scene, frame } = sceneFor("single-active-turn", 1e6);
    const fit = graphFitFrame(viewport.width, viewport.height);
    const newest = frame.nodeCount - 1;
    const position = graphNodeScreenPosition(
      packedValueAt(scene.snapshot.nodes.lane, newest),
      packedValueAt(scene.worldY, newest),
      scene.cameraWorldY,
      fit,
      viewport,
    );
    // Clip Y of the live edge is -0.35, which sits below centre on screen.
    expect(position.y).toBeGreaterThan(viewport.height / 2);
    expect(position.x).toBeCloseTo(viewport.width / 2, 3);
  });

  it("grows a working node beyond a settled one", () => {
    const fit = graphFitFrame(viewport.width, viewport.height);
    expect(graphNodeCssDiameter(1, 1, true, fit)).toBeGreaterThan(
      graphNodeCssDiameter(1, 1, false, fit),
    );
    expect(graphNodeCssDiameter(0, 4, false, fit)).toBeLessThan(
      graphNodeCssDiameter(4, 4, false, fit),
    );
  });

  it("selects the node under the pointer", () => {
    const { scene, frame } = sceneFor("single-active-turn", 1e6);
    const target = frame.nodeCount - 1;
    expect(graphNodeAtPointer(scene, screenOf(scene, target))).toBe(target);
  });

  it("selects nothing on empty canvas", () => {
    const { scene } = sceneFor("single-active-turn", 1e6);
    expect(graphNodeAtPointer(scene, { x: 5, y: 5 })).toBeNull();
  });

  it("only folds from an outcome node", () => {
    const { snapshot, scene } = sceneFor("approval-and-artifact-arrival", 1e6);
    const outcome = outcomeNodeOf(snapshot, 0);
    expect(graphOutcomeAtPointer(scene, screenOf(scene, outcome))).toBe(outcome);
    const input = packedValueAt(snapshot.turns.inputNode, 0);
    expect(packedValueAt(snapshot.nodes.role, input)).toBe(packedGraphRoleCode.input);
    expect(graphOutcomeAtPointer(scene, { x: 5, y: 5 })).toBeNull();
  });
});

describe("graph view controller", () => {
  it("follows the live edge until the user looks back", () => {
    const view = new GraphViewController();
    view.followLiveEdge(3);
    expect(view.camera()).toBe(3);
    view.lookBack(-500, 3);
    expect(view.isDetached()).toBe(true);
    expect(view.camera()).toBeLessThan(3);
    view.followLiveEdge(4);
    expect(view.camera()).toBeLessThan(3);
  });

  it("reattaches when the view scrolls back to the live edge", () => {
    const view = new GraphViewController();
    view.followLiveEdge(3);
    view.lookBack(-500, 3);
    view.lookBack(5000, 3);
    expect(view.camera()).toBe(3);
    expect(view.isDetached()).toBe(false);
  });

  it("pins a turn to the opposite of what it is doing now", () => {
    const view = new GraphViewController();
    view.toggleTurnPin(2, true);
    expect(view.pins().get(2)).toBe(false);
    view.toggleTurnPin(2, false);
    expect(view.pins().get(2)).toBe(true);
  });

  it("clears hover, selection, camera, and pins on a workstream switch", () => {
    const view = new GraphViewController();
    view.followLiveEdge(2);
    view.setHovered(4);
    view.toggleSelected(4);
    view.toggleTurnPin(0, true);
    view.reset();
    expect(view.camera()).toBe(0);
    expect(view.hovered()).toBeNull();
    expect(view.selected()).toBeNull();
    expect(view.pins().size).toBe(0);
  });

  it("clears the selection when the same node is clicked twice", () => {
    const view = new GraphViewController();
    view.toggleSelected(7);
    expect(view.selected()).toBe(7);
    view.toggleSelected(7);
    expect(view.selected()).toBeNull();
  });

  it("eases the hover flare in and out", () => {
    let amount = advanceHoverAmount(0, true, 1 / 120, 7, false);
    expect(amount).toBeGreaterThan(0);
    expect(amount).toBeLessThan(1);
    for (let step = 0; step < 400; step += 1) {
      amount = advanceHoverAmount(amount, true, 1 / 120, 7, false);
    }
    expect(amount).toBe(1);
    for (let step = 0; step < 400; step += 1) {
      amount = advanceHoverAmount(amount, false, 1 / 120, 7, false);
    }
    expect(amount).toBe(0);
  });

  it("snaps the hover flare under reduced motion", () => {
    expect(advanceHoverAmount(0.25, true, 1 / 120, 7, true)).toBe(1);
    expect(advanceHoverAmount(0.75, false, 1 / 120, 7, true)).toBe(0);
  });
});

describe("graph label placement", () => {
  function placementsFor(
    scene: GraphPointerScene,
    hoveredNode: number | null = null,
  ): { readonly count: number; readonly out: GraphLabelPlacement[] } {
    const out: GraphLabelPlacement[] = [];
    const count = computeGraphLabelPlacements(
      {
        snapshot: scene.snapshot,
        worldY: scene.worldY,
        open: scene.open,
        cameraWorldY: scene.cameraWorldY,
        timeSeconds: scene.timeSeconds,
        viewport,
        hoveredNode,
        visibleFrom: 0,
        visibleTo: scene.snapshot.nodeCount,
        activeTurn: graphActiveTurn(scene.snapshot, scene.timeSeconds),
        reducedMotion: false,
      },
      out,
    );
    return { count, out };
  }

  it("places an outcome pill over a success and below a failure", () => {
    const { snapshot, scene } = sceneFor("failure-recovery-and-cancellation", 1e6);
    const { count, out } = placementsFor(scene);
    const byNode = new Map(
      out.slice(0, count).map((placement) => [placement.nodeIndex, placement]),
    );
    const failedOutcome = outcomeNodeOf(snapshot, 1);
    const succeededOutcome = outcomeNodeOf(snapshot, 2);
    expect(byNode.get(failedOutcome)?.anchor).toBe("below");
    expect(byNode.get(succeededOutcome)?.anchor).toBe("over");
  });

  it("fades a step label as the flow passes it", () => {
    const { scene } = sceneFor("single-active-turn", 1e6);
    const near = placementsFor(scene);
    const nearOpacity = near.out
      .slice(0, near.count)
      .map((placement) => placement.opacity)
      .reduce((total, value) => total + value, 0);
    const detached: GraphPointerScene = { ...scene, cameraWorldY: scene.cameraWorldY + 2 };
    const far = placementsFor(detached);
    const farOpacity = far.out
      .slice(0, far.count)
      .map((placement) => placement.opacity)
      .reduce((total, value) => total + value, 0);
    expect(farOpacity).toBeLessThan(nearOpacity);
  });

  it("restores a hovered label to full opacity", () => {
    const { scene } = sceneFor("single-active-turn", 1e6);
    const stepNode = scene.snapshot.nodeCount - 1;
    const detached: GraphPointerScene = { ...scene, cameraWorldY: scene.cameraWorldY + 0.3 };
    const dimmed = placementsFor(detached);
    const dim = dimmed.out
      .slice(0, dimmed.count)
      .find((placement) => placement.nodeIndex === stepNode)?.opacity;
    const hovered = placementsFor(detached, stepNode);
    const peeked = hovered.out
      .slice(0, hovered.count)
      .find((placement) => placement.nodeIndex === stepNode)?.opacity;
    expect(dim).toBeLessThan(1);
    expect(peeked).toBe(1);
  });

  it("drops compacted rows that carry no label", () => {
    const { snapshot, scene } = sceneFor("compacted-history-boundary", 1e6);
    const { count, out } = placementsFor(scene);
    const placed = new Set(out.slice(0, count).map((placement) => placement.nodeIndex));
    for (let index = 0; index < snapshot.nodeCount; index += 1) {
      if ((snapshot.nodes.labels[index] ?? "").length === 0) {
        expect(placed.has(index)).toBe(false);
      }
    }
  });

  it("names the newest started turn as the one whose question sticks", () => {
    const snapshot = packedGraphFixture("director-and-worker-interleaved");
    expect(graphActiveTurn(snapshot, -1)).toBe(-1);
    expect(graphActiveTurn(snapshot, 1e6)).toBe(snapshot.turnCount - 1);
  });

  it("exposes each pill's fold state for aria-expanded", () => {
    const active = sceneFor("single-active-turn", 1e6);
    const activePlacements = placementsFor(active.scene);
    const input = packedValueAt(active.snapshot.turns.inputNode, 0);
    expect(
      activePlacements.out
        .slice(0, activePlacements.count)
        .find((placement) => placement.nodeIndex === input)?.expanded,
    ).toBe(true);

    const history = sceneFor("failure-recovery-and-cancellation", 1e6);
    const historyPlacements = placementsFor(history.scene);
    const oldOutcome = outcomeNodeOf(history.snapshot, history.snapshot.turnCount - 1);
    expect(
      historyPlacements.out
        .slice(0, historyPlacements.count)
        .find((placement) => placement.nodeIndex === oldOutcome)?.expanded,
    ).toBe(false);
  });
});
