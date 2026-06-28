import { GraphicsContext } from "pixi.js";

import {
  resolveWorkflowNodeVisualState,
  workflowNodeVisualFingerprint,
} from "./pixi-renderer-visual-state";

const nodeBodyGraphicFingerprints = new WeakMap();

const nodeBodyStyle = {
  radius: 8,
};

const nodeShadowStyle = {
  alpha: 0.14,
  color: 0x000000,
  offsetX: 7,
  offsetY: 9,
  radius: 8,
};

const nodeOutlineStyles = {
  hovered: {
    alpha: 0.42,
    color: 0xffffff,
    inset: 5,
    radius: 12,
    width: 2,
  },
  selected: {
    alpha: 0.95,
    color: 0xffffff,
    inset: 5,
    radius: 12,
    width: 3,
  },
};

const diagnosticMarkerColors = {
  error: 0xfb7185,
  warning: 0xfbbf24,
};

const activityMarkerColors = {
  blocked: 0xfb7185,
  debugging: 0xfbbf24,
  editing: 0x2dd4bf,
  exploring: 0x38bdf8,
  validating: 0x22c55e,
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
      const visualState = resolveWorkflowNodeVisualState(node);
      nodeBodyContextCount += 1;
      const context = new GraphicsContext()
        .roundRect(0, 0, node.width, node.height, nodeBodyStyle.radius)
        .fill({ alpha: visualState.channels.bodyFillAlpha, color: visualState.channels.bodyFill })
        .roundRect(0, 0, node.width, node.height, nodeBodyStyle.radius)
        .stroke({
          alpha: visualState.channels.bodyStrokeAlpha,
          color: visualState.channels.bodyStroke,
          width: visualState.channels.bodyStrokeWidth,
        });
      if (visualState.channels.statusAccentAlpha > 0) {
        context
          .roundRect(
            10,
            7,
            Math.min(visualState.channels.statusAccentWidth, Math.max(0, node.width - 20)),
            visualState.channels.statusAccentHeight,
            2,
          )
          .fill({
            alpha: visualState.channels.statusAccentAlpha,
            color: visualState.channels.statusAccent,
          });
      }
      return context;
    },
    nodeOutlineContextFor: (node, state) => {
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
      nodeShadowContextCount += 1;
      return new GraphicsContext()
        .roundRect(
          nodeShadowStyle.offsetX,
          nodeShadowStyle.offsetY,
          node.width,
          node.height,
          nodeShadowStyle.radius,
        )
        .fill({ alpha: nodeShadowStyle.alpha, color: nodeShadowStyle.color });
    },
  };
}

export function syncNodeBodyGraphic(target, node, nodeGeometry) {
  const fingerprint = workflowNodeVisualFingerprint(node);
  if (nodeBodyGraphicFingerprints.get(target) === fingerprint) {
    return false;
  }
  target.context = nodeGeometry.nodeBodyContextFor(node);
  nodeBodyGraphicFingerprints.set(target, fingerprint);
  return true;
}

export function drawWorkspaceGrid(grid) {
  grid.clear();
  for (let position = -2000; position <= 2000; position += 48) {
    grid.moveTo(position, -2000).lineTo(position, 2000);
    grid.moveTo(-2000, position).lineTo(2000, position);
  }
  grid.stroke({ alpha: 0.22, color: 0x334155, pixelLine: true, width: 1 });
  for (let position = -2000; position <= 2000; position += 240) {
    grid.moveTo(position, -2000).lineTo(position, 2000);
    grid.moveTo(-2000, position).lineTo(2000, position);
  }
  grid.stroke({ alpha: 0.28, color: 0x64748b, width: 1.5 });
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
  if (!node.activity || node.activity.count <= 0) {
    target.visible = false;
    return;
  }
  target.visible = true;
  const color = activityMarkerColors[node.activity.kind] ?? 0x38bdf8;
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
  const style = nodeOutlineStyles[state];
  if (!style) {
    throw new Error(`unknown workflow graph node outline state: ${state}`);
  }
  return style;
}
