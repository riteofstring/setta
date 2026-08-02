import { describe, expect, it } from "vitest";
import {
  isSameOrDescendantBrowserPath,
  normalizeFileBrowserPathForComparison,
} from "./fileBrowserPathRelation";

describe("fileBrowserPathRelation (perf)", () => {
  it("evaluates large path sets without interactive regressions", () => {
    const paths: string[] = [];
    for (let i = 0; i < 120_000; i += 1) {
      paths.push(`/workspace/folder-${i % 50}/nested-${i}/file-${i}.csv`);
    }

    const start = performance.now();
    let matchCount = 0;
    for (const path of paths) {
      const normalized = normalizeFileBrowserPathForComparison(path);
      if (isSameOrDescendantBrowserPath(normalized, "/workspace/folder-7")) {
        matchCount += 1;
      }
    }
    const elapsedMs = performance.now() - start;

    expect(matchCount).toBeGreaterThan(0);
    // Guardrail threshold for algorithmic regressions.
    expect(elapsedMs).toBeLessThan(650);
  });
});
