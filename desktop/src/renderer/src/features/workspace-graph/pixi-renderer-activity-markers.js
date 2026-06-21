import { BitmapText, Container, Graphics } from "pixi.js";

import {
  resolveWorkspaceActivityChipVisualState,
  resolveWorkspaceActivityMarkerVisualState,
  workspaceActivityChipVisualFingerprint,
} from "./pixi-renderer-visual-state";

const workspaceActivityChipLayoutConfig = Object.freeze({
  chipGap: 5,
  chipHeight: 22,
  chipWidth: 156,
  collapsedChipWidth: 58,
  compactChipWidth: 28,
  compactCollapsedChipWidth: 58,
  fontSize: 10,
  labelMaxLength: 24,
  maxVisibleChipsPerNode: 4,
  maxVisibleChipViews: 64,
  nodeGap: 12,
  readableTextZoomThreshold: 0.9,
  topInset: 7,
  viewportPadding: 12,
});

export function createWorkspaceActivityMarkerManager({
  BitmapTextClass = BitmapText,
  loadedNodeLabelFont,
  nodes,
  viewport,
}) {
  const markerLayer = new Container();
  markerLayer.eventMode = "none";
  markerLayer.interactiveChildren = false;
  viewport.addChild(markerLayer);
  const markerGraphics = new Map();
  let currentMarkers = [];
  return {
    chipDebugSnapshot: () => workspaceActivityChipDebugSnapshot(markerGraphics, viewport),
    chipStatesById: () => workspaceActivityChipVisualStatesById(markerGraphics),
    count: () => markerGraphics.size,
    layoutSnapshot: () =>
      workspaceActivityChipLayout({
        markers: currentMarkers,
        nodes,
        viewport,
      }),
    syncPositions: () =>
      syncWorkspaceActivityMarkerGraphicPositions({
        BitmapTextClass,
        loadedNodeLabelFont,
        markerGraphics,
        markerLayer,
        markers: currentMarkers,
        nodes,
        viewport,
      }),
    textObjectCount: () => markerGraphics.size,
    update: (markers) => {
      currentMarkers = [...markers];
      return updateWorkspaceActivityMarkerGraphics({
        BitmapTextClass,
        loadedNodeLabelFont,
        markerGraphics,
        markerLayer,
        markers: currentMarkers,
        nodes,
        viewport,
      });
    },
    visualStatesById: () => workspaceActivityMarkerVisualStatesById(currentMarkers),
  };
}

export function updateWorkspaceActivityMarkerGraphics({
  BitmapTextClass = BitmapText,
  loadedNodeLabelFont = { fontFamily: "Arial" },
  markerGraphics,
  markerLayer,
  markers,
  nodes,
  viewport,
}) {
  return syncWorkspaceActivityMarkerViews({
    BitmapTextClass,
    countMaterialization: true,
    loadedNodeLabelFont,
    markerGraphics,
    markerLayer,
    markers,
    nodes,
    viewport,
  });
}

export function syncWorkspaceActivityMarkerGraphicPositions({
  BitmapTextClass = BitmapText,
  loadedNodeLabelFont = { fontFamily: "Arial" },
  markerGraphics,
  markerLayer,
  markers,
  nodes,
  viewport,
}) {
  return syncWorkspaceActivityMarkerViews({
    BitmapTextClass,
    countMaterialization: false,
    loadedNodeLabelFont,
    markerGraphics,
    markerLayer,
    markers,
    nodes,
    viewport,
  });
}

export function workspaceActivityChipLayout({
  config = workspaceActivityChipLayoutConfig,
  markers,
  nodes,
  viewport,
}) {
  const zoom = activityViewportZoom(viewport);
  const layoutMode = zoom >= config.readableTextZoomThreshold ? "readable" : "compact";
  const nodesById = new Map(nodes.map((node, index) => [node.id, { index, node }]));
  const { markersByNode, missingAnchorCount } = activityMarkersByNode(markers, nodesById);
  const uncappedItems = activityChipItemsForNodeGroups({
    config,
    layoutMode,
    markersByNode,
    nodesById,
  });
  const { globalOverflowCount, items } = cappedActivityChipItems({
    config,
    items: uncappedItems,
    layoutMode,
  });
  return {
    config: {
      maxVisibleChipsPerNode: config.maxVisibleChipsPerNode,
      maxVisibleChipViews: config.maxVisibleChipViews,
      readableTextZoomThreshold: config.readableTextZoomThreshold,
      viewportPadding: config.viewportPadding,
    },
    globalOverflowCount,
    items,
    layoutMode,
    markerCount: markers.length,
    missingAnchorCount,
    zoom,
  };
}

