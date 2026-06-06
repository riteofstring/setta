import { nodeBounds, rectanglesIntersect } from "./pixi-workspace-renderer-helpers";

const labelDeclutterPaddingX = 8;
const labelDeclutterPaddingY = 4;

export function syncNodeLabelVisibility({
  nodeLabels,
  nodes,
  selectedNodeIds,
  viewport,
  visibilityReasons,
}) {
  const mode = labelVisibilityModeForZoom(viewport.scaled);
  const worldBounds = viewportWorldBounds(viewport);
  if (mode === "all-visible") {
    for (const node of nodes) {
      const inViewport = nodeIntersectsViewport(node, worldBounds);
      setLabelVisibility({
        nodeId: node.id,
        nodeLabels,
        reason: inViewport ? "all-visible" : "outside-viewport",
        visibilityReasons,
        visible: inViewport,
      });
    }
    return;
  }

  if (mode === "selected") {
    for (const node of nodes) {
      const inViewport = nodeIntersectsViewport(node, worldBounds);
      const selected = selectedNodeIds.has(node.id);
      setLabelVisibility({
        nodeId: node.id,
        nodeLabels,
        reason: inViewport ? (selected ? "selected" : "zoom-hidden") : "outside-viewport",
        visibilityReasons,
        visible: selected && inViewport,
      });
    }
    return;
  }

  syncVisiblePriorityLabelVisibility({
    nodeLabels,
    nodes,
    selectedNodeIds,
    visibilityReasons,
    worldBounds,
  });
}

export function labelVisibilityModeForZoom(zoom) {
  if (zoom < 0.75) {
    return "selected";
  }
  if (zoom < 1.75) {
    return "visible-priority";
  }
  return "all-visible";
}

function syncVisiblePriorityLabelVisibility({
  nodeLabels,
  nodes,
  selectedNodeIds,
  visibilityReasons,
  worldBounds,
}) {
  const acceptedBoxes = [];
  for (const node of nodes.filter((candidate) => selectedNodeIds.has(candidate.id))) {
    if (!nodeIntersectsViewport(node, worldBounds)) {
      setLabelVisibility({
        nodeId: node.id,
        nodeLabels,
        reason: "outside-viewport",
        visibilityReasons,
        visible: false,
      });
      continue;
    }
    setLabelVisibility({
      nodeId: node.id,
      nodeLabels,
      reason: "selected",
      visibilityReasons,
      visible: true,
    });
    acceptedBoxes.push(inflatedLabelScreenBounds(requireNodeLabel(nodeLabels, node.id)));
  }
  for (const node of nodes) {
    if (selectedNodeIds.has(node.id)) {
      continue;
    }
    if (!nodeIntersectsViewport(node, worldBounds)) {
      setLabelVisibility({
        nodeId: node.id,
        nodeLabels,
        reason: "outside-viewport",
        visibilityReasons,
        visible: false,
      });
      continue;
    }
    const bounds = inflatedLabelScreenBounds(requireNodeLabel(nodeLabels, node.id));
    if (acceptedBoxes.some((accepted) => screenBoundsIntersect(accepted, bounds))) {
      setLabelVisibility({
        nodeId: node.id,
        nodeLabels,
        reason: "decluttered",
        visibilityReasons,
        visible: false,
      });
      continue;
    }
    setLabelVisibility({
      nodeId: node.id,
      nodeLabels,
      reason: "visible-priority",
      visibilityReasons,
      visible: true,
    });
    acceptedBoxes.push(bounds);
  }
}

function setLabelVisibility({ nodeId, nodeLabels, reason, visibilityReasons, visible }) {
  const label = requireNodeLabel(nodeLabels, nodeId);
  label.visible = visible;
  visibilityReasons.set(nodeId, reason);
}

function viewportWorldBounds(viewport) {
  const topLeft = viewport.toWorld({ x: 0, y: 0 });
  const bottomRight = viewport.toWorld({
    x: viewport.screenWidth,
    y: viewport.screenHeight,
  });
  const left = Math.min(topLeft.x, bottomRight.x);
  const right = Math.max(topLeft.x, bottomRight.x);
  const top = Math.min(topLeft.y, bottomRight.y);
  const bottom = Math.max(topLeft.y, bottomRight.y);
  return {
    height: bottom - top,
    width: right - left,
    x: left,
    y: top,
  };
}

function nodeIntersectsViewport(node, worldBounds) {
  return rectanglesIntersect(nodeBounds(node), worldBounds);
}

function inflatedLabelScreenBounds(label) {
  const halfWidth = label.width / 2;
  const halfHeight = label.height / 2;
  return {
    bottom: label.y + halfHeight + labelDeclutterPaddingY,
    left: label.x - halfWidth - labelDeclutterPaddingX,
    right: label.x + halfWidth + labelDeclutterPaddingX,
    top: label.y - halfHeight - labelDeclutterPaddingY,
  };
}

function screenBoundsIntersect(left, right) {
  return (
    left.left <= right.right &&
    left.right >= right.left &&
    left.top <= right.bottom &&
    left.bottom >= right.top
  );
}

function requireNodeLabel(nodeLabels, nodeId) {
  const label = nodeLabels.get(nodeId);
  if (!label) {
    throw new Error(`workspace node label is missing: ${nodeId}`);
  }
  return label;
}
