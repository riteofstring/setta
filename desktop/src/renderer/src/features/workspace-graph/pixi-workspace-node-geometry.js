import { GraphicsContext } from "pixi.js";

const nodeBodyStyle = {
  radius: 8,
  fillAlpha: 0.92,
  strokeAlpha: 0.55,
  strokeColor: 0xffffff,
  strokeWidth: 1.5,
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

const nodeBodyContexts = new Map();
const nodeShadowContexts = new Map();
const nodeOutlineContexts = new Map();

export function nodeBodyContextFor(node) {
  const key = geometryKey([
    node.width,
    node.height,
    node.color,
    nodeBodyStyle.radius,
    nodeBodyStyle.fillAlpha,
    nodeBodyStyle.strokeColor,
    nodeBodyStyle.strokeAlpha,
    nodeBodyStyle.strokeWidth,
  ]);
  return cachedContext(nodeBodyContexts, key, () =>
    new GraphicsContext()
      .roundRect(0, 0, node.width, node.height, nodeBodyStyle.radius)
      .fill({ alpha: nodeBodyStyle.fillAlpha, color: node.color })
      .roundRect(0, 0, node.width, node.height, nodeBodyStyle.radius)
      .stroke({
        alpha: nodeBodyStyle.strokeAlpha,
        color: nodeBodyStyle.strokeColor,
        width: nodeBodyStyle.strokeWidth,
      }),
  );
}

export function nodeShadowContextFor(node) {
  const key = geometryKey([
    node.width,
    node.height,
    nodeShadowStyle.radius,
    nodeShadowStyle.offsetX,
    nodeShadowStyle.offsetY,
    nodeShadowStyle.alpha,
    nodeShadowStyle.color,
  ]);
  return cachedContext(nodeShadowContexts, key, () =>
    new GraphicsContext()
      .roundRect(
        nodeShadowStyle.offsetX,
        nodeShadowStyle.offsetY,
        node.width,
        node.height,
        nodeShadowStyle.radius,
      )
      .fill({ alpha: nodeShadowStyle.alpha, color: nodeShadowStyle.color }),
  );
}

export function nodeOutlineContextFor(node, state) {
  const style = nodeOutlineStyleFor(state);
  const key = geometryKey([
    node.width,
    node.height,
    style.radius,
    style.inset,
    state,
    style.width,
    style.alpha,
    style.color,
  ]);
  return cachedContext(nodeOutlineContexts, key, () =>
    new GraphicsContext()
      .roundRect(
        -style.inset,
        -style.inset,
        node.width + style.inset * 2,
        node.height + style.inset * 2,
        style.radius,
      )
      .stroke({ alpha: style.alpha, color: style.color, width: style.width }),
  );
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

export function nodeGeometryContextCounts() {
  return {
    body: nodeBodyContexts.size,
    outline: nodeOutlineContexts.size,
    shadow: nodeShadowContexts.size,
  };
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

function cachedContext(cache, key, createContext) {
  const existing = cache.get(key);
  if (existing) {
    return existing;
  }
  const context = createContext();
  cache.set(key, context);
  return context;
}

function nodeOutlineStyleFor(state) {
  const style = nodeOutlineStyles[state];
  if (!style) {
    throw new Error(`unknown workspace node outline state: ${state}`);
  }
  return style;
}

function geometryKey(parts) {
  return parts.join("|");
}
