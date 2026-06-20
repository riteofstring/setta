import { FillGradient, GraphicsContext } from "pixi.js";

import { rendererNodeLayer } from "./pixi-renderer-layers";
import { workflowCardLayoutFor } from "./pixi-renderer-workflow-card-layout";
import { workspaceNeonTheme } from "./workspace-neon-theme";

const diagnosticMarkerColors = {
  error: 0xfb7185,
  warning: 0xfbbf24,
};

const cellPathSegments = 32;
const cellTau = Math.PI * 2;

export function createNodeGeometryContextFactory() {
  let nodeBodyContextCount = 0;
  let nodeShadowContextCount = 0;
  let nodeOutlineContextCount = 0;
  return {
    counts: () => ({
      body: nodeBodyContextCount,
      outline: nodeOutlineContextCount,
      shadow: nodeShadowContextCount,
    }),
    nodeBodyContextFor: (node) => {
      switch (rendererNodeLayer(node)) {
        case "workflow":
          nodeBodyContextCount += 1;
          return workflowNodeBodyContextFor(node);
        case "semantic":
          nodeBodyContextCount += 1;
          return semanticNodeBodyContextFor(node);
      }
      throw new Error(`unsupported workspace graph node layer: ${node.layer}`);
    },
    nodeOutlineContextFor: (node, state) => {
      switch (rendererNodeLayer(node)) {
        case "workflow":
          nodeOutlineContextCount += 1;
          return workflowNodeOutlineContextFor(node, state);
        case "semantic":
          nodeOutlineContextCount += 1;
          return semanticNodeOutlineContextFor(node, state);
      }
      throw new Error(`unsupported workspace graph node layer: ${node.layer}`);
    },
    nodeShadowContextFor: (node) => {
      switch (rendererNodeLayer(node)) {
        case "workflow":
          nodeShadowContextCount += 1;
          return workflowNodeShadowContextFor(node);
        case "semantic":
          nodeShadowContextCount += 1;
          return semanticNodeShadowContextFor(node);
      }
      throw new Error(`unsupported workspace graph node layer: ${node.layer}`);
    },
  };
}

export function drawWorkspaceGrid(grid, foundation = workspaceNeonTheme.foundation, bounds = null) {
  const { coarse, extent, fine, fineSoft } = foundation.grid;
  const gridBounds = bounds ?? {
    maxX: extent,
    maxY: extent,
    minX: -extent,
    minY: -extent,
  };
  grid.clear();
  if (fineSoft) {
    drawGridLines(grid, gridBounds, fine.step);
    grid.stroke({
      alpha: fineSoft.alpha,
      color: fineSoft.color,
      width: fineSoft.width,
    });
  }
  drawGridLines(grid, gridBounds, fine.step);
  grid.stroke({
    alpha: fine.alpha,
    color: fine.color,
    pixelLine: true,
    width: fine.width,
  });
  drawGridLines(grid, gridBounds, coarse.step);
  grid.stroke({ alpha: coarse.alpha, color: coarse.color, width: coarse.width });
}

export function workspaceGridBoundsForNodes(nodesForBounds) {
  if (nodesForBounds.length === 0) {
    return null;
  }
  const padding = 200;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodesForBounds) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }
  return {
    maxX: maxX + padding,
    maxY: maxY + padding,
    minX: minX - padding,
    minY: minY - padding,
  };
}

function drawGridLines(grid, gridBounds, step) {
  for (const position of gridLinePositions(gridBounds.minX, gridBounds.maxX, step)) {
    grid.moveTo(position, gridBounds.minY).lineTo(position, gridBounds.maxY);
  }
  for (const position of gridLinePositions(gridBounds.minY, gridBounds.maxY, step)) {
    grid.moveTo(gridBounds.minX, position).lineTo(gridBounds.maxX, position);
  }
}

function gridLinePositions(min, max, step) {
  const first = Math.floor(min / step) * step;
  const positions = [];
  for (let position = first; position <= max; position += step) {
    positions.push(position);
  }
  return positions;
}

