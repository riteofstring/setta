import { describe, expect, it } from "vitest";
import { resolveFileBrowserPreviewKind } from "./fileBrowserUniversalPreviewState";

describe("FileBrowserUniversalPreview kind resolution (perf)", () => {
  it("classifies large batches within interactive budget", () => {
    const samples: Array<{ filePath: string; fileName: string }> = [];
    for (let i = 0; i < 120_000; i += 1) {
      const mod = i % 6;
      let suffix = ".bin";
      if (mod === 0) {
        suffix = ".csv";
      } else if (mod === 1) {
        suffix = ".png";
      } else if (mod === 2) {
        suffix = ".md";
      } else if (mod === 3) {
        suffix = ".pdf";
      } else if (mod === 4) {
        suffix = ".zip";
      }
      const fileName = `entry-${i}${suffix}`;
      samples.push({
        fileName,
        filePath: `/workspace/folder-${i % 40}/${fileName}`,
      });
    }

    const start = performance.now();
    let nonOtherCount = 0;
    for (const sample of samples) {
      const kind = resolveFileBrowserPreviewKind(sample);
      if (kind !== "other") {
        nonOtherCount += 1;
      }
    }
    const elapsedMs = performance.now() - start;

    expect(nonOtherCount).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(700);
  });
});
