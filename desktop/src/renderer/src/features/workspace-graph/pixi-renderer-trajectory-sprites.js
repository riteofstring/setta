import { BitmapText, Container, Graphics } from "pixi.js";
import { trajectorySpriteCanvasLabel } from "./workspace-trajectory-display-labels";

const spriteHeight = 22;
const spriteGap = 6;
const spriteWidth = 148;
const collapsedSpriteWidth = 58;
const recentLaneScreenX = 24;
const recentLaneScreenY = 108;

export function createWorkspaceTrajectorySpriteLayer({
  debugMetrics,
  getNode,
  layer,
  loadedNodeLabelFont,
  viewport,
}) {
  let frame = null;
  let spriteSyncCount = 0;
  let spriteRedrawCount = 0;
  let spritePoolHitCount = 0;
  let spritePoolMissCount = 0;
  let spritePoolReleaseCount = 0;
  let spriteViewId = 0;
  const activeViews = new Map();
  const pooledViews = [];

  return {
    debugSnapshot,
    destroy,
    syncPositions,
    tick,
    updateFrame,
  };

  function updateFrame(nextFrame) {
    frame = nextFrame;
    syncViews();
  }

  function syncViews() {
    debugMetrics.measure("trajectory-sprite-sync", () => {
      const items = displayItemsForFrame(frame);
      const nextIds = new Set(items.map((item) => item.id));
      for (const [id, view] of activeViews) {
        if (!nextIds.has(id)) {
          releaseView(id, view);
        }
      }
      for (const item of items) {
        const view = activeViews.get(item.id) ?? acquireView(item.id);
        syncViewContent(view, item);
        syncViewPosition(view, item);
      }
      spriteSyncCount += 1;
    });
  }

  function tick(now) {
    if (frame === null || activeViews.size === 0) {
      return;
    }
    for (const view of activeViews.values()) {
      if (!view.item) {
        continue;
      }
      syncViewPosition(view, view.item);
      syncViewMotion(view, view.item, now);
    }
  }

  function syncPositions() {
    for (const view of activeViews.values()) {
      if (view.item) {
        syncViewPosition(view, view.item);
      }
    }
  }

  function acquireView(id) {
    const pooled = pooledViews.pop();
    if (pooled) {
      spritePoolHitCount += 1;
      activeViews.set(id, pooled);
      layer.addChild(pooled.container);
      return pooled;
    }
    spritePoolMissCount += 1;
    const container = new Container();
    container.eventMode = "none";
    container.interactiveChildren = false;
    const background = new Graphics();
    const icon = new Graphics();
    const progress = new Graphics();
    const label = new BitmapText({
      anchor: { x: 0, y: 0.5 },
      style: {
        fill: 0xf8fafc,
        fontFamily: loadedNodeLabelFont.fontFamily,
        fontSize: 10,
      },
      text: "",
    });
    label.eventMode = "none";
    label.roundPixels = true;
    container.addChild(background, icon, progress, label);
    const view = {
      background,
      container,
      icon,
      id: `trajectory-sprite-view-${++spriteViewId}`,
      item: null,
      label,
      progress,
      renderKey: "",
    };
    activeViews.set(id, view);
    layer.addChild(container);
    return view;
  }

  function releaseView(id, view) {
    activeViews.delete(id);
    view.container.visible = false;
    view.container.removeFromParent();
    view.item = null;
    pooledViews.push(view);
    spritePoolReleaseCount += 1;
  }

  function syncViewContent(view, item) {
    view.item = item;
    const renderKey = itemRenderKey(item);
    if (view.renderKey === renderKey) {
      return;
    }
    view.renderKey = renderKey;
    const width = item.collapsedCount > 0 ? collapsedSpriteWidth : spriteWidth;
    const color = spriteColor(item);
    view.background
      .clear()
      .roundRect(0, 0, width, spriteHeight, 7)
      .fill({ alpha: 0.78, color: 0x06101c })
      .roundRect(0.5, 0.5, width - 1, spriteHeight - 1, 7)
      .stroke({ alpha: spriteStrokeAlpha(item), color, width: 1.2 });
    drawSpriteIcon(view.icon, item, color);
    view.label.text = item.collapsedCount > 0 ? `+${item.collapsedCount}` : spriteLabel(item);
    view.label.x = item.collapsedCount > 0 ? 24 : 28;
    view.label.y = spriteHeight / 2 + 0.5;
    view.container.visible = true;
    spriteRedrawCount += 1;
  }

  function syncViewPosition(view, item) {
    const zoom = Math.max(0.001, viewport.scale.x);
    const inverseZoom = 1 / zoom;
    view.container.scale.set(inverseZoom);
    if (item.lane === "recent") {
      const topLeft = viewport.toWorld(recentLaneScreenX, recentLaneScreenY);
      view.container.x = topLeft.x;
      view.container.y = topLeft.y + item.rank * (spriteHeight + spriteGap) * inverseZoom;
      return;
    }
    const node = getNode(item.anchorNodeId);
    if (!node) {
      view.container.visible = false;
      return;
    }
    view.container.visible = true;
    view.container.x = node.x + node.width + 12 * inverseZoom;
    view.container.y =
      node.y + 7 * inverseZoom + item.rank * (spriteHeight + spriteGap) * inverseZoom;
  }

  function syncViewMotion(view, item, now) {
    const alpha = spriteAlpha(item, now);
    view.container.alpha = alpha;
    view.progress.clear();
    if (item.collapsedCount > 0 || item.status !== "running") {
      return;
    }
    const width = spriteWidth - 10;
    const phase = ((now + hashString(item.id) * 37) % 1200) / 1200;
    const start = 5 + width * phase;
    const end = Math.min(spriteWidth - 5, start + 22);
    view.progress
      .roundRect(start, spriteHeight - 3, Math.max(4, end - start), 1.5, 1.5)
      .fill({ alpha: 0.72, color: spriteColor(item) });
  }

  function destroy() {
    for (const [id, view] of activeViews) {
      activeViews.delete(id);
      destroyView(view);
    }
    while (pooledViews.length > 0) {
      destroyView(pooledViews.pop());
    }
    layer.removeChildren();
  }

  function debugSnapshot() {
    const trajectoryAnchors = trajectoryAnchorDebugSnapshot(frame, getNode);
    return {
      trajectoryAnchors,
      trajectorySpriteDisplayCount: activeViews.size,
      trajectorySpriteFrameRevision: frame?.revision ?? 0,
      trajectorySpriteGroupCount: frame?.groups.length ?? 0,
      trajectorySpritePoolHitCount: spritePoolHitCount,
      trajectorySpritePoolMissCount: spritePoolMissCount,
      trajectorySpritePoolReleaseCount: spritePoolReleaseCount,
      trajectorySpritePooledCount: pooledViews.length,
      trajectorySpriteRecentLaneCount: frame?.recentLane.length ?? 0,
      trajectorySpriteRedrawCount: spriteRedrawCount,
      trajectorySpriteSyncCount: spriteSyncCount,
      trajectorySpriteTotalCount: frame?.totalSpriteCount ?? 0,
    };
  }
}