export function drawWorkspaceBackdrop(
  target,
  screenSize,
  foundation = workspaceNeonTheme.foundation,
) {
  const center = rgbaColorStop(foundation.backdrop.centerColor);
  const steps = 28;
  const radius =
    Math.max(screenSize.width, screenSize.height) * (foundation.backdrop.radiusRatio ?? 0.75);
  const stepAlpha = 1 - (1 - center.alpha) ** (1 / steps);
  const centerX = screenSize.width * 0.5;
  const centerY = screenSize.height * 0.42;
  target.clear();
  for (let step = steps; step >= 1; step -= 1) {
    target
      .circle(centerX, centerY, radius * (step / steps))
      .fill({ alpha: stepAlpha, color: center.color });
  }
}

export function drawWorkspaceVignette(
  target,
  screenSize,
  gradient,
  foundation = workspaceNeonTheme.foundation,
) {
  target.clear();
  target.rect(0, 0, screenSize.width, screenSize.height).fill(gradient);
  drawWorkspaceTopFade(target, screenSize, foundation);
  drawWorkspaceBottomFade(target, screenSize, foundation);
}

function drawWorkspaceTopFade(target, screenSize, foundation) {
  const topFade = foundation.topFade;
  if (!topFade) {
    return;
  }
  const steps = 18;
  const height = screenSize.height * topFade.heightRatio;
  const stripHeight = height / steps;
  for (let step = 0; step < steps; step += 1) {
    const progress = step / steps;
    const alpha = topFade.alpha * (1 - progress) ** 2;
    target
      .rect(0, step * stripHeight, screenSize.width, stripHeight + 1)
      .fill({ alpha, color: foundation.background });
  }
}

function drawWorkspaceBottomFade(target, screenSize, foundation) {
  const bottomFade = foundation.bottomFade;
  if (!bottomFade) {
    return;
  }
  const steps = 18;
  const height = screenSize.height * bottomFade.heightRatio;
  const stripHeight = height / steps;
  for (let step = 0; step < steps; step += 1) {
    const progress = step / steps;
    const alpha = bottomFade.alpha * (1 - progress) ** 2;
    target
      .rect(0, screenSize.height - (step + 1) * stripHeight, screenSize.width, stripHeight + 1)
      .fill({ alpha, color: foundation.background });
  }
}

function rgbaColorStop(value) {
  const match = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([01](?:\.\d+)?|\.\d+)\)$/.exec(value);
  if (!match) {
    throw new Error(`unsupported workspace backdrop color: ${value}`);
  }
  const red = Number.parseInt(match[1], 10);
  const green = Number.parseInt(match[2], 10);
  const blue = Number.parseInt(match[3], 10);
  const alpha = Number.parseFloat(match[4]);
  return {
    alpha,
    color: (red << 16) | (green << 8) | blue,
  };
}

export function createWorkspaceBackdropGradient(foundation = workspaceNeonTheme.foundation) {
  const { backdrop } = foundation;
  return new FillGradient({
    center: { x: 0.5, y: 0.45 },
    colorStops: [
      { color: backdrop.centerColor, offset: 0 },
      { color: backdrop.centerColor, offset: 0.12 },
      { color: backdrop.edgeColor, offset: 1 },
    ],
    innerRadius: 0,
    outerCenter: { x: 0.5, y: 0.45 },
    outerRadius: 0.75,
    textureSpace: "local",
    type: "radial",
  });
}

export function createWorkspaceVignetteGradient() {
  const { vignette } = workspaceNeonTheme.foundation;
  return new FillGradient({
    center: { x: 0.5, y: 0.5 },
    colorStops: [
      { color: vignette.centerColor, offset: 0 },
      { color: vignette.centerColor, offset: 0.42 },
      { color: vignette.midColor, offset: 0.72 },
      { color: vignette.edgeColor, offset: 1 },
    ],
    innerRadius: 0,
    outerCenter: { x: 0.5, y: 0.5 },
    outerRadius: 0.78,
    textureSpace: "local",
    type: "radial",
  });
}

