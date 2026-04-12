import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILE_BROWSER_TYPE_FILTERS,
  filterFileBrowserItemsByTypeFilters,
  getFileBrowserFolderPathLabel,
} from "./fileBrowserTypes";

type TestBrowserItem = {
  fullPath: string;
  mimeType?: string | null;
  name: string;
  size?: number | null;
  type: string;
};

function buildItem(overrides: Partial<TestBrowserItem>): TestBrowserItem {
  return {
    fullPath: "/workspace/file.bin",
    mimeType: "application/octet-stream",
    name: "file.bin",
    size: 1,
    type: "file",
    ...overrides,
  };
}

describe("fileBrowserTypes", () => {
  it("treats text-like data extensions as data filters", () => {
    const items = [
      buildItem({
        fullPath: "/workspace/dataset.csv",
        mimeType: "text/csv",
        name: "dataset.csv",
      }),
      buildItem({
        fullPath: "/workspace/notes.md",
        mimeType: "text/markdown",
        name: "notes.md",
      }),
    ];

    const filtered = filterFileBrowserItemsByTypeFilters(items, {
      ...DEFAULT_FILE_BROWSER_TYPE_FILTERS,
      data: true,
      text: false,
    });

    expect(filtered).toEqual([items[0]]);
  });

  it("routes archive previews through the data filter", () => {
    const archiveItem = buildItem({
      fullPath: "/workspace/bundle.tar.gz",
      name: "bundle.tar.gz",
    });

    const filtered = filterFileBrowserItemsByTypeFilters([archiveItem], {
      ...DEFAULT_FILE_BROWSER_TYPE_FILTERS,
      data: true,
      text: false,
    });

    expect(filtered).toEqual([archiveItem]);
  });

  it("returns the parent folder label for nested browser paths", () => {
    expect(getFileBrowserFolderPathLabel("/workspace/folder/file.txt")).toBe(
      "/workspace/folder",
    );
    expect(getFileBrowserFolderPathLabel("/file.txt")).toBeNull();
  });
});
