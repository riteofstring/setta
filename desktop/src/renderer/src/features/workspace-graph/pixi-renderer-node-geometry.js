import { FillGradient, GraphicsContext } from "pixi.js";

import { rendererNodeLayer } from "./pixi-renderer-layers";
import { workspaceNeonTheme } from "./workspace-neon-theme";

const diagnosticMarkerColors = {
  error: 0xfb7185,
  warning: 0xfbbf24,
};

const cellPathSegments = 22;
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

export function drawWorkspaceGrid(grid) {
  const { coarse, extent, fine } = workspaceNeonTheme.foundation.grid;
  grid.clear();
  for (let position = -extent; position <= extent; position += fine.step) {
    grid.moveTo(position, -extent).lineTo(position, extent);
    grid.moveTo(-extent, position).lineTo(extent, position);
  }
  grid.stroke({
    alpha: fine.alpha,
    color: fine.color,
    pixelLine: true,
    width: fine.width,
  });
  for (let position = -extent; position <= extent; position += coarse.step) {
    grid.moveTo(position, -extent).lineTo(position, extent);
    grid.moveTo(-extent, position).lineTo(extent, position);
  }
  grid.stroke({ alpha: coarse.alpha, color: coarse.color, width: coarse.width });
}

export function drawWorkspaceVignette(target, screenSize, gradient) {
  target.clear();
  target.rect(0, 0, screenSize.width, screenSize.height).fill(gradient);
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
  if (rendererNodeLayer(node) !== "semantic" || !node.activity || node.activity.count <= 0) {
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

function activityMarkerStyle(active) {
  if (active) {
    return {
      dotAlpha: 0.96,
      dotRadius: 7,
      outerAlpha: 0.5,
      outerRadius: 10,
      ringAlpha: 0.62,
      ringWidth: 3,
    };
  }
  return {
    dotAlpha: 0.74,
    dotRadius: 5.5,
    outerAlpha: 0.25,
    outerRadius: 8,
    ringAlpha: 0.28,
    ringWidth: 2,
  };
}

function workflowNodeBodyContextFor(node) {
  const { glass } = workspaceNeonTheme.workflow;
  const accentColor = node.color;
  return new GraphicsContext()
    .roundRect(0, 0, node.width, node.height, glass.radius)
    .fill({ alpha: 1, color: glass.bodyBottom })
    .roundRect(1, 1, node.width - 2, Math.max(1, node.height * 0.52), glass.radius - 1)
    .fill({ alpha: 0.72, color: glass.bodyTop })
    .roundRect(2, 2, node.width - 4, Math.max(1, node.height * 0.28), glass.radius - 2)
    .fill({ alpha: glass.highlightAlpha, color: glass.highlightColor })
    .roundRect(0, 0, node.width, node.height, glass.radius)
    .stroke({
      alpha: glass.strokeAlpha,
      color: accentColor,
      width: glass.strokeWidth,
    });
}

function semanticNodeBodyContextFor(node) {
  const style = semanticCellRenderStyle(node);
  const geometry = semanticCellGeometry(node);
  const seed = stableUnitHash(node.id);
  const context = new GraphicsContext();
  drawOrganicCellPath(context, geometry, seed)
    .fill({ alpha: style.cytoplasmAlpha, color: style.cytoplasmColor })
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
  drawSemanticNucleus(context, node, geometry, seed, style);
  drawSemanticOrganelles(context, node, geometry, seed, style);
  drawOrganicCellPath(context, geometry, seed).stroke({
    alpha: style.membraneAlpha,
    color: node.color,
    width: style.membraneWidth,
  });
  drawOrganicCellPath(context, { ...geometry, radius: geometry.radius - 2.4 }, seed + 0.19).stroke({
    alpha: Math.min(0.38, style.membraneAlpha * 0.42),
    color: 0xecfeff,
    width: 0.8,
  });
  return context;
}

function workflowNodeShadowContextFor(node) {
  const { glass } = workspaceNeonTheme.workflow;
  return new GraphicsContext()
    .roundRect(glass.shadowOffsetX, glass.shadowOffsetY, node.width, node.height, glass.radius)
    .fill({ alpha: glass.shadowAlpha, color: glass.shadowColor })
    .roundRect(-5, -5, node.width + 10, node.height + 10, glass.radius + 4)
    .stroke({ alpha: 0.18, color: node.color, width: 6 });
}

function semanticNodeShadowContextFor(node) {
  const style = semanticCellRenderStyle(node);
  const geometry = semanticCellGeometry(node);
  return new GraphicsContext()
    .circle(geometry.centerX + 4, geometry.centerY + 6, geometry.radius + 2)
    .fill({ alpha: 0.18, color: 0x000000 })
    .circle(geometry.centerX, geometry.centerY, geometry.radius + 8)
    .stroke({ alpha: style.auraAlpha * 0.58, color: node.color, width: style.auraWidth + 4 })
    .circle(geometry.centerX, geometry.centerY, geometry.radius + 4)
    .stroke({ alpha: style.auraAlpha, color: node.color, width: style.auraWidth });
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
  if (node.dismissed) {
    return { ...base, ...dismissed };
  }
  if (node.promoted) {
    return { ...base, ...promoted };
  }
  return base;
}

function drawOrganicCellPath(context, geometry, seed) {
  const first = organicCellPoint(geometry, 0, seed);
  context.moveTo(first.x, first.y);
  for (let index = 1; index <= cellPathSegments; index += 1) {
    const point = organicCellPoint(geometry, index, seed);
    context.lineTo(point.x, point.y);
  }
  return context.closePath();
}

function organicCellPoint({ centerX, centerY, radius }, index, seed) {
  const angle = (index / cellPathSegments) * cellTau;
  const wobble =
    Math.sin(angle * 3 + seed * cellTau) * 1.25 + Math.sin(angle * 5 - seed * cellTau * 0.73) * 0.9;
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
    .stroke({ alpha: style.nucleusAlpha, color: node.color, width: 1.6 })
    .circle(nucleusX, nucleusY, nucleusRadius * 0.43)
    .fill({ alpha: style.nucleusAlpha * 0.88, color: 0xecfeff });
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