export function drawNodeDiagnosticMarker(target, node) {
  target.clear();
  if (!node.diagnostic) {
    target.visible = false;
    return;
  }
  target.visible = true;
  drawDiagnosticDiamond(target, node.width - 4, -6, node.diagnostic.severity);
}

export function drawNodeActivityMarker(target, node) {
  target.clear();
  switch (rendererNodeLayer(node)) {
    case "workflow":
      drawWorkflowRuntimeMarker(target, node);
      return;
    case "semantic":
      drawSemanticActivityMarker(target, node);
      return;
  }
  throw new Error(`unsupported workspace graph node layer: ${node.layer}`);
}

function drawSemanticActivityMarker(target, node) {
  if (!node.activity || node.activity.count <= 0) {
    target.visible = false;
    return;
  }
  target.visible = true;
  const color =
    workspaceNeonTheme.semantic.activity[node.activity.kind] ??
    workspaceNeonTheme.semantic.activity.exploring;
  const style = activityMarkerStyle(node.activity.active);
  const geometry = semanticCellGeometry(node);
  const dotAngle = -Math.PI / 4;
  const dotDistance = geometry.radius + 7;
  const dotX = geometry.centerX + Math.cos(dotAngle) * dotDistance;
  const dotY = geometry.centerY + Math.sin(dotAngle) * dotDistance;
  target
    .circle(geometry.centerX, geometry.centerY, geometry.radius + 7)
    .stroke({ alpha: style.ringAlpha, color, width: style.ringWidth })
    .circle(dotX, dotY, style.dotRadius)
    .fill({ alpha: style.dotAlpha, color })
    .circle(dotX, dotY, style.outerRadius)
    .stroke({ alpha: style.outerAlpha, color, width: 2 });
}

function drawWorkflowRuntimeMarker(target, node) {
  const runtime = node.runtime;
  if (!runtime || runtime.sourceCount <= 0) {
    target.visible = false;
    return;
  }
  target.visible = true;
  const color = workspaceNeonTheme.semantic.workingSetStatus[runtime.status];
  const badgeWidth = 46;
  const badgeHeight = 18;
  const x = node.width - badgeWidth - 10;
  const y = node.height - badgeHeight - 8;
  const centerY = y + badgeHeight / 2;
  target
    .roundRect(x, y, badgeWidth, badgeHeight, 7)
    .fill({ alpha: 0.74, color: 0x07111f })
    .roundRect(x, y, badgeWidth, badgeHeight, 7)
    .stroke({ alpha: 0.86, color, width: 1.4 });
  drawWorkflowRuntimeStatusGlyph(target, runtime.status, x + 11, centerY, color);
  drawWorkflowRuntimeCountDots(target, runtime.sourceCount, x + 24, centerY, color);
  if (runtime.pulseCount > 0) {
    target
      .circle(x + badgeWidth - 7, y + 5, 2.4)
      .fill({ alpha: 0.92, color: 0xf8fafc })
      .circle(x + badgeWidth - 7, y + 5, 4.1)
      .stroke({ alpha: 0.28, color, width: 1 });
  }
}

function drawWorkflowRuntimeStatusGlyph(target, status, centerX, centerY, color) {
  switch (status) {
    case "failed":
    case "rejected":
      target
        .moveTo(centerX - 4, centerY - 4)
        .lineTo(centerX + 4, centerY + 4)
        .moveTo(centerX + 4, centerY - 4)
        .lineTo(centerX - 4, centerY + 4)
        .stroke({ alpha: 0.96, color, width: 1.7 });
      return;
    case "applied":
      target
        .moveTo(centerX - 4.5, centerY)
        .lineTo(centerX - 1.4, centerY + 3.5)
        .lineTo(centerX + 5, centerY - 4)
        .stroke({ alpha: 0.96, color, width: 1.8 });
      return;
    case "noop":
    case "superseded":
      target
        .moveTo(centerX - 5, centerY)
        .lineTo(centerX + 5, centerY)
        .stroke({ alpha: 0.92, color, width: 1.8 });
      return;
    case "applying":
    case "pending_review":
    case "proposing":
      target
        .moveTo(centerX, centerY - 5)
        .lineTo(centerX + 5, centerY)
        .lineTo(centerX, centerY + 5)
        .lineTo(centerX - 5, centerY)
        .closePath()
        .stroke({ alpha: 0.94, color, width: 1.5 });
      return;
    default:
      target
        .circle(centerX, centerY, 5.1)
        .stroke({ alpha: 0.9, color, width: 1.5 })
        .circle(centerX, centerY, 2.3)
        .fill({ alpha: 0.82, color });
  }
}

