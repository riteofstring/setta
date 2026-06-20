import { describe, expect, test } from "vitest";

import { initialNodes } from "./pixi-renderer-fixture";
import { createNodeSpatialIndex } from "./pixi-renderer-spatial-index";

describe("workflow graph spatial index", () => {
  test("build returns all nodes for a full-bounds query", () => {
    const nodes = initialNodes.map((node) => ({ ...node }));
    const index = createNodeSpatialIndex(nodes);

    expect(index.count()).toBe(nodes.length);
    expect(index.search(fullBounds(nodes)).map((node) => node.id)).toEqual(
      nodes.map((node) => node.id),
    );
  });

  test("search matches a naive node-bounds scan for deterministic fixture queries", () => {
    const nodes = initialNodes.map((node) => ({ ...node }));
    const index = createNodeSpatialIndex(nodes);
    const queries = [
      { height: 140, width: 260, x: -410, y: -180 },
      { height: 120, width: 300, x: -140, y: -80 },
      { height: 220, width: 240, x: 80, y: 80 },
      { height: 40, width: 40, x: 900, y: 900 },
    ];

    for (const query of queries) {
      expect(index.search(query).map((node) => node.id)).toEqual(naiveSearch(nodes, query));
      expect([...index.searchIds(query)]).toEqual(naiveSearch(nodes, query));
    }
  });

  test("point picking preserves topmost node order when bounds overlap", () => {
    const nodes = [
      node("bottom", 0, 0, 120, 90),
      node("middle", 20, 10, 120, 90),
      node("top", 40, 20, 120, 90),
    ];
    const index = createNodeSpatialIndex(nodes);

    expect(index.pick({ x: 60, y: 40 })?.id).toBe("top");
  });

  test("update removes stale bounds and inserts new bounds after a node moves", () => {
    const nodes = initialNodes.map((candidate) => ({ ...candidate }));
    const index = createNodeSpatialIndex(nodes);
    const source = requireTestNode(nodes, "source");
    const oldBounds = boundsForNode(source);

    source.x = 820;
    source.y = 640;
    index.update(source);

    expect(index.search(oldBounds).map((node) => node.id)).not.toContain("source");
    expect(
      index.pick({ x: source.x + source.width / 2, y: source.y + source.height / 2 })?.id,
    ).toBe("source");
  });

  test("unknown-node update fails specifically", () => {
    const index = createNodeSpatialIndex(initialNodes.map((node) => ({ ...node })));

    expect(() => index.update(node("missing", 0, 0, 100, 80))).toThrow(
      "spatial index update targets unknown node: missing",
    );
  });

  test("large synthetic localized queries match naive scans while reducing candidates", () => {
    const nodes = syntheticNodes(40, 25);
    const index = createNodeSpatialIndex(nodes);
    const query = { height: 110, width: 150, x: 1950, y: 1180 };
    const expectedIds = naiveSearch(nodes, query);
    const actualIds = index.search(query).map((node) => node.id);

    expect(actualIds).toEqual(expectedIds);
    expect(actualIds.length).toBeGreaterThan(0);
    expect(actualIds.length).toBeLessThan(nodes.length / 20);
  });
});

function node(id, x, y, width, height) {
  return {
    color: 0xffffff,
    height,
    id,
    label: id,
    width,
    x,
    y,
  };
}

function syntheticNodes(columns, rows) {
  const nodes = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      nodes.push(node(`node-${row}-${column}`, column * 180, row * 150, 96, 72));
    }
  }
  return nodes;
}

function fullBounds(nodes) {
  const left = Math.min(...nodes.map((candidate) => candidate.x));
  const top = Math.min(...nodes.map((candidate) => candidate.y));
  const right = Math.max(...nodes.map((candidate) => candidate.x + candidate.width));
  const bottom = Math.max(...nodes.map((candidate) => candidate.y + candidate.height));
  return {
    height: bottom - top,
    width: right - left,
    x: left,
    y: top,
  };
}

function boundsForNode(node) {
  return {
    height: node.height,
    width: node.width,
    x: node.x,
    y: node.y,
  };
}

function naiveSearch(nodes, bounds) {
  return nodes
    .filter((candidate) => rectanglesIntersect(bounds, boundsForNode(candidate)))
    .map((candidate) => candidate.id);
}

function rectanglesIntersect(left, right) {
  return (
    left.x <= right.x + right.width &&
    left.x + left.width >= right.x &&
    left.y <= right.y + right.height &&
    left.y + left.height >= right.y
  );
}

function requireTestNode(nodes, nodeId) {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new Error(`missing test node: ${nodeId}`);
  }
  return node;
}
