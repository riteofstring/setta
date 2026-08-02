import { describe, expect, it } from "vitest";
import {
  isSameOrDescendantBrowserPath,
  normalizeFileBrowserPathForComparison,
} from "./fileBrowserPathRelation";

describe("fileBrowserPathRelation", () => {
  it("normalizes separators and trailing slashes", () => {
    expect(normalizeFileBrowserPathForComparison("C:\\tmp\\folder\\")).toBe(
      "C:/tmp/folder",
    );
    expect(normalizeFileBrowserPathForComparison("/tmp/folder///")).toBe(
      "/tmp/folder",
    );
  });

  it("detects ancestor and same-path relationships", () => {
    expect(
      isSameOrDescendantBrowserPath("/tmp/folder/file.txt", "/tmp/folder"),
    ).toBe(true);
    expect(isSameOrDescendantBrowserPath("/tmp/folder", "/tmp/folder")).toBe(
      true,
    );
    expect(isSameOrDescendantBrowserPath("/tmp/folder", "/")).toBe(true);
    expect(isSameOrDescendantBrowserPath("/tmp/other", "/tmp/folder")).toBe(
      false,
    );
    expect(isSameOrDescendantBrowserPath("C:/tmp/folder", "C:/")).toBe(true);
    expect(isSameOrDescendantBrowserPath("D:/tmp/folder", "C:/")).toBe(false);
  });
});
