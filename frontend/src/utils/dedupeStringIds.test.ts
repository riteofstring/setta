import { describe, expect, it } from "vitest";
import { dedupeStringIds } from "./dedupeStringIds";

describe("dedupeStringIds", () => {
  it("removes duplicate ids while preserving first occurrence order", () => {
    expect(dedupeStringIds(["config-a", "config-b", "config-a"])).toEqual([
      "config-a",
      "config-b",
    ]);
  });

  it("returns ids unchanged when all ids are unique", () => {
    expect(dedupeStringIds(["config-c", "config-a", "config-b"])).toEqual([
      "config-c",
      "config-a",
      "config-b",
    ]);
  });
});
