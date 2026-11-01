import { describe, expect, it } from "vitest";
import { deepEqual } from "./deepEqual.js";

class Point {
  constructor(
    readonly x: number,
    readonly y: number,
  ) {}
}

describe("deepEqual", () => {
  it("compares nested arrays and plain objects by value", () => {
    expect(deepEqual({ a: [1, { b: "c" }] }, { a: [1, { b: "c" }] })).toBe(
      true,
    );
    expect(deepEqual({ a: [1, { b: "c" }] }, { a: [1, { b: "d" }] })).toBe(
      false,
    );
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
  });

  it("treats NaN as equal and functions by identity", () => {
    const listener = () => undefined;
    expect(deepEqual({ v: Number.NaN }, { v: Number.NaN })).toBe(true);
    expect(deepEqual({ onDown: listener }, { onDown: listener })).toBe(true);
    expect(deepEqual({ onDown: listener }, { onDown: () => undefined })).toBe(
      false,
    );
  });

  it("compares maps, sets, dates, and same-class instances", () => {
    expect(
      deepEqual(new Map([["a", { z: 1 }]]), new Map([["a", { z: 1 }]])),
    ).toBe(true);
    expect(deepEqual(new Map([["a", 1]]), new Map([["b", 1]]))).toBe(false);
    expect(deepEqual(new Set([1, 2]), new Set([2, 1]))).toBe(true);
    expect(deepEqual(new Date(5), new Date(5))).toBe(true);
    expect(deepEqual(new Point(1, 2), new Point(1, 2))).toBe(true);
    expect(deepEqual(new Point(1, 2), { x: 1, y: 2 })).toBe(false);
  });
});
