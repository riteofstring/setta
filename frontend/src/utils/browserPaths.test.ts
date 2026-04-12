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

  it("preserves windows drive roots while resolving descendants", () => {
    expect(resolvePathWithinRoot("repo", "C:/")).toBe("C:/repo");
    expect(resolvePathWithinRoot("C:/repo/src", "C:/")).toBe("C:/repo/src");
    expect(resolvePathWithinRoot("D:/repo", "C:/")).toBeNull();
  });
});
