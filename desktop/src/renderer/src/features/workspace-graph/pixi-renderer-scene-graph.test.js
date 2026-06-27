import { Container, Graphics } from "pixi.js";
import { describe, expect, test } from "vitest";

import {
  createNodeGeometryContextFactory,
  syncNodeBodyGraphic,
} from "./pixi-renderer-node-geometry";
import { createWorkflowGraphSceneGraphUpdater } from "./pixi-renderer-scene-graph";

describe("workflow graph scene graph updater", () => {
  test("updates retained node status visuals without rematerializing the node container", () => {
    const scene = sceneGraphHarness();

    scene.replaceGraph(
      {
        edges: [],
        nodes: [node({ color: 0x14b8a6, status: "running" })],
        workflow: null,
      },
      { countUpdate: false, edgeUpdate: emptyEdgeUpdate() },
    );
    const firstContainer = scene.nodeContainers.get("work");
    const firstBody = scene.nodeBodies.get("work");

    scene.replaceGraph(
      {
        edges: [],
        nodes: [node({ color: 0xf59e0b, status: "waiting_approval" })],
        workflow: null,
      },
      { countUpdate: true, edgeUpdate: emptyEdgeUpdate() },
    );

    expect(scene.nodeContainers.get("work")).toBe(firstContainer);
    expect(scene.nodeBodies.get("work")).toBe(firstBody);
    expect(scene.updateCounts()).toMatchObject({
      graphUpdateNodeAddCount: 0,
      graphUpdateNodeRemoveCount: 0,
      graphUpdateNodeUpdateCount: 1,
    });
    expect(scene.nodeGeometry.counts().body).toBe(2);
  });
});

function sceneGraphHarness() {
  const labels = new Map();
  const nodeActivityMarkers = new Map();
  const nodeBodies = new Map();
  const nodeContainers = new Map();
  const nodeDiagnosticMarkers = new Map();
  const nodeGeometry = createNodeGeometryContextFactory();
  const nodeOutlines = new Map();
  const nodeShadows = new Map();
  const portVisuals = new Map();
  const portVisualStates = new Map();
  const nodes = [];
  const edges = [];
  const updater = createWorkflowGraphSceneGraphUpdater({
    acquireLabel: (nodeId, graphNode) => {
      labels.set(nodeId, { text: graphNode.label });
    },
    createNodeContainer: (graphNode) => {
      const body = new Graphics();
      syncNodeBodyGraphic(body, graphNode, nodeGeometry);
      nodeBodies.set(graphNode.id, body);
      nodeActivityMarkers.set(graphNode.id, new Graphics());
      nodeDiagnosticMarkers.set(graphNode.id, new Graphics());
      nodeOutlines.set(graphNode.id, {});
      nodeShadows.set(graphNode.id, new Graphics());
      return new Container();
    },
    edges,
    nodeActivityMarkers,
    nodeBodies,
    nodeContainers,
    nodeDiagnosticMarkers,
    nodeGeometry,
    nodeLayer: new Container(),
    nodeOutlines,
    nodeShadows,
    nodes,
    portVisuals,
    portVisualStates,
    releaseLabel: (nodeId) => {
      labels.delete(nodeId);
    },
    requireNodeLabel: (nodeId) => labels.get(nodeId),
  });
  return {
    nodeBodies,
    nodeContainers,
    nodeGeometry,
    replaceGraph: updater.replaceGraph,
    updateCounts: updater.updateCounts,
  };
}

function node({ color, status }) {
  return {
    color,
    height: 82,
    id: "work",
    label: "Work",
    status,
    width: 168,
    x: 0,
    y: 0,
  };
}

function emptyEdgeUpdate() {
  return {
    edgeAddCount: 0,
    edgeEndpointUpdateCount: 0,
    edgeOrderUpdateCount: 0,
    edgeRemoveCount: 0,
    edgeRetainCount: 0,
    edgeStyleUpdateCount: 0,
    edgeTopologyUpdateCount: 0,
    edgeUpdateCount: 0,
  };
}