function drawWorkflowRuntimeCountDots(target, count, x, centerY, color) {
  const visibleDotCount = Math.min(3, Math.max(1, count));
  for (let index = 0; index < visibleDotCount; index += 1) {
    target.circle(x + index * 5.2, centerY, 1.7).fill({ alpha: 0.86, color });
  }
  if (count > visibleDotCount) {
    target
      .moveTo(x + visibleDotCount * 5.2 + 0.8, centerY)
      .lineTo(x + visibleDotCount * 5.2 + 4.8, centerY)
      .stroke({ alpha: 0.7, color, width: 1.2 });
  }
}

function activityMarkerStyle(active) {
  if (active) {
    return {
      dotAlpha: 0.45,
      dotRadius: 3,
      outerAlpha: 0.08,
      outerRadius: 5.5,
      ringAlpha: 0.08,
      ringWidth: 1.2,
    };
  }
  return {
    dotAlpha: 0.46,
    dotRadius: 3.6,
    outerAlpha: 0.1,
    outerRadius: 6,
    ringAlpha: 0.1,
    ringWidth: 1.1,
  };
}

function workflowNodeBodyContextFor(node) {
  const { glass } = workspaceNeonTheme.workflow;
  const accentColor = node.color;
  const strokeAlpha = node.status === "not_started" ? 0.44 : glass.strokeAlpha;
  const cardLayout = workflowCardLayoutFor(node);
  const context = new GraphicsContext()
    .roundRect(0, 0, node.width, node.height, glass.radius)
    .fill({ alpha: 1, color: glass.bodyBottom })
    .roundRect(1, 1, node.width - 2, Math.max(1, node.height * 0.52), glass.radius - 1)
    .fill({ alpha: 0, color: glass.bodyTop })
    .roundRect(2, 2, node.width - 4, Math.max(1, node.height * 0.28), glass.radius - 2)
    .fill({ alpha: glass.highlightAlpha, color: glass.highlightColor })
    .roundRect(0, 0, node.width, node.height, glass.radius)
    .stroke({
      alpha: strokeAlpha,
      color: accentColor,
      width: glass.strokeWidth,
    });
  if (node.status === "running") {
    drawRunningWorkflowNodeRing(context, node, glass.radius);
  }
  drawWorkflowKindGlyph(context, node, cardLayout);
  if (cardLayout.statusBadgeVisible) {
    drawWorkflowStatusDot(context, node);
  }
  return context;
}

function drawRunningWorkflowNodeRing(context, node, radius) {
  const color = 0x22c55e;
  context
    .roundRect(-3.5, -3.5, node.width + 7, node.height + 7, radius + 4)
    .stroke({ alpha: 0.92, color, width: 3.2 })
    .roundRect(-7.5, -7.5, node.width + 15, node.height + 15, radius + 8)
    .stroke({ alpha: 0.24, color, width: 5.8 });
}

