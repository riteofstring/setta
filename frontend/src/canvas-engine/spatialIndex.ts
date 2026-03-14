type RectBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type CellRange = {
  minColumn: number;
  maxColumn: number;
  minRow: number;
  maxRow: number;
};

export class CanvasEngineSpatialIndex {
  private readonly cellSize: number;

  private readonly boundsById: Map<string, RectBounds>;

  private readonly cellKeysById: Map<string, Set<string>>;

  private readonly idsByCellKey: Map<string, Set<string>>;

  public constructor(options?: { cellSize?: number }) {
    this.cellSize = options?.cellSize ?? 512;
    this.boundsById = new Map();
    this.cellKeysById = new Map();
    this.idsByCellKey = new Map();
  }

  public upsert(id: string, bounds: RectBounds): void {
    this.remove(id);
    this.boundsById.set(id, { ...bounds });

    const keys = this.resolveCoveredCellKeys(bounds);
    this.cellKeysById.set(id, keys);
    for (const key of keys) {
      let ids = this.idsByCellKey.get(key);
      if (!ids) {
        ids = new Set();
        this.idsByCellKey.set(key, ids);
      }
      ids.add(id);
    }
  }

  public remove(id: string): void {
    this.boundsById.delete(id);
    const previousKeys = this.cellKeysById.get(id);
    if (!previousKeys) {
      return;
    }
    for (const key of previousKeys) {
      const ids = this.idsByCellKey.get(key);
      if (!ids) {
        continue;
      }
      ids.delete(id);
      if (ids.size === 0) {
        this.idsByCellKey.delete(key);
      }
    }
    this.cellKeysById.delete(id);
  }

  public clear(): void {
    this.boundsById.clear();
    this.cellKeysById.clear();
    this.idsByCellKey.clear();
  }

  public queryRect(query: RectBounds): string[] {
    if (query.width <= 0 || query.height <= 0) {
      return [];
    }
    const cellRange = this.resolveCellRange(query);
    const candidateIds = new Set<string>();
    for (
      let column = cellRange.minColumn;
      column <= cellRange.maxColumn;
      column += 1
    ) {
      for (let row = cellRange.minRow; row <= cellRange.maxRow; row += 1) {
        const key = this.buildCellKey(column, row);
        const ids = this.idsByCellKey.get(key);
        if (!ids) {
          continue;
        }
        for (const id of ids) {
          candidateIds.add(id);
        }
      }
    }

    const resolved: string[] = [];
    for (const id of candidateIds) {
      const bounds = this.boundsById.get(id);
      if (!bounds) {
        continue;
      }
      if (rectanglesIntersect(query, bounds)) {
        resolved.push(id);
      }
    }
    return resolved;
  }

  public getBoundsById(id: string): RectBounds | null {
    const bounds = this.boundsById.get(id);
    if (!bounds) {
      return null;
    }
    return { ...bounds };
  }

  private resolveCoveredCellKeys(bounds: RectBounds): Set<string> {
    const range = this.resolveCellRange(bounds);
    const keys = new Set<string>();
    for (let column = range.minColumn; column <= range.maxColumn; column += 1) {
      for (let row = range.minRow; row <= range.maxRow; row += 1) {
        keys.add(this.buildCellKey(column, row));
      }
    }
    return keys;
  }

  private resolveCellRange(bounds: RectBounds): CellRange {
    const minX = bounds.x;
    const minY = bounds.y;
    const maxX = bounds.x + Math.max(0, bounds.width);
    const maxY = bounds.y + Math.max(0, bounds.height);
    const minColumn = Math.floor(minX / this.cellSize);
    const maxColumn = Math.floor(maxX / this.cellSize);
    const minRow = Math.floor(minY / this.cellSize);
    const maxRow = Math.floor(maxY / this.cellSize);
    return {
      minColumn,
      maxColumn,
      minRow,
      maxRow,
    };
  }

  private buildCellKey(column: number, row: number): string {
    return `${column}:${row}`;
  }
}

function rectanglesIntersect(left: RectBounds, right: RectBounds): boolean {
  const leftRightEdge = left.x + left.width;
  const rightRightEdge = right.x + right.width;
  const leftBottomEdge = left.y + left.height;
  const rightBottomEdge = right.y + right.height;

  return !(
    leftRightEdge < right.x ||
    rightRightEdge < left.x ||
    leftBottomEdge < right.y ||
    rightBottomEdge < left.y
  );
}
