const defaultCellSize = 256;

export function createNodeSpatialIndex(nodes) {
  return new GridNodeSpatialIndex(nodes, defaultCellSize);
}

class GridNodeSpatialIndex {
  constructor(nodes, cellSize) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.itemsById = new Map();
    this.rebuild(nodes);
  }

  count() {
    return this.itemsById.size;
  }

  rebuild(nodes) {
    this.cells.clear();
    this.itemsById.clear();
    nodes.forEach((node, order) => {
      if (this.itemsById.has(node.id)) {
        throw new Error(`duplicate workflow graph node in spatial index: ${node.id}`);
      }
      const item = indexedNodeBounds(node, order);
      this.itemsById.set(node.id, item);
      this.insertItem(item);
    });
  }

  search(bounds) {
    const rectangle = normalizedRectangle(bounds);
    const candidates = new Set();
    for (const key of cellKeysForBounds(rectangle, this.cellSize)) {
      const cell = this.cells.get(key);
      if (!cell) {
        continue;
      }
      for (const item of cell) {
        candidates.add(item);
      }
    }
    return [...candidates]
      .filter((item) => itemIntersectsRectangle(item, rectangle))
      .sort((left, right) => left.order - right.order)
      .map((item) => item.node);
  }

  searchIds(bounds) {
    return new Set(this.search(bounds).map((node) => node.id));
  }

  pick(point) {
    let picked = null;
    const candidates = this.search({
      height: 0,
      width: 0,
      x: point.x,
      y: point.y,
    });
    for (const node of candidates) {
      if (pointInsideNode(point, node)) {
        picked = node;
      }
    }
    return picked;
  }

  update(node) {
    const item = this.itemsById.get(node.id);
    if (!item) {
      throw new Error(`spatial index update targets unknown node: ${node.id}`);
    }
    this.removeItem(item);
    const nextItem = indexedNodeBounds(node, item.order);
    this.itemsById.set(node.id, nextItem);
    this.insertItem(nextItem);
  }

  insertItem(item) {
    const rectangle = itemRectangle(item);
    for (const key of cellKeysForBounds(rectangle, this.cellSize)) {
      let cell = this.cells.get(key);
      if (!cell) {
        cell = new Set();
        this.cells.set(key, cell);
      }
      cell.add(item);
      item.cellKeys.push(key);
    }
  }

  removeItem(item) {
    for (const key of item.cellKeys) {
      const cell = this.cells.get(key);
      if (!cell) {
        continue;
      }
      cell.delete(item);
      if (cell.size === 0) {
        this.cells.delete(key);
      }
    }
  }
}

function indexedNodeBounds(node, order) {
  const minX = node.x;
  const minY = node.y;
  const maxX = node.x + node.width;
  const maxY = node.y + node.height;
  return {
    cellKeys: [],
    id: node.id,
    maxX,
    maxY,
    minX,
    minY,
    node,
    order,
  };
}

function normalizedRectangle(bounds) {
  const minX = Math.min(bounds.x, bounds.x + bounds.width);
  const minY = Math.min(bounds.y, bounds.y + bounds.height);
  const maxX = Math.max(bounds.x, bounds.x + bounds.width);
  const maxY = Math.max(bounds.y, bounds.y + bounds.height);
  return { maxX, maxY, minX, minY };
}

function itemRectangle(item) {
  return {
    maxX: item.maxX,
    maxY: item.maxY,
    minX: item.minX,
    minY: item.minY,
  };
}

function cellKeysForBounds(bounds, cellSize) {
  const minCellX = Math.floor(bounds.minX / cellSize);
  const maxCellX = Math.floor(bounds.maxX / cellSize);
  const minCellY = Math.floor(bounds.minY / cellSize);
  const maxCellY = Math.floor(bounds.maxY / cellSize);
  const keys = [];
  for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      keys.push(`${cellX}:${cellY}`);
    }
  }
  return keys;
}

function itemIntersectsRectangle(item, rectangle) {
  return (
    item.minX <= rectangle.maxX &&
    item.maxX >= rectangle.minX &&
    item.minY <= rectangle.maxY &&
    item.maxY >= rectangle.minY
  );
}

function pointInsideNode(point, node) {
  return (
    point.x >= node.x &&
    point.x <= node.x + node.width &&
    point.y >= node.y &&
    point.y <= node.y + node.height
  );
}