function drawWorkflowKindGlyph(context, node, cardLayout) {
  const centerX = cardLayout.iconCenterX;
  const centerY = node.height / 2;
  const color = workflowGlyphColor(node);
  switch (node.kind) {
    case "start":
      context
        .moveTo(centerX - 4, centerY - 8)
        .lineTo(centerX + 8, centerY)
        .lineTo(centerX - 4, centerY + 8)
        .closePath()
        .fill({ alpha: 0.86, color });
      return;
    case "end":
      drawCheckeredWorkflowGlyph(context, centerX, centerY, color);
      return;
    case "gateway.and":
    case "gateway.or":
    case "gateway.xor":
      context
        .moveTo(centerX, centerY - 9)
        .lineTo(centerX + 9, centerY)
        .lineTo(centerX, centerY + 9)
        .lineTo(centerX - 9, centerY)
        .closePath()
        .stroke({ alpha: 0.58, color, width: 2 });
      return;
    default:
      drawActionWorkflowGlyph(context, centerX, centerY, color);
  }
}

function drawActionWorkflowGlyph(context, centerX, centerY, color) {
  const teeth = 8;
  for (let index = 0; index < teeth * 2; index += 1) {
    const radius = index % 2 === 0 ? 9.4 : 6.1;
    const angle = (index / (teeth * 2)) * Math.PI * 2;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }
  context.closePath().stroke({ alpha: 0.82, color, width: 1.8 });
  context.circle(centerX, centerY, 2.7).stroke({ alpha: 0.82, color, width: 1.6 });
}

function drawCheckeredWorkflowGlyph(context, centerX, centerY, color) {
  const size = 3.6;
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      if ((row + column) % 2 === 1) {
        continue;
      }
      context
        .rect(centerX - size * 2 + column * size, centerY - size * 2 + row * size, size, size)
        .fill({ alpha: 0.82, color });
    }
  }
}

function workflowGlyphColor(node) {
  if (node.status === "not_started") {
    return 0x9fb4c7;
  }
  return node.color;
}

function drawWorkflowStatusDot(context, node) {
  const centerX = node.width - 16;
  const centerY = 16;
  if (node.status === "succeeded") {
    context
      .circle(centerX, centerY, 8)
      .fill({ alpha: 0.66, color: node.color })
      .circle(centerX, centerY, 8)
      .stroke({ alpha: 0.28, color: 0xdcfce7, width: 1.1 })
      .moveTo(centerX - 3.6, centerY - 0.2)
      .lineTo(centerX - 1, centerY + 3.1)
      .lineTo(centerX + 4.4, centerY - 4)
      .stroke({ alpha: 0.95, color: 0xf0fdf4, width: 1.7 });
    return;
  }
  if (node.status === "running") {
    drawRunningWorkflowStatusBadge(context, centerX, centerY, node.color);
    return;
  }
  context
    .circle(centerX, centerY, 8)
    .fill({ alpha: node.status === "not_started" ? 0.24 : 0.58, color: node.color })
    .circle(centerX, centerY, 8)
    .stroke({ alpha: node.status === "not_started" ? 0 : 0.22, color: 0xe0f2fe, width: 1 });
}

function drawRunningWorkflowStatusBadge(context, centerX, centerY, color) {
  context
    .circle(centerX, centerY, 8)
    .fill({ alpha: 0.56, color })
    .circle(centerX, centerY, 8)
    .stroke({ alpha: 0.26, color: 0xccfbf1, width: 1.1 });
  drawStatusArc(context, centerX, centerY, {
    alpha: 0.92,
    color: 0xecfeff,
    endAngle: Math.PI * 0.88,
    radius: 4.8,
    segments: 12,
    startAngle: Math.PI * 0.12,
    width: 1.8,
  });
}

function drawStatusArc(
  context,
  centerX,
  centerY,
  { alpha, color, endAngle, radius, segments, startAngle, width },
) {
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const angle = startAngle + (endAngle - startAngle) * t;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }
  context.stroke({ alpha, color, width });
}

