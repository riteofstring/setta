import type { WorkspaceGraphPoint } from "./geometry.js";
import type { WorkspaceGraphPortSide } from "./types.js";

export type WorkspaceGraphObstacle = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}>;

export type WorkspaceGraphEndpoint = Readonly<{
  point: WorkspaceGraphPoint;
  side: WorkspaceGraphPortSide;
}>;

type Candidate = { id: number; cost: number; score: number };
type Grid = {
  xs: number[];
  ys: number[];
  obstacles: readonly WorkspaceGraphObstacle[];
};

const CLEARANCE = 8;
const BEND_COST = 24;

function distance(a: WorkspaceGraphPoint, b: WorkspaceGraphPoint): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function contains(
  rect: WorkspaceGraphObstacle,
  point: WorkspaceGraphPoint,
): boolean {
  return (
    point.x > rect.left &&
    point.x < rect.right &&
    point.y > rect.top &&
    point.y < rect.bottom
  );
}

function crosses(
  a: WorkspaceGraphPoint,
  b: WorkspaceGraphPoint,
  rect: WorkspaceGraphObstacle,
): boolean {
  if (a.y === b.y) {
    return (
      a.y > rect.top &&
      a.y < rect.bottom &&
      Math.max(a.x, b.x) > rect.left &&
      Math.min(a.x, b.x) < rect.right
    );
  }
  return (
    a.x > rect.left &&
    a.x < rect.right &&
    Math.max(a.y, b.y) > rect.top &&
    Math.min(a.y, b.y) < rect.bottom
  );
}

function escape(
  port: WorkspaceGraphEndpoint,
  obstacles: readonly WorkspaceGraphObstacle[],
): WorkspaceGraphPoint {
  const direction = port.side === "right" ? 1 : -1;
  let x = port.point.x + direction * CLEARANCE;
  for (const rect of obstacles) {
    if (!contains(rect, port.point)) continue;
    x =
      direction > 0
        ? Math.max(x, rect.right + CLEARANCE)
        : Math.min(x, rect.left - CLEARANCE);
  }
  return { x, y: port.point.y };
}

function coordinates(start: number, end: number, bounds: number[]): number[] {
  const edges = [...new Set(bounds)].sort((a, b) => a - b);
  const values = [start, end];
  for (const [i, edge] of edges.entries()) {
    values.push(edge - CLEARANCE, edge + CLEARANCE);
    if (i > 0) values.push((edge + edges[i - 1]!) / 2);
  }
  return [...new Set(values)].sort((a, b) => a - b);
}

function push(queue: Candidate[], entry: Candidate): void {
  let index = queue.length;
  queue.push(entry);
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (queue[parent]!.score <= entry.score) break;
    queue[index] = queue[parent]!;
    index = parent;
  }
  queue[index] = entry;
}

function pop(queue: Candidate[]): Candidate {
  const first = queue[0]!;
  const last = queue.pop()!;
  if (!queue.length) return first;
  let index = 0;
  while (index * 2 + 1 < queue.length) {
    let child = index * 2 + 1;
    if (
      child + 1 < queue.length &&
      queue[child + 1]!.score < queue[child]!.score
    )
      child++;
    if (last.score <= queue[child]!.score) break;
    queue[index] = queue[child]!;
    index = child;
  }
  queue[index] = last;
  return first;
}

function pointAt(grid: Grid, id: number): WorkspaceGraphPoint {
  const node = Math.floor(id / 2);
  return {
    x: grid.xs[node % grid.xs.length]!,
    y: grid.ys[Math.floor(node / grid.xs.length)]!,
  };
}

function neighbors(grid: Grid, id: number): number[] {
  const node = Math.floor(id / 2);
  const x = node % grid.xs.length;
  const y = Math.floor(node / grid.xs.length);
  const result: number[] = [];
  if (x > 0) result.push((node - 1) * 2);
  if (x + 1 < grid.xs.length) result.push((node + 1) * 2);
  if (y > 0) result.push((node - grid.xs.length) * 2 + 1);
  if (y + 1 < grid.ys.length) result.push((node + grid.xs.length) * 2 + 1);
  return result;
}

function retrace(
  grid: Grid,
  previous: Map<number, number>,
  end: number,
): WorkspaceGraphPoint[] {
  const points = [pointAt(grid, end)];
  let id = end;
  while (previous.has(id)) {
    id = previous.get(id)!;
    points.push(pointAt(grid, id));
  }
  return points.reverse();
}