function trajectoryAnchorDebugSnapshot(frame, getNode) {
  const items = displayItemsForFrame(frame);
  const anchors = items.map((item) => ({
    anchorNodeId: item.anchorNodeId,
    anchored: item.lane === "workflow_node" && Boolean(item.anchorNodeId),
    id: item.id,
    lane: item.lane,
    missingAnchor:
      item.lane === "workflow_node" &&
      Boolean(item.anchorNodeId) &&
      getNode(item.anchorNodeId) === null,
    rank: item.rank,
    status: item.status,
    type: item.type,
  }));
  return {
    anchors,
    counts: {
      anchored: anchors.filter((anchor) => anchor.anchored && !anchor.missingAnchor).length,
      missingAnchor: anchors.filter((anchor) => anchor.missingAnchor).length,
      recentLane: anchors.filter((anchor) => anchor.lane === "recent").length,
      total: anchors.length,
    },
  };
}

function displayItemsForFrame(frame) {
  if (frame === null) {
    return [];
  }
  const items = [];
  for (const group of frame.groups) {
    group.items.forEach((display, rank) => {
      items.push(displayItem(display, rank, 0));
    });
    if (group.hiddenCount > 0) {
      items.push({
        anchorNodeId: group.workflowNodeId,
        collapsedCount: group.hiddenCount,
        id: `trajectory-collapsed:${group.workflowNodeId}`,
        lane: "workflow_node",
        rank: group.items.length,
        severity: group.highestSeverity,
        status: group.items[0] ? displayStatus(group.items[0]) : "unknown",
        type: "collapsed",
      });
    }
  }
  frame.recentLane.forEach((display, rank) => {
    items.push(displayItem(display, rank, 0));
  });
  return items;
}

