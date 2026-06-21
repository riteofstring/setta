import { portHitRadiusScreen } from "./pixi-renderer-config";
import {
  interactivePortsForNode,
  pointInsideNodeBounds,
  portWorldPosition,
} from "./pixi-renderer-helpers";

export function hitTestWorkflowGraphPortAtScreen({
  excludeNodeId,
  role,
  screen,
  spatialQueries,
  viewport,
}) {
  let bestPort = null;
  let bestDistance = Infinity;
  const candidates = spatialQueries.portHitCandidatesAtScreen(screen, portHitRadiusScreen);
  for (const node of candidates) {
    const port = nearestPortForNode({
      bestDistance,
      excludeNodeId,
      node,
      role,
      screen,
      viewport,
    });
    if (port === null) {
      continue;
    }
    bestDistance = port.distance;
    bestPort = { nodeId: node.id, portId: port.portId };
  }
  return bestPort;
}

export function hitTestWorkflowGraphNodeAtScreen({ screen, spatialQueries }) {
  const { candidates, world } = spatialQueries.nodeHitCandidatesAtScreen(screen);
  let picked = null;
  for (const node of candidates) {
    if (pointInsideNodeBounds(world, node)) {
      picked = node;
    }
  }
  return picked;
}

function nearestPortForNode({ bestDistance, excludeNodeId, node, role, screen, viewport }) {
  if (node.connectable === false || node.id === excludeNodeId) {
    return null;
  }
  let nearest = null;
  for (const port of interactivePortsForNode(node)) {
    if (port.role !== role) {
      continue;
    }
    const distance = portDistanceFromScreenPoint({ node, port, screen, viewport });
    if (distance <= portHitRadiusScreen && distance < bestDistance) {
      nearest = { distance, portId: port.id };
      bestDistance = distance;
    }
  }
  return nearest;
}

function portDistanceFromScreenPoint({ node, port, screen, viewport }) {
  const world = portWorldPosition(node, port.id);
  const portScreen = viewport.toScreen(world.x, world.y);
  return Math.hypot(screen.x - portScreen.x, screen.y - portScreen.y);
}