function semanticNodeBodyContextFor(node) {
  if (node.semanticRole === "source_pulse") {
    return semanticSourcePulseBodyContextFor(node);
  }
  const style = semanticCellRenderStyle(node);
  const geometry = semanticCellGeometry(node);
  const seed = stableUnitHash(node.id);
  const context = new GraphicsContext();
  drawOrganicCellPath(context, geometry, seed).fill({
    alpha: style.cytoplasmAlpha,
    color: style.cytoplasmColor,
  });
  drawOrganicCellPath(context, geometry, seed)
    .fill({ alpha: style.innerTintAlpha * 0.55, color: node.color })
    .circle(
      geometry.centerX - geometry.radius * 0.14,
      geometry.centerY - geometry.radius * 0.12,
      geometry.radius * 0.67,
    )
    .fill({ alpha: style.innerTintAlpha, color: node.color })
    .circle(
      geometry.centerX + geometry.radius * 0.18,
      geometry.centerY + geometry.radius * 0.15,
      geometry.radius * 0.43,
    )
    .fill({ alpha: style.innerTintAlpha * 0.58, color: node.color });
  drawOrganicCellPath(context, geometry, seed).stroke({
    alpha: style.auraAlpha * 0.2,
    color: node.color,
    width: style.auraWidth + 1.2,
  });
  drawSemanticNucleus(context, node, geometry, seed, style);
  drawSemanticOrganelles(context, node, geometry, seed, style);
  drawOrganicCellPath(context, geometry, seed).stroke({
    alpha: style.membraneAlpha,
    color: node.color,
    width: style.membraneWidth,
  });
  if (node.semanticRole === "preview") {
    drawSemanticPreviewProvisionalMarks(context, geometry, node.color);
  }
  drawOrganicCellPath(context, { ...geometry, radius: geometry.radius - 2.4 }, seed + 0.19).stroke({
    alpha: 0,
    color: 0xecfeff,
    width: 0.5,
  });
  return context;
}

function drawSemanticPreviewProvisionalMarks(context, geometry, color) {
  const radius = geometry.radius + 6;
  const tickLength = 7;
  for (let index = 0; index < 4; index += 1) {
    const angle = index * (Math.PI / 2) + Math.PI / 4;
    const outerX = geometry.centerX + Math.cos(angle) * radius;
    const outerY = geometry.centerY + Math.sin(angle) * radius;
    const innerX = geometry.centerX + Math.cos(angle) * (radius - tickLength);
    const innerY = geometry.centerY + Math.sin(angle) * (radius - tickLength);
    context.moveTo(innerX, innerY).lineTo(outerX, outerY).stroke({
      alpha: 0.72,
      color,
      width: 1.5,
    });
  }
}

function semanticSourcePulseBodyContextFor(node) {
  const geometry = semanticCellGeometry(node);
  return new GraphicsContext()
    .circle(geometry.centerX, geometry.centerY, geometry.radius + 2)
    .fill({ alpha: 0.2, color: node.color })
    .circle(geometry.centerX, geometry.centerY, geometry.radius)
    .fill({ alpha: 0.72, color: node.color })
    .circle(
      geometry.centerX - geometry.radius * 0.22,
      geometry.centerY - geometry.radius * 0.25,
      Math.max(1.8, geometry.radius * 0.26),
    )
    .fill({ alpha: 0.9, color: 0xecfeff })
    .circle(geometry.centerX, geometry.centerY, geometry.radius + 0.7)
    .stroke({ alpha: 0.68, color: 0xecfeff, width: 1.2 });
}

function workflowNodeShadowContextFor(node) {
  const { glass } = workspaceNeonTheme.workflow;
  const inactive = node.status === "not_started";
  const glowColor = inactive ? 0x8b8b8b : node.color;
  const compactScale = 1;
  const outerAlpha = (inactive ? 0.008 : 0.02) * compactScale;
  const midAlpha = (inactive ? 0.018 : 0.055) * compactScale;
  const innerAlpha = (inactive ? 0.044 : 0.16) * compactScale;
  return new GraphicsContext()
    .roundRect(glass.shadowOffsetX, glass.shadowOffsetY, node.width, node.height, glass.radius)
    .fill({ alpha: glass.shadowAlpha, color: glass.shadowColor })
    .roundRect(-10, -10, node.width + 20, node.height + 20, glass.radius + 7)
    .stroke({ alpha: outerAlpha, color: glowColor, width: 14 * compactScale })
    .roundRect(-7, -7, node.width + 14, node.height + 14, glass.radius + 5)
    .stroke({ alpha: midAlpha, color: glowColor, width: 9 * compactScale })
    .roundRect(-4, -4, node.width + 8, node.height + 8, glass.radius + 3)
    .stroke({ alpha: innerAlpha, color: glowColor, width: 5 * compactScale });
}