function visit(
  grid: Grid,
  current: Candidate,
  target: WorkspaceGraphPoint,
  state: {
    queue: Candidate[];
    costs: Map<number, number>;
    previous: Map<number, number>;
  },
): void {
  const from = pointAt(grid, current.id);
  for (const id of neighbors(grid, current.id)) {
    const to = pointAt(grid, id);
    if (grid.obstacles.some((rect) => crosses(from, to, rect))) continue;
    const cost =
      current.cost +
      distance(from, to) +
      (id % 2 === current.id % 2 ? 0 : BEND_COST);
    if (cost >= (state.costs.get(id) ?? Infinity)) continue;
    state.costs.set(id, cost);
    state.previous.set(id, current.id);
    push(state.queue, { id, cost, score: cost + distance(to, target) });
  }
}

function search(
  grid: Grid,
  start: WorkspaceGraphPoint,
  target: WorkspaceGraphPoint,
): WorkspaceGraphPoint[] {
  const at = (p: WorkspaceGraphPoint) =>
    (grid.ys.indexOf(p.y) * grid.xs.length + grid.xs.indexOf(p.x)) * 2;
  const first = at(start);
  const end = at(target);
  const state = {
    queue: [{ id: first, cost: 0, score: distance(start, target) }],
    costs: new Map([[first, 0]]),
    previous: new Map<number, number>(),
  };
  while (state.queue.length) {
    const current = pop(state.queue);
    if (current.cost !== state.costs.get(current.id)) continue;
    if (Math.floor(current.id / 2) === end / 2)
      return retrace(grid, state.previous, current.id);
    visit(grid, current, target, state);
  }
  return [start, { x: start.x, y: target.y }, target];
}

function straightThrough(
  before: WorkspaceGraphPoint | undefined,
  middle: WorkspaceGraphPoint | undefined,
  end: WorkspaceGraphPoint,
): boolean {
  if (!before || !middle) return false;
  const ax = middle.x - before.x;
  const ay = middle.y - before.y;
  const bx = end.x - middle.x;
  const by = end.y - middle.y;
  return ax * by === ay * bx && ax * bx + ay * by > 0;
}

function simplify(
  points: readonly WorkspaceGraphPoint[],
): WorkspaceGraphPoint[] {
  const result: WorkspaceGraphPoint[] = [];
  for (const point of points) {
    const last = result.at(-1);
    if (last && distance(last, point) === 0) continue;
    const before = result.at(-2);
    if (straightThrough(before, last, point)) result.pop();
    result.push(point);
  }
  return result;
}

function between(
  from: WorkspaceGraphPoint,
  to: WorkspaceGraphPoint,
  amount: number,
): WorkspaceGraphPoint {
  const blend = Math.min(1, amount / distance(from, to));
  return {
    x: from.x + (to.x - from.x) * blend,
    y: from.y + (to.y - from.y) * blend,
  };
}

function roundedPath(points: readonly WorkspaceGraphPoint[]): string {
  const first = points[0]!;
  let path = `M${first.x},${first.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const point = points[i]!;
    const before = points[i - 1]!;
    const after = points[i + 1]!;
    const radius = Math.min(
      6,
      distance(point, before) / 2,
      distance(point, after) / 2,
    );
    const a = between(point, before, radius);
    const b = between(point, after, radius);
    path += ` L${a.x},${a.y} Q${point.x},${point.y} ${b.x},${b.y}`;
  }
  const last = points.at(-1)!;
  return `${path} L${last.x},${last.y}`;
}

export function getWorkspaceGraphRoute(
  source: WorkspaceGraphEndpoint,
  target: WorkspaceGraphEndpoint,
  obstacles: readonly WorkspaceGraphObstacle[],
) {
  const start = escape(source, obstacles);
  const end = escape(target, obstacles);
  const bounds = obstacles.filter(
    (rect) => !contains(rect, start) && !contains(rect, end),
  );
  const grid: Grid = {
    xs: coordinates(
      start.x,
      end.x,
      bounds.flatMap((rect) => [rect.left, rect.right]),
    ),
    ys: coordinates(
      start.y,
      end.y,
      bounds.flatMap((rect) => [rect.top, rect.bottom]),
    ),
    obstacles: bounds,
  };
  const points = simplify([
    source.point,
    ...search(grid, start, end),
    target.point,
  ]);
  const lengths = points
    .slice(1)
    .map((point, i) => distance(points[i]!, point));
  const longest = lengths.indexOf(Math.max(...lengths));
  const a = points[longest]!;
  const b = points[longest + 1]!;
  return {
    points,
    path: roundedPath(points),
    labelX: (a.x + b.x) / 2,
    labelY: (a.y + b.y) / 2,
  };
}
