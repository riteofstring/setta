import { describe, expect, it } from "vitest";
import {
  filterFileBrowserFolderItems,
  fuzzySubsequenceMatch,
  matchesFileBrowserNameFilter,
  matchesFileBrowserPathFilter,
  normalizeFileBrowserPathForFilter,
  parseFileBrowserFilterText,
} from "./fileBrowserFilter";

describe("fileBrowserFilter", () => {
  it("parses empty filter as none", () => {
    expect(parseFileBrowserFilterText("")).toEqual({ kind: "none" });
    expect(parseFileBrowserFilterText("   ")).toEqual({ kind: "none" });
  });

  it("parses path-like filters as path", () => {
    expect(parseFileBrowserFilterText("foo/bar")).toEqual({
      kind: "path",
      needle: "foo/bar",
    });
    expect(parseFileBrowserFilterText("foo\\bar")).toEqual({
      kind: "path",
      needle: "foo/bar",
    });
  });

  it("parses extension glob filters as extension", () => {
    expect(parseFileBrowserFilterText("*.jpg")).toEqual({
      kind: "extension",
      suffix: ".jpg",
    });
    expect(parseFileBrowserFilterText("  *.TAR.GZ ")).toEqual({
      kind: "extension",
      suffix: ".tar.gz",
    });
  });

  it("performs a simple fuzzy subsequence match", () => {
    expect(fuzzySubsequenceMatch("fbp", "filebrowserpane.tsx")).toBe(true);
    expect(fuzzySubsequenceMatch("rdme", "readme.md")).toBe(true);
    expect(fuzzySubsequenceMatch("pbf", "filebrowserpane.tsx")).toBe(false);
  });

  it("matches names via substring or fuzzy", () => {
    const query = parseFileBrowserFilterText("fbp");
    expect(
      matchesFileBrowserNameFilter(query, "filebrowserpane.tsx", "file"),
    ).toBe(true);
    expect(
      matchesFileBrowserNameFilter(query, "filebrowserpane.tsx", "folder"),
    ).toBe(true);
    expect(matchesFileBrowserNameFilter(query, "readme.md", "file")).toBe(
      false,
    );
  });

  it("matches extension glob filters for files only", () => {
    const query = parseFileBrowserFilterText("*.jpg");
    expect(matchesFileBrowserNameFilter(query, "cat.jpg", "file")).toBe(true);
    expect(matchesFileBrowserNameFilter(query, "cat.jpeg", "file")).toBe(false);
    expect(matchesFileBrowserNameFilter(query, "photos.jpg", "folder")).toBe(
      false,
    );
  });

  it("matches normalized paths (slashes, case, double slashes)", () => {
    const query = parseFileBrowserFilterText("IMAGES\\cat.jpg");
    expect(
      matchesFileBrowserPathFilter(
        query,
        normalizeFileBrowserPathForFilter("/root//images/CAT.JPG"),
      ),
    ).toBe(true);
  });

  it("filters flat folder listings (section browser)", () => {
    const items: Array<{
      name: string;
      fullPath: string;
      type: "folder" | "file";
    }> = [
      { name: "images", fullPath: "/root/images", type: "folder" },
      { name: "cat.jpg", fullPath: "/root/images/cat.jpg", type: "file" },
      { name: "cat.png", fullPath: "/root/images/cat.png", type: "file" },
      { name: "README.md", fullPath: "/root/docs/README.md", type: "file" },
    ];

    expect(
      filterFileBrowserFolderItems(items, "*.jpg").map((x) => x.name),
    ).toEqual(["cat.jpg"]);

    expect(
      filterFileBrowserFolderItems(items, "rdme").map((x) => x.name),
    ).toEqual(["README.md"]);
  });
});
