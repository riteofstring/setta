import { Container, Graphics } from "pixi.js";

const markerRadius = 7;
const markerSpacing = 18;
const recentLaneSpacing = 20;

const markerColors = {
  approval: 0xf59e0b,
  command: 0x38bdf8,
  file_change: 0x22c55e,
  workflow_status: 0xa78bfa,
};

const statusStrokeColors = {
  answered: 0x22c55e,
  approved: 0x22c55e,
  cancelled: 0x94a3b8,
  completed: 0x22c55e,
  denied: 0xef4444,
  failed: 0xef4444,
  pending: 0xfacc15,
  running: 0x67e8f9,
  unknown: 0x94a3b8,
  waiting_approval: 0xf59e0b,
};

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
  const color = markerColors[marker.kind] ?? markerColors.workflow_status;
  const strokeColor = statusStrokeColors[marker.status] ?? statusStrokeColors.unknown;
  const fillAlpha = marker.active ? 0.96 : 0.72;
  const strokeAlpha = marker.active ? 0.95 : 0.62;
  const strokeWidth = marker.active ? 2.25 : 1.5;
  target.clear();
  const draw = markerDrawers[marker.kind];
  if (!draw) {
    throw new Error(`unknown workspace activity marker kind: ${marker.kind}`);
  }
  draw(target, { color, fillAlpha, strokeAlpha, strokeColor, strokeWidth });
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
  return JSON.stringify({
    active: marker.active,
    anchorKind: marker.anchorKind,
    kind: marker.kind,
    laneIndex: marker.laneIndex,
    nodeId: marker.nodeId,
    slotIndex: marker.slotIndex,
    status: marker.status,
  });
}