function displayItem(display, rank, collapsedCount) {
  return {
    anchorNodeId: display.anchorNodeId,
    aggregate: display.type === "aggregate" ? display.aggregate : null,
    collapsedCount,
    id: display.id,
    kind: displayKind(display),
    lane: display.lane,
    rank,
    severity: displaySeverity(display),
    sprite: display.type === "sprite" ? display.sprite : null,
    status: displayStatus(display),
    type: display.type,
  };
}

function itemRenderKey(item) {
  if (item.collapsedCount > 0) {
    return [item.id, item.collapsedCount, item.severity, item.status].join(":");
  }
  return [item.id, item.kind, item.status, item.severity, spriteLabel(item)].join(":");
}

function drawSpriteIcon(icon, item, color) {
  icon.clear();
  const centerX = 13;
  const centerY = spriteHeight / 2;
  icon.circle(centerX, centerY, 7).fill({ alpha: 0.18, color });
  icon.circle(centerX, centerY, 6.5).stroke({ alpha: 0.76, color, width: 1 });
  if (item.collapsedCount > 0 || item.type === "collapsed") {
    drawCollapsedIcon(icon, centerX, centerY);
    return;
  }
  spriteIconDrawers[item.kind]?.(icon, centerX, centerY);
}

const spriteIconDrawers = {
  approval: drawApprovalIcon,
  assistant_message: drawAssistantIcon,
  cartographer_status: drawCartographerIcon,
  command: drawCommandIcon,
  diff: drawDiffIcon,
  file_read: drawFileIcon,
  file_write: drawFileIcon,
  plan_update: drawReasoningIcon,
  reasoning_summary: drawReasoningIcon,
  memory_suggestion: drawCartographerIcon,
  test: drawTestIcon,
  tool_call: drawToolIcon,
  workflow_status: drawWorkflowIcon,
};

function drawCollapsedIcon(icon, centerX, centerY) {
  icon.circle(centerX - 3, centerY, 1.3).fill({ alpha: 0.9, color: 0xf8fafc });
  icon.circle(centerX, centerY, 1.3).fill({ alpha: 0.9, color: 0xf8fafc });
  icon.circle(centerX + 3, centerY, 1.3).fill({ alpha: 0.9, color: 0xf8fafc });
}

function drawCommandIcon(icon, centerX, centerY) {
  icon
    .moveTo(centerX - 3.5, centerY - 4)
    .lineTo(centerX + 1, centerY)
    .lineTo(centerX - 3.5, centerY + 4)
    .stroke({ alpha: 0.95, color: 0xf8fafc, width: 1.5 });
  icon
    .moveTo(centerX + 2, centerY + 4)
    .lineTo(centerX + 5, centerY + 4)
    .stroke({ alpha: 0.95, color: 0xf8fafc, width: 1.5 });
}

function drawFileIcon(icon, centerX, centerY) {
  icon.rect(centerX - 4, centerY - 5, 8, 10).stroke({
    alpha: 0.95,
    color: 0xf8fafc,
    width: 1.2,
  });
  icon
    .moveTo(centerX - 2, centerY - 1)
    .lineTo(centerX + 3, centerY - 1)
    .moveTo(centerX - 2, centerY + 2)
    .lineTo(centerX + 3, centerY + 2)
    .stroke({ alpha: 0.9, color: 0xf8fafc, width: 1 });
}

function drawDiffIcon(icon, centerX, centerY) {
  icon
    .moveTo(centerX - 4, centerY - 3)
    .lineTo(centerX + 4, centerY - 3)
    .moveTo(centerX, centerY - 7)
    .lineTo(centerX, centerY + 1)
    .moveTo(centerX - 4, centerY + 5)
    .lineTo(centerX + 4, centerY + 5)
    .stroke({ alpha: 0.95, color: 0xf8fafc, width: 1.25 });
}

function drawToolIcon(icon, centerX, centerY) {
  icon
    .moveTo(centerX - 4, centerY + 4)
    .lineTo(centerX + 4, centerY - 4)
    .circle(centerX + 4, centerY - 4, 1.8)
    .stroke({ alpha: 0.95, color: 0xf8fafc, width: 1.25 });
}

function drawReasoningIcon(icon, centerX, centerY) {
  icon
    .circle(centerX, centerY - 2, 2.4)
    .stroke({ alpha: 0.95, color: 0xf8fafc, width: 1.1 })
    .moveTo(centerX - 4, centerY + 4)
    .lineTo(centerX + 4, centerY + 4)
    .stroke({ alpha: 0.95, color: 0xf8fafc, width: 1.1 });
}

