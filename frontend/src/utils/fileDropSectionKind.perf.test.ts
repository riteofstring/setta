import { describe, expect, it } from "vitest";
import { resolveFileDropSectionKind } from "./fileDropSectionKind";

describe("file drop section kind performance", () => {
  it("classifies large file path batches within budget", () => {
    const paths: Array<{ fileName: string; filePath: string }> = [];
    for (let index = 0; index < 120_000; index += 1) {
      const mod = index % 4;
      if (mod === 0) {
        paths.push({
          fileName: `table-${index}.csv`,
          filePath: `/tmp/table-${index}.csv`,
        });
      } else if (mod === 1) {
        paths.push({
          fileName: `image-${index}.png`,
          filePath: `/tmp/image-${index}.png`,
        });
      } else if (mod === 2) {
        paths.push({
          fileName: `code-${index}.py`,
          filePath: `/tmp/code-${index}.py`,
        });
      } else {
        paths.push({
          fileName: `video-${index}.mp4`,
          filePath: `/tmp/video-${index}.mp4`,
        });
      }
    }

    const startedAt = performance.now();
    let unsupportedCount = 0;
    for (const path of paths) {
      if (resolveFileDropSectionKind(path) === "unsupported_binary") {
        unsupportedCount += 1;
      }
    }
    const elapsedMs = performance.now() - startedAt;

    expect(unsupportedCount).toBe(30_000);
    expect(elapsedMs).toBeLessThan(500);
  });
});