function semanticNodeShadowContextFor(node) {
  if (node.semanticRole === "source_pulse") {
    return semanticSourcePulseShadowContextFor(node);
  }
  const style = semanticCellRenderStyle(node);
  const geometry = semanticCellGeometry(node);
  const seed = stableUnitHash(node.id);
  const context = new GraphicsContext()
    .circle(geometry.centerX + 4, geometry.centerY + 6, geometry.radius + 2)
    .fill({ alpha: 0.12, color: 0x000000 })
    .circle(geometry.centerX, geometry.centerY, geometry.radius + 22)
    .fill({ alpha: style.auraAlpha * 0.022, color: node.color })
    .circle(geometry.centerX, geometry.centerY, geometry.radius + 14)
    .fill({ alpha: style.auraAlpha * 0.046, color: node.color })
    .circle(geometry.centerX, geometry.centerY, geometry.radius + 7)
    .fill({ alpha: style.auraAlpha * 0.05, color: node.color });
  drawOrganicCellPath(context, { ...geometry, radius: geometry.radius + 5 }, seed).stroke({
    alpha: style.auraAlpha * 0.12,
    color: node.color,
    width: style.auraWidth + 2.2,
  });
  return context;
}

function semanticSourcePulseShadowContextFor(node) {
  const geometry = semanticCellGeometry(node);
  return new GraphicsContext()
    .circle(geometry.centerX, geometry.centerY, geometry.radius + 9)
    .fill({ alpha: 0.045, color: node.color })
    .circle(geometry.centerX, geometry.centerY, geometry.radius + 5)
    .fill({ alpha: 0.085, color: node.color });
}

function workflowNodeOutlineContextFor(node, state) {
  const style = nodeOutlineStyleFor(state);
  return new GraphicsContext()
    .roundRect(
      -style.inset,
      -style.inset,
      node.width + style.inset * 2,
      node.height + style.inset * 2,
      style.radius,
    )
    .stroke({ alpha: style.alpha, color: style.color, width: style.width });
}

function semanticNodeOutlineContextFor(node, state) {
  const style = nodeOutlineStyleFor(state);
  const geometry = semanticCellGeometry(node);
  return new GraphicsContext()
    .circle(geometry.centerX, geometry.centerY, geometry.radius + style.inset)
    .stroke({ alpha: style.alpha, color: style.color, width: style.width });
}

function semanticCellGeometry(node) {
  const radius = Math.max(
    1,
    Math.min(node.width, node.height) / 2 - workspaceNeonTheme.semantic.cell.membraneRadiusInset,
  );
  return {
    centerX: node.width / 2,
    centerY: node.height / 2,
    radius,
  };
}

function semanticCellRenderStyle(node) {
  const { dismissed, promoted, ...base } = workspaceNeonTheme.semantic.cell;
  if (node.semanticRole === "preview") {
    return {
      ...base,
      auraAlpha: base.auraAlpha * 0.64,
      cytoplasmAlpha: base.cytoplasmAlpha * 0.58,
      innerTintAlpha: base.innerTintAlpha * 0.72,
      membraneAlpha: base.membraneAlpha * 0.72,
      nucleusAlpha: base.nucleusAlpha * 0.82,
      organelleAlpha: base.organelleAlpha * 0.7,
    };
  }
  if (node.dismissed) {
    return { ...base, ...dismissed };
  }
  if (node.promoted) {
    return { ...base, ...promoted };
  }
  return base;
}

function drawOrganicCellPath(context, geometry, seed) {
  const points = [];
  for (let index = 0; index < cellPathSegments; index += 1) {
    points.push(organicCellPoint(geometry, index, seed));
  }
  const first = midpoint(points[points.length - 1], points[0]);
  context.moveTo(first.x, first.y);
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const mid = midpoint(current, next);
    context.quadraticCurveTo(current.x, current.y, mid.x, mid.y);
  }
  return context.closePath();
}