export function workspaceActivityMarkerVisualStatesById(markers) {
  return Object.fromEntries(
    [...markers]
      .map((marker) => [marker.id, resolveWorkspaceActivityMarkerVisualState(marker)])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function workspaceActivityChipVisualStatesById(markerGraphics) {
  return Object.fromEntries(
    [...markerGraphics.entries()]
      .map(([id, entry]) => [id, resolveWorkspaceActivityChipVisualState(entry.chip)])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function workspaceActivityChipDebugSnapshot(markerGraphics, viewport) {
  return [...markerGraphics.entries()]
    .map(([id, entry]) => {
      const chip = entry.chip;
      const screenBounds = activityChipViewScreenBounds(entry, viewport);
      return {
        activityId: chip.type === "marker" ? chip.marker.activityId : "",
        anchorKind: "workflow_node",
        fullLabel: chip.type === "marker" ? chip.marker.label : chip.label,
        height: workspaceActivityChipLayoutConfig.chipHeight,
        hiddenCount: chip.hiddenCount,
        id,
        kind: chip.type === "marker" ? chip.marker.kind : "collapsed",
        label: chip.label,
        layoutMode: chip.layoutMode,
        markerId: chip.type === "marker" ? chip.marker.id : "",
        nodeId: chip.nodeId,
        placement: entry.placement?.side ?? "right",
        rank: chip.rank,
        screenBottom: screenBounds.bottom,
        screenBounds,
        screenLeft: screenBounds.left,
        screenRight: screenBounds.right,
        screenTop: screenBounds.top,
        screenX: screenBounds.left,
        screenY: screenBounds.top,
        sourceMarkerIds: chip.markers.map((marker) => marker.id),
        status: chip.type === "marker" ? chip.marker.status : "collapsed",
        textVisible: entry.label.visible,
        type: chip.type,
        visible: entry.container.visible,
        visualState: resolveWorkspaceActivityChipVisualState(chip),
        width: chipWidth(chip),
        x: entry.container.x,
        y: entry.container.y,
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function syncWorkspaceActivityMarkerViews({
  BitmapTextClass,
  countMaterialization,
  loadedNodeLabelFont,
  markerGraphics,
  markerLayer,
  markers,
  nodes,
  viewport,
}) {
  const layout = workspaceActivityChipLayout({ markers, nodes, viewport });
  const counts = { created: 0, removed: 0, retained: 0, updated: 0 };
  releaseStaleActivityChipViews({
    countMaterialization,
    counts,
    markerGraphics,
    nextIds: new Set(layout.items.map((item) => item.id)),
  });
  for (const chip of layout.items) {
    syncWorkspaceActivityChipView({
      BitmapTextClass,
      chip,
      countMaterialization,
      counts,
      loadedNodeLabelFont,
      markerGraphics,
      markerLayer,
      nodes,
      viewport,
    });
  }

  return counts;
}

function activityMarkersByNode(markers, nodesById) {
  const markersByNode = new Map();
  let missingAnchorCount = 0;
  for (const marker of markers) {
    if (marker.anchorKind !== "workflow_node" || !nodesById.has(marker.nodeId)) {
      missingAnchorCount += 1;
      continue;
    }
    markersByNode.set(marker.nodeId, [...(markersByNode.get(marker.nodeId) ?? []), marker]);
  }
  return { markersByNode, missingAnchorCount };
}

function activityChipItemsForNodeGroups({ config, layoutMode, markersByNode, nodesById }) {
  return [...markersByNode.entries()]
    .sort((left, right) => compareNodeGroups(left, right, nodesById))
    .flatMap(([nodeId, nodeMarkers]) =>
      activityChipItemsForNode(nodeId, nodeMarkers, { config, layoutMode }),
    );
}

function activityChipItemsForNode(nodeId, nodeMarkers, { config, layoutMode }) {
  const sortedMarkers = [...nodeMarkers].sort(compareActivityChipMarkers);
  const visibleMarkers = visibleActivityChipMarkers(sortedMarkers, config.maxVisibleChipsPerNode);
  const markerItems = visibleMarkers.map((marker, rank) =>
    markerChipDisplayItem(marker, { config, layoutMode, rank }),
  );
  const visibleMarkerIds = new Set(visibleMarkers.map((marker) => marker.id));
  const hiddenMarkers = sortedMarkers.filter((marker) => !visibleMarkerIds.has(marker.id));
  return hiddenMarkers.length === 0
    ? markerItems
    : [
        ...markerItems,
        collapsedChipDisplayItem(nodeId, hiddenMarkers, {
          layoutMode,
          rank: visibleMarkers.length,
        }),
      ];
}

function cappedActivityChipItems({ config, items, layoutMode }) {
  if (items.length <= config.maxVisibleChipViews) {
    return { globalOverflowCount: 0, items };
  }
  const visibleItemLimit = Math.max(0, config.maxVisibleChipViews - 1);
  const visibleItems = items.slice(0, visibleItemLimit);
  const hiddenMarkers = items.slice(visibleItemLimit).flatMap((item) => item.markers);
  if (visibleItems.length === 0 || hiddenMarkers.length === 0) {
    return { globalOverflowCount: hiddenMarkers.length, items: visibleItems };
  }
  const nodeId = visibleItems.at(-1).nodeId;
  return {
    globalOverflowCount: hiddenMarkers.length,
    items: [
      ...visibleItems,
      collapsedChipDisplayItem(nodeId, hiddenMarkers, {
        id: `workspace-activity:collapsed:global:${nodeId}`,
        layoutMode,
        rank: nextActivityChipRank(visibleItems, nodeId),
      }),
    ],
  };
}

function releaseStaleActivityChipViews({ countMaterialization, counts, markerGraphics, nextIds }) {
  for (const [id, entry] of [...markerGraphics.entries()]) {
    if (nextIds.has(id)) {
      continue;
    }
    entry.container.removeFromParent();
    entry.container.destroy({ children: true });
    markerGraphics.delete(id);
    incrementMaterializationCount(counts, countMaterialization, "removed");
  }
}

function syncWorkspaceActivityChipView({
  BitmapTextClass,
  chip,
  countMaterialization,
  counts,
  loadedNodeLabelFont,
  markerGraphics,
  markerLayer,
  nodes,
  viewport,
}) {
  const fingerprint = workspaceActivityChipVisualFingerprint(chip);
  const existing = markerGraphics.get(chip.id);
  if (!existing) {
    const view = createWorkspaceActivityChipView({ BitmapTextClass, loadedNodeLabelFont });
    view.chip = chip;
    view.fingerprint = fingerprint;
    drawWorkspaceActivityChip(view, chip);
    markerLayer.addChild(view.container);
    markerGraphics.set(chip.id, view);
    positionWorkspaceActivityChip(view, chip, nodes, viewport);
    incrementMaterializationCount(counts, countMaterialization, "created");
    return;
  }

  existing.chip = chip;
  if (existing.fingerprint === fingerprint) {
    incrementMaterializationCount(counts, countMaterialization, "retained");
  } else {
    existing.fingerprint = fingerprint;
    drawWorkspaceActivityChip(existing, chip);
    incrementMaterializationCount(counts, countMaterialization, "updated");
  }
  positionWorkspaceActivityChip(existing, chip, nodes, viewport);
}

function incrementMaterializationCount(counts, countMaterialization, key) {
  if (countMaterialization) {
    counts[key] += 1;
  }
}

function createWorkspaceActivityChipView({ BitmapTextClass, loadedNodeLabelFont }) {
  const container = new Container();
  container.eventMode = "none";
  container.interactiveChildren = false;
  const background = new Graphics();
  background.eventMode = "none";
  const icon = new Graphics();
  icon.eventMode = "none";
  const label = new BitmapTextClass({
    anchor: { x: 0, y: 0.5 },
    style: {
      fill: 0xf8fafc,
      fontFamily: loadedNodeLabelFont.fontFamily,
      fontSize: workspaceActivityChipLayoutConfig.fontSize,
    },
    text: "",
  });
  label.eventMode = "none";
  label.roundPixels = true;
  container.addChild(background, icon, label);
  return {
    background,
    chip: null,
    container,
    fingerprint: "",
    icon,
    label,
  };
}

function drawWorkspaceActivityChip(view, chip) {
  const visualState = resolveWorkspaceActivityChipVisualState(chip);
  const width = chipWidth(chip);
  const height = workspaceActivityChipLayoutConfig.chipHeight;
  const color = visualState.channels.fill;
  const stroke = visualState.channels.stroke;
  const strokeAlpha = Math.max(0.42, visualState.channels.strokeAlpha);

  view.background
    .clear()
    .roundRect(0, 0, width, height, 4)
    .fill({ alpha: chipBackgroundAlpha(visualState.state), color: 0x0f172a })
    .rect(0, 4, 2, height - 8)
    .fill({ alpha: strokeAlpha, color: stroke })
    .roundRect(0.5, 0.5, width - 1, height - 1, 4)
    .stroke({ alpha: strokeAlpha, color: stroke, width: 1 });

  drawWorkspaceActivityChipIcon(view.icon, chip, { color, stroke });
  view.label.visible = chipTextVisible(chip);
  view.label.text = view.label.visible ? chip.label : "";
  view.label.style.fontSize = workspaceActivityChipLayoutConfig.fontSize;
  view.label.style.fill = chipLabelColor(visualState.state);
  view.label.x = chip.type === "collapsed" ? 24 : 28;
  view.label.y = height / 2 + 0.5;
  view.container.visible = true;
}

function drawWorkspaceActivityChipIcon(target, chip, { color, stroke }) {
  target.clear();
  const centerX = 13;
  const centerY = workspaceActivityChipLayoutConfig.chipHeight / 2;
  target.circle(centerX, centerY, 7).fill({ alpha: 0.18, color });
  target.circle(centerX, centerY, 6.5).stroke({ alpha: 0.76, color: stroke, width: 1 });
  if (chip.type === "collapsed") {
    drawCollapsedIcon(target, centerX, centerY);
    return;
  }
  const draw = chipIconDrawers[chip.marker.kind];
  if (!draw) {
    throw new Error(`unknown workspace activity chip kind: ${chip.marker.kind}`);
  }
  draw(target, centerX, centerY);
}

function positionWorkspaceActivityChip(view, chip, nodes, viewport) {
  const node = nodes.find((candidate) => candidate.id === chip.nodeId);
  if (!node) {
    view.container.visible = false;
    view.placement = null;
    return;
  }
  const inverseZoom = 1 / Math.max(0.001, activityViewportZoom(viewport));
  const placement = activityChipPlacement({
    chip,
    inverseZoom,
    node,
    viewport,
  });
  view.container.visible = true;
  view.container.scale.set(inverseZoom);
  view.container.x = placement.x;
  view.container.y = placement.y;
  view.placement = placement;
}

function activityChipPlacement({ chip, inverseZoom, node, viewport }) {
  const height = workspaceActivityChipLayoutConfig.chipHeight;
  const width = chipWidth(chip);
  const y = clampedActivityChipWorldY(
    node.y +
      workspaceActivityChipLayoutConfig.topInset * inverseZoom +
      chip.rank *
        (workspaceActivityChipLayoutConfig.chipHeight + workspaceActivityChipLayoutConfig.chipGap) *
        inverseZoom,
    { height, inverseZoom, viewport },
  );
  const right = activityChipPlacementCandidate({
    height,
    side: "right",
    viewport,
    width,
    x: node.x + node.width + workspaceActivityChipLayoutConfig.nodeGap * inverseZoom,
    y,
  });
  const left = activityChipPlacementCandidate({
    height,
    side: "left",
    viewport,
    width,
    x: node.x - (workspaceActivityChipLayoutConfig.nodeGap + width) * inverseZoom,
    y,
  });
  return chooseActivityChipHorizontalPlacement(left, right, viewport);
}

function activityChipPlacementCandidate({ height, side, viewport, width, x, y }) {
  const screen = viewport.toScreen(x, y);
  return {
    screenBounds: {
      bottom: screen.y + height,
      left: screen.x,
      right: screen.x + width,
      top: screen.y,
    },
    side,
    x,
    y,
  };
}

function chooseActivityChipHorizontalPlacement(left, right, viewport) {
  const screenBounds = activityViewportScreenBounds(viewport);
  if (activityChipFitsHorizontally(right, screenBounds)) {
    return right;
  }
  if (activityChipFitsHorizontally(left, screenBounds)) {
    return left;
  }
  return activityChipHorizontalOverflow(left, screenBounds) <=
    activityChipHorizontalOverflow(right, screenBounds)
    ? left
    : right;
}

function activityChipFitsHorizontally(candidate, screenBounds) {
  const padding = workspaceActivityChipLayoutConfig.viewportPadding;
  return (
    candidate.screenBounds.left >= screenBounds.left + padding &&
    candidate.screenBounds.right <= screenBounds.right - padding
  );
}

function activityChipHorizontalOverflow(candidate, screenBounds) {
  const padding = workspaceActivityChipLayoutConfig.viewportPadding;
  return (
    Math.max(0, screenBounds.left + padding - candidate.screenBounds.left) +
    Math.max(0, candidate.screenBounds.right - (screenBounds.right - padding))
  );
}

function clampedActivityChipWorldY(y, { height, inverseZoom, viewport }) {
  const screenBounds = activityViewportScreenBounds(viewport);
  if (!Number.isFinite(screenBounds.bottom)) {
    return y;
  }
  const screenY = viewport.toScreen(0, y).y;
  const minY = screenBounds.top + workspaceActivityChipLayoutConfig.viewportPadding;
  const maxY = screenBounds.bottom - workspaceActivityChipLayoutConfig.viewportPadding - height;
  if (maxY < minY) {
    return y;
  }
  const clampedScreenY = Math.max(minY, Math.min(maxY, screenY));
  return y + (clampedScreenY - screenY) * inverseZoom;
}

function activityChipViewScreenBounds(entry, viewport) {
  const screen = viewport.toScreen(entry.container.x, entry.container.y);
  const width = chipWidth(entry.chip);
  const height = workspaceActivityChipLayoutConfig.chipHeight;
  return {
    bottom: screen.y + height,
    left: screen.x,
    right: screen.x + width,
    top: screen.y,
  };
}

function markerChipDisplayItem(marker, { config, layoutMode, rank }) {
  return {
    hiddenCount: 0,
    id: marker.id,
    label: chipDisplayLabel(marker.label, config.labelMaxLength),
    layoutMode,
    marker,
    markers: [marker],
    nodeId: marker.nodeId,
    rank,
    type: "marker",
  };
}

function collapsedChipDisplayItem(nodeId, markers, { id = null, layoutMode, rank }) {
  return {
    hiddenCount: markers.length,
    id: id ?? `workspace-activity:collapsed:${nodeId}`,
    label: `+${markers.length}`,
    layoutMode,
    markers,
    nodeId,
    rank,
    type: "collapsed",
  };
}

function nextActivityChipRank(items, nodeId) {
  return (
    Math.max(-1, ...items.filter((item) => item.nodeId === nodeId).map((item) => item.rank)) + 1
  );
}

function compareActivityChipMarkers(left, right) {
  const leftVisual = resolveWorkspaceActivityMarkerVisualState(left);
  const rightVisual = resolveWorkspaceActivityMarkerVisualState(right);
  return (
    leftVisual.priority - rightVisual.priority ||
    (right.updatedAt || "").localeCompare(left.updatedAt || "") ||
    right.revision - left.revision ||
    left.id.localeCompare(right.id)
  );
}

function visibleActivityChipMarkers(sortedMarkers, maxVisibleChips) {
  const selected = [];
  const selectedIds = new Set();
  const selectedKinds = new Set();
  for (const marker of sortedMarkers) {
    if (selected.length >= maxVisibleChips) {
      break;
    }
    if (selectedKinds.has(marker.kind)) {
      continue;
    }
    selected.push(marker);
    selectedIds.add(marker.id);
    selectedKinds.add(marker.kind);
  }
  for (const marker of sortedMarkers) {
    if (selected.length >= maxVisibleChips) {
      break;
    }
    if (selectedIds.has(marker.id)) {
      continue;
    }
    selected.push(marker);
    selectedIds.add(marker.id);
  }
  return selected.sort(compareActivityChipMarkers);
}

function compareNodeGroups(left, right, nodesById) {
  const leftIndex = nodesById.get(left[0])?.index ?? Number.MAX_SAFE_INTEGER;
  const rightIndex = nodesById.get(right[0])?.index ?? Number.MAX_SAFE_INTEGER;
  return leftIndex - rightIndex || left[0].localeCompare(right[0]);
}

function chipWidth(chip) {
  if (chip.type === "collapsed") {
    return chip.layoutMode === "readable"
      ? workspaceActivityChipLayoutConfig.collapsedChipWidth
      : workspaceActivityChipLayoutConfig.compactCollapsedChipWidth;
  }
  return chip.layoutMode === "readable"
    ? workspaceActivityChipLayoutConfig.chipWidth
    : workspaceActivityChipLayoutConfig.compactChipWidth;
}

function chipTextVisible(chip) {
  return chip.type === "collapsed" || chip.layoutMode === "readable";
}

function chipBackgroundAlpha(state) {
  switch (state) {
    case "failed":
    case "waiting_approval":
      return 0.78;
    case "running":
      return 0.9;
    case "cancelled":
    case "completed":
      return 0.58;
    case "pending":
      return 0.64;
    case "idle":
      return 0.5;
  }
}

function chipLabelColor(state) {
  switch (state) {
    case "cancelled":
    case "completed":
    case "idle":
      return 0xcbd5e1;
    case "failed":
    case "pending":
    case "running":
    case "waiting_approval":
      return 0xf8fafc;
  }
}

const chipIconDrawers = {
  approval: drawApprovalIcon,
  command: drawCommandIcon,
  file_change: drawFileIcon,
  workflow_status: drawWorkflowIcon,
};

function drawCollapsedIcon(target, centerX, centerY) {
  target.circle(centerX - 3, centerY, 1.3).fill({ alpha: 0.92, color: 0xf8fafc });
  target.circle(centerX, centerY, 1.3).fill({ alpha: 0.92, color: 0xf8fafc });
  target.circle(centerX + 3, centerY, 1.3).fill({ alpha: 0.92, color: 0xf8fafc });
}

function drawApprovalIcon(target, centerX, centerY) {
  target
    .moveTo(centerX - 4, centerY)
    .lineTo(centerX - 1, centerY + 4)
    .lineTo(centerX + 5, centerY - 5)
    .stroke({ alpha: 0.96, color: 0xf8fafc, width: 1.4 });
}

function drawCommandIcon(target, centerX, centerY) {
  target
    .moveTo(centerX - 4, centerY - 4)
    .lineTo(centerX + 1, centerY)
    .lineTo(centerX - 4, centerY + 4)
    .moveTo(centerX + 2, centerY + 4)
    .lineTo(centerX + 5, centerY + 4)
    .stroke({ alpha: 0.96, color: 0xf8fafc, width: 1.4 });
}

function drawFileIcon(target, centerX, centerY) {
  target
    .rect(centerX - 4, centerY - 5, 8, 10)
    .stroke({ alpha: 0.96, color: 0xf8fafc, width: 1.1 })
    .moveTo(centerX - 2, centerY - 1)
    .lineTo(centerX + 3, centerY - 1)
    .moveTo(centerX - 2, centerY + 2)
    .lineTo(centerX + 3, centerY + 2)
    .stroke({ alpha: 0.9, color: 0xf8fafc, width: 0.9 });
}

function drawWorkflowIcon(target, centerX, centerY) {
  target
    .circle(centerX, centerY, 3.8)
    .stroke({ alpha: 0.96, color: 0xf8fafc, width: 1.2 })
    .moveTo(centerX, centerY - 6)
    .lineTo(centerX, centerY - 3.8)
    .moveTo(centerX + 4.8, centerY + 3.8)
    .lineTo(centerX + 6.3, centerY + 5.3)
    .moveTo(centerX - 4.8, centerY + 3.8)
    .lineTo(centerX - 6.3, centerY + 5.3)
    .stroke({ alpha: 0.9, color: 0xf8fafc, width: 1 });
}

function chipDisplayLabel(value, maxLength) {
  const clean = normalizeChipLabel(value);
  if (clean.length <= maxLength) {
    return clean;
  }
  return `${clean.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function normalizeChipLabel(value) {
  return value.split("").map(normalizeChipLabelCharacter).join("").replace(/\s+/g, " ").trim();
}

function normalizeChipLabelCharacter(character) {
  const code = character.charCodeAt(0);
  if (code < 32 || code === 127) {
    return " ";
  }
  return code <= 126 ? character : "?";
}

function activityViewportZoom(viewport) {
  return viewport?.scaled ?? viewport?.scale?.x ?? 1;
}

function activityViewportScreenBounds(viewport) {
  return {
    bottom: activityViewportScreenSize(viewport?.screenHeight),
    left: 0,
    right: activityViewportScreenSize(viewport?.screenWidth),
    top: 0,
  };
}

function activityViewportScreenSize(value) {
  return Number.isFinite(value) && value > 0 ? value : Number.POSITIVE_INFINITY;
}
