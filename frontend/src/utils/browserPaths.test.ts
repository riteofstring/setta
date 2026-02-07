import { describe, expect, it } from "vitest";
import { resolvePathWithinRoot } from "./browserPaths";

describe("resolvePathWithinRoot", () => {
  it("treats '/' as a valid root", () => {
    expect(resolvePathWithinRoot("etc", "/")).toBe("/etc");
    expect(resolvePathWithinRoot("/etc", "/")).toBe("/etc");
    expect(resolvePathWithinRoot("../escape", "/")).toBe("/escape");
  });

  it("rejects paths that escape non-root roots", () => {
    expect(resolvePathWithinRoot("../etc", "/tmp/work")).toBeNull();
  });
});