function midpoint(first, second) {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

function organicCellPoint({ centerX, centerY, radius }, index, seed) {
  const angle = (index / cellPathSegments) * cellTau;
  const wobble =
    Math.sin(angle * 3 + seed * cellTau) * 3 +
    Math.sin(angle * 5 - seed * cellTau * 0.73) * 2.1 +
    Math.sin(angle * 2 + seed * cellTau * 1.31) * 1.2;
  const pointRadius = radius + wobble;
  return {
    x: centerX + Math.cos(angle) * pointRadius,
    y: centerY + Math.sin(angle) * pointRadius,
  };
}

function drawSemanticNucleus(context, node, geometry, seed, style) {
  const angle = seed * cellTau + 0.6;
  const nucleusX = geometry.centerX + Math.cos(angle) * geometry.radius * 0.16;
  const nucleusY = geometry.centerY + Math.sin(angle) * geometry.radius * 0.14;
  const nucleusRadius = geometry.radius * 0.25;
  context
    .circle(nucleusX, nucleusY, nucleusRadius * 1.44)
    .fill({ alpha: style.nucleusAlpha * 0.1, color: node.color })
    .circle(nucleusX, nucleusY, nucleusRadius)
    .stroke({ alpha: style.nucleusAlpha * 0.82, color: node.color, width: 1.3 })
    .circle(nucleusX, nucleusY, nucleusRadius * 0.43)
    .fill({ alpha: style.nucleusAlpha * 0.72, color: 0xecfeff });
}

function drawSemanticOrganelles(context, node, geometry, seed, style) {
  const organelleRadii = [0.055, 0.045, 0.05, 0.04];
  for (let index = 0; index < organelleRadii.length; index += 1) {
    const angle = seed * cellTau + index * 1.71 + 0.4;
    const distance = geometry.radius * (0.38 + ((index * 17) % 19) / 100);
    context
      .circle(
        geometry.centerX + Math.cos(angle) * distance,
        geometry.centerY + Math.sin(angle) * distance,
        Math.max(1.6, geometry.radius * organelleRadii[index]),
      )
      .fill({ alpha: style.organelleAlpha, color: index % 2 === 0 ? node.color : 0xecfeff });
  }
}

function stableUnitHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x100000000;
}

export function drawDiagnosticDiamond(target, centerX, centerY, severity) {
  const color = diagnosticMarkerColors[severity] ?? diagnosticMarkerColors.error;
  const radius = 10;
  target
    .moveTo(centerX, centerY - radius)
    .lineTo(centerX + radius, centerY)
    .lineTo(centerX, centerY + radius)
    .lineTo(centerX - radius, centerY)
    .closePath()
    .fill({ alpha: 0.96, color })
    .moveTo(centerX, centerY - radius)
    .lineTo(centerX + radius, centerY)
    .lineTo(centerX, centerY + radius)
    .lineTo(centerX - radius, centerY)
    .closePath()
    .stroke({ alpha: 0.95, color: 0x111827, width: 1.5 })
    .moveTo(centerX, centerY - 4.5)
    .lineTo(centerX, centerY + 2.5)
    .stroke({ alpha: 0.95, color: 0x111827, width: 1.7 })
    .circle(centerX, centerY + 6, 1.5)
    .fill({ alpha: 0.95, color: 0x111827 });
}

export function countNodeOutlineGraphics(nodeOutlines) {
  let count = 0;
  for (const outlines of nodeOutlines.values()) {
    if (outlines.hoverOutline) {
      count += 1;
    }
    if (outlines.selectedOutline) {
      count += 1;
    }
  }
  return count;
}

function nodeOutlineStyleFor(state) {
  const style = workspaceNeonTheme.foundation.selection[state];
  if (!style) {
    throw new Error(`unknown workflow graph node outline state: ${state}`);
  }
  return style;
}
