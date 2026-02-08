import { describe, expect, it } from "vitest";
import { filterFileBrowserFolderItems } from "./fileBrowserFilter";

describe("fileBrowserFilter (perf)", () => {
  it("filters a large flat folder listing fast enough for interactive typing", () => {
    // Perf smoke test with a generous threshold to avoid CI flakiness.
    // The Browser section can render hundreds to thousands of items; filtering must stay responsive.
    const items: Array<{
      name: string;
      fullPath: string;
      type: "folder" | "file";
    }> = [];

    for (let i = 0; i < 50_000; i += 1) {
      items.push({
        name: `file-${i}.txt`,
        fullPath: `/root/file-${i}.txt`,
        type: "file",
      });
    }

    const start = performance.now();
    const results = filterFileBrowserFolderItems(items, "file-49999");
    const elapsedMs = performance.now() - start;

    expect(results.map((x) => x.name)).toEqual(["file-49999.txt"]);

    // This threshold is intentionally high; it exists to catch accidental
    // algorithmic regressions (e.g., O(n^2) changes), not micro-optimizations.
    expect(elapsedMs).toBeLessThan(1500);
  });
});

