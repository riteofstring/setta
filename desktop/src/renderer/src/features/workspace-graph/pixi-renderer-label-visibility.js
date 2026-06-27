const labelDeclutterPaddingX = 8;
const labelDeclutterPaddingY = 4;

export function syncNodeLabelVisibility({
  compactSelectedFontSize,
  fontSizeModes,
  nodeLabels,
  nodes,
  normalFontSize,
  selectedNodeIds,
  viewport,
  visibleNodeIds,
  visibilityReasons,
}) {
  if (!(visibleNodeIds instanceof Set)) {
    throw new Error("label visibility requires an index-derived visible-node ID set");
  }
  const mode = labelVisibilityModeForZoom(viewport.scaled);
  if (mode === "all-visible") {
    syncAllVisibleLabelVisibility({
      compactSelectedFontSize,
      fontSizeModes,
      labelVisibilityMode: mode,
      nodeLabels,
      nodes,
      normalFontSize,
      visibleNodeIds,
      visibilityReasons,
    });
    return;
  }

  if (mode === "selected") {
    syncSelectedLabelVisibility({
      compactSelectedFontSize,
      fontSizeModes,
      labelVisibilityMode: mode,
      nodeLabels,
      nodes,
      normalFontSize,
      selectedNodeIds,
      visibleNodeIds,
      visibilityReasons,
    });
    return;
  }

  syncVisiblePriorityLabelVisibility({
    compactSelectedFontSize,
    fontSizeModes,
    labelVisibilityMode: mode,
    nodeLabels,
    nodes,
    normalFontSize,
    selectedNodeIds,
    visibleNodeIds,
    visibilityReasons,
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

function nodeLabelFontSizeModeFor({ labelVisibilityMode, visibilityReason }) {
  return labelVisibilityMode === "selected" && visibilityReason === "selected"
    ? "compact-selected"
    : "normal";
}

function syncAllVisibleLabelVisibility({
  compactSelectedFontSize,
  fontSizeModes,
  labelVisibilityMode,
  nodeLabels,
  nodes,
  normalFontSize,
  visibleNodeIds,
  visibilityReasons,
}) {
  for (const node of nodes) {
    const inViewport = visibleNodeIds.has(node.id);
    setLabelVisibility({
      compactSelectedFontSize,
      fontSizeModes,
      labelVisibilityMode,
      nodeId: node.id,
      nodeLabels,
      normalFontSize,
      reason: inViewport ? "all-visible" : "outside-viewport",
      visibilityReasons,
      visible: inViewport,
    });
  }
}

function syncSelectedLabelVisibility({
  compactSelectedFontSize,
  fontSizeModes,
  labelVisibilityMode,
  nodeLabels,
  nodes,
  normalFontSize,
  selectedNodeIds,
  visibleNodeIds,
  visibilityReasons,
}) {
  for (const node of nodes) {
    const inViewport = visibleNodeIds.has(node.id);
    const selected = selectedNodeIds.has(node.id);
    setLabelVisibility({
      compactSelectedFontSize,
      fontSizeModes,
      labelVisibilityMode,
      nodeId: node.id,
      nodeLabels,
      normalFontSize,
      reason: inViewport ? selectedVisibilityReason(selected) : "outside-viewport",
      visibilityReasons,
      visible: selected && inViewport,
    });
  }
}

function selectedVisibilityReason(selected) {
  return selected ? "selected" : "zoom-hidden";
}

function syncVisiblePriorityLabelVisibility({
  compactSelectedFontSize,
  fontSizeModes,
  labelVisibilityMode,
  nodeLabels,
  nodes,
  normalFontSize,
  selectedNodeIds,
  visibleNodeIds,
  visibilityReasons,
}) {
  const acceptedBoxes = [];
  for (const node of nodes.filter((candidate) => selectedNodeIds.has(candidate.id))) {
    if (!visibleNodeIds.has(node.id)) {
      setLabelVisibility({
        compactSelectedFontSize,
        fontSizeModes,
        labelVisibilityMode,
        nodeId: node.id,
        nodeLabels,
        normalFontSize,
        reason: "outside-viewport",
        visibilityReasons,
        visible: false,
      });
      continue;
    }
    setLabelVisibility({
      compactSelectedFontSize,
      fontSizeModes,
      labelVisibilityMode,
      nodeId: node.id,
      nodeLabels,
      normalFontSize,
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
    if (!visibleNodeIds.has(node.id)) {
      setLabelVisibility({
        compactSelectedFontSize,
        fontSizeModes,
        labelVisibilityMode,
        nodeId: node.id,
        nodeLabels,
        normalFontSize,
        reason: "outside-viewport",
        visibilityReasons,
        visible: false,
      });
      continue;
    }
    const bounds = inflatedLabelScreenBounds(requireNodeLabel(nodeLabels, node.id));
    if (acceptedBoxes.some((accepted) => screenBoundsIntersect(accepted, bounds))) {
      setLabelVisibility({
        compactSelectedFontSize,
        fontSizeModes,
        labelVisibilityMode,
        nodeId: node.id,
        nodeLabels,
        normalFontSize,
        reason: "decluttered",
        visibilityReasons,
        visible: false,
      });
      continue;
    }
    setLabelVisibility({
      compactSelectedFontSize,
      fontSizeModes,
      labelVisibilityMode,
      nodeId: node.id,
      nodeLabels,
      normalFontSize,
      reason: "visible-priority",
      visibilityReasons,
      visible: true,
    });
    acceptedBoxes.push(bounds);
  }
}

function setLabelVisibility({
  compactSelectedFontSize,
  fontSizeModes,
  labelVisibilityMode,
  nodeId,
  nodeLabels,
  normalFontSize,
  reason,
  visibilityReasons,
  visible,
}) {
  const label = requireNodeLabel(nodeLabels, nodeId);
  label.visible = visible;
  visibilityReasons.set(nodeId, reason);
  syncLabelFontSize({
    compactSelectedFontSize,
    fontSizeModes,
    label,
    labelVisibilityMode,
    nodeId,
    normalFontSize,
    visibilityReason: reason,
  });
}

function syncLabelFontSize({
  compactSelectedFontSize,
  fontSizeModes,
  label,
  labelVisibilityMode,
  nodeId,
  normalFontSize,
  visibilityReason,
}) {
  const nextMode = nodeLabelFontSizeModeFor({ labelVisibilityMode, visibilityReason });
  if (fontSizeModes.get(nodeId) === nextMode) {
    return;
  }

  fontSizeModes.set(nodeId, nextMode);
  label.style.fontSize = nextMode === "compact-selected" ? compactSelectedFontSize : normalFontSize;
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
    throw new Error(`workflow graph node label is missing: ${nodeId}`);
  }
  return label;
}
