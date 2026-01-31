import { describe, expect, it } from "vitest";
import {
  EDGE_PORT_ROW_GAP,
  EDGE_PORT_ROW_HEIGHT,
  EDGE_STRIP_BASE_HEIGHT,
  getEdgeStripEstimatedHeight,
} from "./edgeStripUtils";

describe("getEdgeStripEstimatedHeight", () => {
  it("returns 0 when there are no ports", () => {
    expect(getEdgeStripEstimatedHeight(0, 0)).toBe(0);
  });

  it("uses the larger of input/output port counts", () => {
    const rows = 3;
    const expected =
      EDGE_STRIP_BASE_HEIGHT +
      EDGE_PORT_ROW_HEIGHT * rows +
      EDGE_PORT_ROW_GAP * (rows - 1);
    expect(getEdgeStripEstimatedHeight(1, rows)).toBe(expected);
  });

  it("accounts for row gaps when multiple rows exist", () => {
    const rows = 2;
    const expected =
      EDGE_STRIP_BASE_HEIGHT +
      EDGE_PORT_ROW_HEIGHT * rows +
      EDGE_PORT_ROW_GAP * (rows - 1);
    expect(getEdgeStripEstimatedHeight(0, rows)).toBe(expected);
  });
});
