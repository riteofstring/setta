import { FillGradient, GraphicsContext } from "pixi.js";

import { rendererNodeLayer } from "./pixi-renderer-layers";
import { workspaceNeonTheme } from "./workspace-neon-theme";

const legacyNodeBodyStyle = {
  radius: 8,
  fillAlpha: 0.92,
  strokeAlpha: 0.55,
  strokeColor: 0xffffff,
  strokeWidth: 1.5,
};

const legacyNodeShadowStyle = {
  alpha: 0.14,
  color: 0x000000,
  offsetX: 7,
  offsetY: 9,
  radius: 8,
};

const diagnosticMarkerColors = {
  error: 0xfb7185,
  warning: 0xfbbf24,
};

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
      rendererNodeLayer(node);
      const style = nodeOutlineStyleFor(state);
      nodeOutlineContextCount += 1;
      return new GraphicsContext()
        .roundRect(
          -style.inset,
          -style.inset,
          node.width + style.inset * 2,
          node.height + style.inset * 2,
          style.radius,
        )
        .stroke({ alpha: style.alpha, color: style.color, width: style.width });
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
  target
    .roundRect(-7, -7, node.width + 14, node.height + 14, 12)
    .stroke({ alpha: style.ringAlpha, color, width: style.ringWidth })
    .circle(10, -3, style.dotRadius)
    .fill({ alpha: style.dotAlpha, color })
    .circle(10, -3, style.outerRadius)
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
  return new GraphicsContext()
    .roundRect(0, 0, node.width, node.height, legacyNodeBodyStyle.radius)
    .fill({ alpha: legacyNodeBodyStyle.fillAlpha, color: node.color })
    .roundRect(0, 0, node.width, node.height, legacyNodeBodyStyle.radius)
    .stroke({
      alpha: legacyNodeBodyStyle.strokeAlpha,
      color: legacyNodeBodyStyle.strokeColor,
      width: legacyNodeBodyStyle.strokeWidth,
    });
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
  return new GraphicsContext()
    .roundRect(
      legacyNodeShadowStyle.offsetX,
      legacyNodeShadowStyle.offsetY,
      node.width,
      node.height,
      legacyNodeShadowStyle.radius,
    )
    .fill({ alpha: legacyNodeShadowStyle.alpha, color: legacyNodeShadowStyle.color });
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