function drawApprovalIcon(icon, centerX, centerY) {
  icon
    .moveTo(centerX - 4, centerY)
    .lineTo(centerX - 1, centerY + 4)
    .lineTo(centerX + 5, centerY - 5)
    .stroke({ alpha: 0.95, color: 0xf8fafc, width: 1.4 });
}

function drawAssistantIcon(icon, centerX, centerY) {
  icon
    .roundRect(centerX - 5, centerY - 4, 10, 8, 3)
    .stroke({ alpha: 0.95, color: 0xf8fafc, width: 1.1 });
}

function drawWorkflowIcon(icon, centerX, centerY) {
  icon.circle(centerX, centerY, 3.5).fill({ alpha: 0.9, color: 0xf8fafc });
}

function drawCartographerIcon(icon, centerX, centerY) {
  icon.rect(centerX - 4, centerY - 4, 8, 8).stroke({ alpha: 0.95, color: 0xf8fafc, width: 1.1 });
}

function drawTestIcon(icon, centerX, centerY) {
  icon
    .moveTo(centerX - 4, centerY + 4)
    .lineTo(centerX, centerY - 5)
    .lineTo(centerX + 4, centerY + 4)
    .stroke({ alpha: 0.95, color: 0xf8fafc, width: 1.2 });
}

const severitySpriteColors = {
  blocking: 0xf59e0b,
  error: 0xfb7185,
  success: 0x22c55e,
  warning: 0xfbbf24,
};

const spriteKindColors = {
  approval: 0xf59e0b,
  assistant_message: 0xa3e635,
  cartographer_status: 0x94a3b8,
  command: 0x38bdf8,
  diff: 0xf0abfc,
  file_read: 0x2dd4bf,
  file_write: 0x2dd4bf,
  memory_suggestion: 0xf0abfc,
  plan_update: 0x818cf8,
  reasoning_summary: 0xfacc15,
  test: 0x22c55e,
  tool_call: 0xc084fc,
  workflow_status: 0x67e8f9,
};

function spriteColor(item) {
  const severityColor = severitySpriteColors[item.severity];
  if (severityColor !== undefined) {
    return severityColor;
  }
  if (item.type === "collapsed") {
    return 0x94a3b8;
  }
  return spriteKindColors[item.kind];
}

function spriteStrokeAlpha(item) {
  if (item.status === "running" || item.status === "approval_required") {
    return 0.94;
  }
  if (item.severity === "error" || item.severity === "blocking") {
    return 0.9;
  }
  return 0.64;
}

function spriteAlpha(item, now) {
  if (item.collapsedCount > 0 || item.type === "collapsed") {
    return 0.86;
  }
  if (spriteHasLiveStatus(item.status)) {
    return 0.9 + 0.08 * Math.sin(now / 260 + hashString(item.id));
  }
  if (item.aggregate !== null) {
    return 0.82;
  }
  return spriteFadeAlpha(item.sprite);
}

function spriteHasLiveStatus(status) {
  return status === "running" || status === "pending" || status === "approval_required";
}

function spriteFadeAlpha(sprite) {
  const expiresAt = Date.parse(sprite.expiresAt);
  if (!Number.isFinite(expiresAt) || sprite.ttlMs <= 0) {
    return 0.82;
  }
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) {
    return 0;
  }
  const fadeWindow = Math.max(1, sprite.ttlMs * 0.45);
  if (remaining >= fadeWindow) {
    return 0.82;
  }
  return Math.max(0.18, 0.18 + 0.64 * (remaining / fadeWindow));
}

function spriteLabel(item) {
  if (item.aggregate !== null) {
    return item.aggregate.label;
  }
  return item.sprite === null ? "" : trajectorySpriteCanvasLabel(item.sprite);
}

function displayKind(display) {
  return display.type === "aggregate" ? display.aggregate.kind : display.sprite.kind;
}

function displaySeverity(display) {
  return display.type === "aggregate" ? display.aggregate.severity : display.sprite.severity;
}

function displayStatus(display) {
  return display.type === "aggregate" ? display.aggregate.status : display.sprite.status;
}

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash % 997;
}

function destroyView(view) {
  if (!view) {
    return;
  }
  view.container.removeFromParent();
  view.container.destroy({ children: true });
}
