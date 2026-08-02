import { describe, expect, it } from "vitest";

import { GraphLadderLayout } from "./graph-ladder-layout";
import { computeGraphLabelPlacements, graphActiveTurn } from "./graph-labels";
import type { GraphLabelPlacement } from "./graph-labels";
import {
  GraphBoundedScrollController,
  GraphViewController,
  advanceHoverAmount,
  graphDirectorAnchoredScrollBounds,
  graphDirectorBoundedThreadWorldOffset,
  graphOldestCameraWorldY,
  graphNodeAtPointer,
  graphNodeCssDiameter,
  graphNodeActivation,
  graphNodeScreenPosition,
  graphOverviewScrollOwner,
  graphOutcomeAtPointer,
  type GraphPointerScene,
} from "./graph-view-state";
import {
  graphFitFrame,
  graphLiveEdgeClipY,
  graphNodeHierarchyScale,
  graphWarpToScreen,
} from "./graph-visual-language";

/** The band the node shader discards outside, in fitted clip units. */
const nodeCullClipY = 1.3;
import { packedGraphFixture } from "../packed-graph-fixtures";
import type { PackedGraphSnapshot } from "../packed-graph-snapshot";
import { packedGraphRoleCode, packedValueAt } from "../packed-graph-vocabulary";

const viewport = { width: 1440, height: 900 };
const noPins = new Map<number, boolean>();

describe("Director-bounded supporting thread projection", () => {
  const director = { top: 0, bottom: 4 };
  const camera = { oldestCameraWorldY: 1, liveEdgeWorldY: 4 };
  const thread = { top: 0, bottom: 0.6 };

  function offsetAt(cameraWorldY: number, previousOffsetWorldY: number, bounds = thread): number {
    return graphDirectorBoundedThreadWorldOffset(
      bounds,
      director,
      camera,
      cameraWorldY,
      previousOffsetWorldY,
    );
  }

  it("starts a supporting thread at the Director top from either scroll bound", () => {
    const oldestOffset = offsetAt(camera.oldestCameraWorldY, Number.NaN);
    const liveOffset = offsetAt(camera.liveEdgeWorldY, Number.NaN);
    expect(thread.top + oldestOffset - camera.oldestCameraWorldY).toBe(
      director.top - camera.oldestCameraWorldY,
    );
    expect(thread.top + liveOffset - camera.liveEdgeWorldY).toBe(
      director.top - camera.oldestCameraWorldY,
    );
  });

  it("keeps top alignment before the Director is tall enough to scroll", () => {
    const offset = graphDirectorBoundedThreadWorldOffset(
      { top: 2, bottom: 2.6 },
      { top: 0, bottom: 0.6 },
      { oldestCameraWorldY: 1, liveEdgeWorldY: 0.6 },
      0.6,
      9,
    );

    expect(offset).toBe(-2);
  });

  it("releases from the top, follows the Director, then sticks at the bottom", () => {
    const topSticky = offsetAt(camera.liveEdgeWorldY, Number.NaN);
    const following = offsetAt(3.8, topSticky);
    const bottomSticky = offsetAt(3, following);

    expect(following).toBe(topSticky);
    expect(thread.top + following - 3.8).toBeGreaterThan(director.top - camera.oldestCameraWorldY);
    expect(thread.bottom + bottomSticky - 3).toBe(director.bottom - camera.liveEdgeWorldY);
  });

  it("releases from the bottom, follows the Director, then sticks at the top", () => {
    const bottomSticky = offsetAt(camera.oldestCameraWorldY, director.bottom - thread.bottom);
    const following = offsetAt(1.2, bottomSticky);
    const topSticky = offsetAt(2, following);

    expect(following).toBe(bottomSticky);
    expect(thread.bottom + following - 1.2).toBeLessThan(director.bottom - camera.liveEdgeWorldY);
    expect(thread.top + topSticky - 2).toBe(director.top - camera.oldestCameraWorldY);
  });

  it("keeps a taller side document covering the same Director anchors", () => {
    const tall = { top: 0, bottom: 2 };
    const topSticky = offsetAt(camera.oldestCameraWorldY, Number.NaN, tall);
    const following = offsetAt(2, topSticky, tall);
    const bottomSticky = offsetAt(3, following, tall);

    expect(tall.top + topSticky - camera.oldestCameraWorldY).toBe(
      director.top - camera.oldestCameraWorldY,
    );
    expect(following).toBe(topSticky);
    expect(tall.bottom + bottomSticky - 3).toBe(director.bottom - camera.liveEdgeWorldY);
  });
});

