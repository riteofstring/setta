import { Container, Graphics } from "pixi.js";

import {
  resolveWorkspaceActivityMarkerVisualState,
  workspaceActivityMarkerVisualFingerprint,
} from "./pixi-renderer-visual-state";

const markerRadius = 7;
const markerSpacing = 18;
const recentLaneSpacing = 20;

export function createWorkspaceActivityMarkerManager({ nodes, viewport }) {
  const markerLayer = new Container();
  markerLayer.eventMode = "none";
  markerLayer.interactiveChildren = false;
  viewport.addChild(markerLayer);
  const markerGraphics = new Map();
  return {
    count: () => markerGraphics.size,
    syncPositions: () => syncWorkspaceActivityMarkerGraphicPositions({ markerGraphics, nodes }),
    update: (markers) =>
      updateWorkspaceActivityMarkerGraphics({
        markerGraphics,
        markerLayer,
        markers,
        nodes,
      }),
    visualStatesById: () => workspaceActivityMarkerVisualStatesById(markerGraphics),
  };
}

export function updateWorkspaceActivityMarkerGraphics({
  markerGraphics,
  markerLayer,
  markers,
  nodes,
}) {
  const nextIds = new Set(markers.map((marker) => marker.id));
  let created = 0;
  let removed = 0;
  let retained = 0;
  let updated = 0;
  for (const [markerId, entry] of markerGraphics) {
    if (!nextIds.has(markerId)) {
      entry.graphics.removeFromParent();
      entry.graphics.destroy();
      markerGraphics.delete(markerId);
      removed += 1;
    }
  }
  for (const marker of markers) {
    const fingerprint = activityMarkerVisualFingerprint(marker);
    const existing = markerGraphics.get(marker.id);
    if (!existing) {
      const graphics = new Graphics();
      graphics.eventMode = "none";
      drawWorkspaceActivityMarker(graphics, marker);
      markerLayer.addChild(graphics);
      markerGraphics.set(marker.id, { fingerprint, graphics, marker });
      positionWorkspaceActivityMarker(graphics, marker, nodes);
      created += 1;
      continue;
    }
    existing.marker = marker;
    if (existing.fingerprint === fingerprint) {
      retained += 1;
    } else {
      existing.fingerprint = fingerprint;
      drawWorkspaceActivityMarker(existing.graphics, marker);
      updated += 1;
    }
    positionWorkspaceActivityMarker(existing.graphics, marker, nodes);
  }
  return { created, removed, retained, updated };
}

export function syncWorkspaceActivityMarkerGraphicPositions({ markerGraphics, nodes }) {
  for (const entry of markerGraphics.values()) {
    positionWorkspaceActivityMarker(entry.graphics, entry.marker, nodes);
  }
}

function positionWorkspaceActivityMarker(graphics, marker, nodes) {
  const position = markerPosition(marker, nodes);
  if (position === null) {
    graphics.visible = false;
    return;
  }
  graphics.visible = true;
  graphics.x = position.x;
  graphics.y = position.y;
}

function markerPosition(marker, nodes) {
  if (marker.anchorKind === "workflow_node") {
    const node = nodes.find((candidate) => candidate.id === marker.nodeId);
    if (!node) {
      return null;
    }
    return {
      x: node.x + 14 + marker.slotIndex * markerSpacing,
      y: node.y - 13,
    };
  }
  const bounds = graphBounds(nodes);
  return {
    x: bounds.left - 36,
    y: bounds.top + 12 + marker.laneIndex * recentLaneSpacing,
  };
}

function graphBounds(nodes) {
  if (nodes.length === 0) {
    return { left: 0, top: 0 };
  }
  return {
    left: Math.min(...nodes.map((node) => node.x)),
    top: Math.min(...nodes.map((node) => node.y)),
  };
}

function drawWorkspaceActivityMarker(target, marker) {
  const visualState = resolveWorkspaceActivityMarkerVisualState(marker);
  target.clear();
  const draw = markerDrawers[marker.kind];
  if (!draw) {
    throw new Error(`unknown workspace activity marker kind: ${marker.kind}`);
  }
  draw(target, {
    color: visualState.channels.fill,
    fillAlpha: visualState.channels.fillAlpha,
    strokeAlpha: visualState.channels.strokeAlpha,
    strokeColor: visualState.channels.stroke,
    strokeWidth: visualState.channels.strokeWidth,
  });
}

const markerDrawers = {
  approval: drawApprovalMarker,
  command: drawCommandMarker,
  file_change: drawFileChangeMarker,
  workflow_status: drawWorkflowStatusMarker,
};

function drawApprovalMarker(target, style) {
  target
    .moveTo(0, -markerRadius - 1)
    .lineTo(markerRadius + 1, markerRadius)
    .lineTo(-markerRadius - 1, markerRadius)
    .closePath()
    .fill({ alpha: style.fillAlpha, color: style.color })
    .stroke({ alpha: style.strokeAlpha, color: style.strokeColor, width: style.strokeWidth });
}

function drawCommandMarker(target, style) {
  target
    .roundRect(-markerRadius - 1, -markerRadius, markerRadius * 2 + 2, markerRadius * 2, 3)
    .fill({ alpha: style.fillAlpha, color: style.color })
    .stroke({ alpha: style.strokeAlpha, color: style.strokeColor, width: style.strokeWidth });
}

function drawFileChangeMarker(target, style) {
  target
    .moveTo(0, -markerRadius - 1)
    .lineTo(markerRadius + 1, 0)
    .lineTo(0, markerRadius + 1)
    .lineTo(-markerRadius - 1, 0)
    .closePath()
    .fill({ alpha: style.fillAlpha, color: style.color })
    .stroke({ alpha: style.strokeAlpha, color: style.strokeColor, width: style.strokeWidth });
}

function drawWorkflowStatusMarker(target, style) {
  target
    .circle(0, 0, markerRadius)
    .fill({ alpha: style.fillAlpha, color: style.color })
    .circle(0, 0, markerRadius + 2)
    .stroke({ alpha: style.strokeAlpha, color: style.strokeColor, width: style.strokeWidth });
}

function activityMarkerVisualFingerprint(marker) {
  return workspaceActivityMarkerVisualFingerprint(marker);
}

export function workspaceActivityMarkerVisualStatesById(markerGraphics) {
  return Object.fromEntries(
    [...markerGraphics.values()]
      .map(({ marker }) => [marker.id, resolveWorkspaceActivityMarkerVisualState(marker)])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}