describe("independent supporting-grid scroll", () => {
  it("routes the centre to Director history and either flank to the grid", () => {
    expect(graphOverviewScrollOwner("grid", 720, viewport, 0.8)).toBe("director");
    expect(graphOverviewScrollOwner("grid", 879, viewport, 0.8)).toBe("director");
    expect(graphOverviewScrollOwner("grid", 881, viewport, 0.8)).toBe("supporting-grid");
    expect(graphOverviewScrollOwner("grid", 100, viewport, 0.8)).toBe("supporting-grid");
    expect(graphOverviewScrollOwner("grid", 100, viewport, Number.POSITIVE_INFINITY)).toBe(
      "director",
    );
    expect(graphOverviewScrollOwner("columns", 100, viewport, 0.8)).toBe("director");
  });

  it("derives the grid range from the Director's top and bottom stops", () => {
    const director = { top: 0, bottom: 4 };
    const directorCamera = { oldestCameraWorldY: 1, liveEdgeWorldY: 4 };
    const thread = { top: 2, bottom: 8 };
    const bounds = graphDirectorAnchoredScrollBounds(thread, director, directorCamera);

    expect(bounds).toEqual({ oldestCameraWorldY: 3, liveEdgeWorldY: 8 });
    expect(
      graphDirectorAnchoredScrollBounds({ top: 2, bottom: 2.6 }, director, directorCamera),
    ).toEqual({ oldestCameraWorldY: 3, liveEdgeWorldY: 3 });

    const startOffset = graphDirectorBoundedThreadWorldOffset(
      thread,
      director,
      directorCamera,
      bounds.oldestCameraWorldY,
      0,
    );
    const endOffset = graphDirectorBoundedThreadWorldOffset(
      thread,
      director,
      directorCamera,
      bounds.liveEdgeWorldY,
      startOffset,
    );
    expect(thread.top + startOffset - bounds.oldestCameraWorldY).toBe(
      director.top - directorCamera.oldestCameraWorldY,
    );
    expect(thread.bottom + endOffset - bounds.liveEdgeWorldY).toBe(
      director.bottom - directorCamera.liveEdgeWorldY,
    );
  });

  it("preserves an independent position and follows new work only from its end", () => {
    const scroll = new GraphBoundedScrollController("oldest");
    const bounds = { oldestCameraWorldY: 3, liveEdgeWorldY: 8 };
    scroll.reconcile(bounds);
    expect(scroll.camera()).toBe(3);

    scroll.scroll(1_000, bounds);
    expect(scroll.camera()).toBeGreaterThan(3);
    expect(scroll.camera()).toBeLessThan(8);

    scroll.scroll(100_000, bounds);
    expect(scroll.camera()).toBe(8);
    scroll.reconcile({ oldestCameraWorldY: 3, liveEdgeWorldY: 10 });
    expect(scroll.camera()).toBe(10);

    scroll.scroll(-100, { oldestCameraWorldY: 3, liveEdgeWorldY: 10 });
    const detached = scroll.camera();
    scroll.reconcile({ oldestCameraWorldY: 3, liveEdgeWorldY: 12 });
    expect(scroll.camera()).toBe(detached);
  });

  it("opens an activity grid at its newest row and follows until the user scrolls away", () => {
    const scroll = new GraphBoundedScrollController("live");
    const bounds = { oldestCameraWorldY: 3, liveEdgeWorldY: 8 };

    scroll.reconcile(bounds);
    expect(scroll.camera()).toBe(8);

    scroll.reconcile({ oldestCameraWorldY: 3, liveEdgeWorldY: 10 });
    expect(scroll.camera()).toBe(10);

    scroll.scroll(-1_000, { oldestCameraWorldY: 3, liveEdgeWorldY: 10 });
    const detached = scroll.camera();
    expect(detached).toBeLessThan(10);

    scroll.reconcile({ oldestCameraWorldY: 3, liveEdgeWorldY: 12 });
    expect(scroll.camera()).toBe(detached);
  });
});

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
    placedNodeCount: layout.placedNodeCount(),
    worldY: frame.worldY,
    open: frame.open,
    cameraWorldY: frame.liveEdgeWorldY,
    timeSeconds,
    viewport,
    directorNodeEnd: snapshot.nodeCount,
    supportingNodeScale: graphNodeHierarchyScale.director,
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
  /*
   * The mouse is already over the canvas when new work lands, so a pointer
   * event between a snapshot replacement and the frame that lays it out is the
   * ordinary case rather than a corner. It used to throw out of the event
   * handler and take the render loop with it: the canvas kept its last frame
   * and never drew another, which read as the graph vanishing on a click.
   */
  it("hits nothing while the layout has not placed the snapshot yet", () => {
    const snapshot = packedGraphFixture("single-active-turn");
    const layout = new GraphLadderLayout();
    layout.reset();
    const unplaced: GraphPointerScene = {
      snapshot,
      directorNodeEnd: 0,
      placedNodeCount: Math.min(snapshot.nodeCount, layout.placedNodeCount()),
      supportingNodeScale: 1,
      worldY: layout.worldYColumn(),
      open: layout.openColumn(),
      cameraWorldY: 0,
      timeSeconds: 1e6,
      viewport,
    };

    expect(snapshot.nodeCount).toBeGreaterThan(0);
    expect(unplaced.placedNodeCount).toBe(0);
    expect(graphNodeAtPointer(unplaced, { x: viewport.width / 2, y: viewport.height / 2 })).toBe(
      null,
    );
    expect(graphOutcomeAtPointer(unplaced, { x: viewport.width / 2, y: viewport.height / 2 })).toBe(
      null,
    );
  });

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
    // The live edge clip Y is negative, which sits below centre on screen.
    expect(position.y).toBeGreaterThan(viewport.height / 2);
    expect(position.x).toBeCloseTo(viewport.width / 2, 3);
  });

  it("grows a working node beyond a settled one", () => {
    expect(graphNodeCssDiameter(1, 1, true)).toBeGreaterThan(graphNodeCssDiameter(1, 1, false));
    expect(graphNodeCssDiameter(0, 4, false)).toBeLessThan(graphNodeCssDiameter(4, 4, false));
    expect(graphNodeCssDiameter(1, 1, true, graphNodeHierarchyScale.gridSupporting)).toBeCloseTo(
      graphNodeCssDiameter(1, 1, true) * graphNodeHierarchyScale.gridSupporting,
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

const boundsTo = (liveEdgeWorldY: number, contentTopWorldY = 0) => ({
  oldestCameraWorldY: graphOldestCameraWorldY(
    contentTopWorldY,
    graphFitFrame(viewport.width, viewport.height).fitY,
    "conversation",
  ),
  liveEdgeWorldY,
});

describe("graph view controller", () => {
  it("follows the live edge until the user looks back", () => {
    const view = new GraphViewController();
    view.followLiveEdge(3);
    expect(view.camera()).toBe(3);
    view.lookBack(-500, boundsTo(3));
    expect(view.isDetached()).toBe(true);
    expect(view.camera()).toBeLessThan(3);
    view.followLiveEdge(4);
    expect(view.camera()).toBeLessThan(3);
  });

  it("does not mistake eased follow lag for an intentional look-back", () => {
    const view = new GraphViewController();
    const target = boundsTo(3);

    view.followLiveEdge(0.1);
    view.clampToContent(target);
    expect(view.isDetached()).toBe(false);

    view.followLiveEdge(0.2);
    expect(view.camera()).toBe(0.2);
  });

  it("preserves eased live follow when a short overview has a collapsed range", () => {
    const view = new GraphViewController();
    view.followLiveEdge(0.4);
    view.followLiveEdge(0.407);

    view.clampToContent({ oldestCameraWorldY: 0.84, liveEdgeWorldY: 0.6 });

    expect(view.camera()).toBe(0.407);
    expect(view.isDetached()).toBe(false);
  });

  it("reattaches when the view scrolls back to the live edge", () => {
    const view = new GraphViewController();
    view.followLiveEdge(3);
    view.lookBack(-500, boundsTo(3));
    view.lookBack(5000, boundsTo(3));
    expect(view.camera()).toBe(3);
    expect(view.isDetached()).toBe(false);
  });

  it("stretches visually at a boundary while the semantic camera stays clamped", () => {
    const fit = graphFitFrame(viewport.width, viewport.height);
    const bounds = boundsTo(3);
    const view = new GraphViewController();
    view.followLiveEdge(bounds.liveEdgeWorldY);

    expect(view.lookBack(600, bounds, true)).toBe(true);
    expect(view.camera()).toBe(bounds.liveEdgeWorldY);
    expect(view.elasticOffsetPixels()).toBeGreaterThan(0);
    expect(view.elasticOffsetPixels()).toBeLessThanOrEqual(76);
    expect(view.visualCamera(fit, viewport)).toBeGreaterThan(view.camera());

    let strongestReturn = 0;
    for (let frame = 0; frame < 600 && view.elasticActive(); frame += 1) {
      strongestReturn = Math.max(strongestReturn, view.advanceElastic(1 / 120, false));
    }
    expect(strongestReturn).toBeGreaterThan(0);
    expect(view.elasticActive()).toBe(false);
    expect(view.elasticOffsetPixels()).toBe(0);
    expect(view.visualCamera(fit, viewport)).toBe(view.camera());
  });

  it("removes elastic displacement immediately under reduced motion", () => {
    const view = new GraphViewController();
    const bounds = boundsTo(3);
    view.followLiveEdge(bounds.liveEdgeWorldY);
    view.lookBack(600, bounds, true);

    const returnIntensity = view.advanceElastic(1 / 60, true);

    expect(returnIntensity).toBe(0);
    expect(view.elasticOffsetPixels()).toBe(0);
  });

  /*
   * The camera has to stay inside what is drawn even when nothing moved it:
   * folding, a new column and a replaced snapshot all move the content out from
   * under it, and a camera left pointing above the first fact draws an empty
   * canvas with nothing to say so.
   */
  it("returns a camera left outside the content", () => {
    const view = new GraphViewController();
    view.followLiveEdge(3);
    view.lookBack(-5000, boundsTo(3));
    const scrolledBack = view.camera();
    expect(scrolledBack).toBeLessThan(0);

    view.clampToContent(boundsTo(3, 2));

    expect(view.camera()).toBeGreaterThanOrEqual(
      graphOldestCameraWorldY(
        2,
        graphFitFrame(viewport.width, viewport.height).fitY,
        "conversation",
      ),
    );
    expect(view.camera()).toBeLessThanOrEqual(3);
  });

  /*
   * The bound exists so the first fact is still drawn at it. Asserting the
   * arithmetic would have passed while the node sat below the viewport, which
   * is exactly what a fixed margin did.
   */
  /*
   * A tall, narrow window is where this goes wrong: the fit is smallest there,
   * so the margin is widest and the shader's cull band is furthest from the
   * clip position. 1440x900 has a fit of 1 and hides the whole problem.
   */
  it.each([
    { height: 900, width: 1440 },
    { height: 900, width: 400 },
    { height: 1600, width: 380 },
  ])("keeps the top node drawn at the furthest look-back in $width x $height", (bounds) => {
    const { scene, snapshot } = sceneFor("single-active-turn", 1e6);
    const fit = graphFitFrame(bounds.width, bounds.height);
    let topIndex = 0;
    for (let index = 1; index < snapshot.nodeCount; index += 1) {
      if (packedValueAt(scene.worldY, index) < packedValueAt(scene.worldY, topIndex)) {
        topIndex = index;
      }
    }
    const contentTopWorldY = packedValueAt(scene.worldY, topIndex);
    const view = new GraphViewController();
    view.followLiveEdge(scene.cameraWorldY);
    view.lookBack(-1e6, {
      oldestCameraWorldY: graphOldestCameraWorldY(contentTopWorldY, fit.fitY, "conversation"),
      liveEdgeWorldY: scene.cameraWorldY,
    });

    const position = graphNodeScreenPosition(
      packedValueAt(snapshot.nodes.lane, topIndex),
      contentTopWorldY,
      view.camera(),
      fit,
      bounds,
    );
    expect(position.y).toBeGreaterThanOrEqual(0);
    expect(position.y).toBeLessThanOrEqual(bounds.height);

    // And the shader keeps it: it culls the fitted offset, which is the same
    // space the position above is projected in.
    const culled = Math.abs((graphLiveEdgeClipY + (view.camera() - contentTopWorldY)) * fit.fitY);
    expect(culled).toBeLessThan(nodeCullClipY);
  });

  it("keeps the top node on screen at the furthest look-back", () => {
    const { scene, snapshot } = sceneFor("single-active-turn", 1e6);
    const fit = graphFitFrame(viewport.width, viewport.height);
    let topIndex = 0;
    for (let index = 1; index < snapshot.nodeCount; index += 1) {
      if (packedValueAt(scene.worldY, index) < packedValueAt(scene.worldY, topIndex)) {
        topIndex = index;
      }
    }
    const contentTopWorldY = packedValueAt(scene.worldY, topIndex);
    const view = new GraphViewController();
    view.followLiveEdge(scene.cameraWorldY);
    view.lookBack(-1e6, {
      oldestCameraWorldY: graphOldestCameraWorldY(contentTopWorldY, fit.fitY, "conversation"),
      liveEdgeWorldY: scene.cameraWorldY,
    });

    const position = graphNodeScreenPosition(
      packedValueAt(snapshot.nodes.lane, topIndex),
      contentTopWorldY,
      view.camera(),
      fit,
      viewport,
    );

    expect(position.y).toBeGreaterThanOrEqual(0);
    expect(position.y).toBeLessThanOrEqual(viewport.height);
  });

  it.each(["columns", "grid"] as const)(
    "gives the first %s row the live edge's barrel-warped clearance",
    (presentation) => {
      for (const edgeViewport of [viewport, { width: 912, height: 1221 }]) {
        const fit = graphFitFrame(edgeViewport.width, edgeViewport.height);
        const view = new GraphViewController();
        view.followLiveEdge(4);
        view.lookBack(-1e6, {
          oldestCameraWorldY: graphOldestCameraWorldY(0, fit.fitY, presentation),
          liveEdgeWorldY: 4,
        });

        const topPosition = graphNodeScreenPosition(0, 0, view.camera(), fit, edgeViewport);
        const bottomPosition = graphNodeScreenPosition(0, 4, 4, fit, edgeViewport);
        const top = graphWarpToScreen(
          topPosition.x,
          topPosition.y,
          edgeViewport.width,
          edgeViewport.height,
        );
        const bottom = graphWarpToScreen(
          bottomPosition.x,
          bottomPosition.y,
          edgeViewport.width,
          edgeViewport.height,
        );
        expect(top.y).toBeCloseTo(edgeViewport.height - bottom.y);
      }
    },
  );

  /*
   * A label pill is a real button and takes the click before the canvas sees
   * one, so it drove folding by its own path while the canvas beneath it would
   * have opened a thread. Both routes ask this, so both get one answer.
   */
  it("folds in a conversation and opens a thread everywhere else", () => {
    expect(graphNodeActivation("conversation", 4, "workstream:1")).toEqual({
      kind: "fold",
      nodeIndex: 4,
    });
    expect(graphNodeActivation("columns", 4, "workstream:1")).toEqual({
      kind: "open",
      workstreamId: "workstream:1",
    });
    expect(graphNodeActivation("grid", 4, "workstream:1")).toEqual({
      kind: "open",
      workstreamId: "workstream:1",
    });
    // With nowhere to open, the click still has to do something local rather
    // than fold a view that is not showing turns.
    expect(graphNodeActivation("columns", 4, undefined)).toEqual({ kind: "select", nodeIndex: 4 });
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
        directorNodeEnd: scene.directorNodeEnd,
        supportingNodeScale: scene.supportingNodeScale,
      },
      out,
    );
    return { count, out };
  }

  it("places every outcome pill below its node, success and failure alike", () => {
    const { snapshot, scene } = sceneFor("failure-recovery-and-cancellation", 1e6);
    const { count, out } = placementsFor(scene);
    const byNode = new Map(
      out.slice(0, count).map((placement) => [placement.nodeIndex, placement]),
    );
    const failedOutcome = outcomeNodeOf(snapshot, 1);
    const succeededOutcome = outcomeNodeOf(snapshot, 2);
    expect(byNode.get(failedOutcome)?.anchor).toBe("below");
    expect(byNode.get(succeededOutcome)?.anchor).toBe("below");
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
