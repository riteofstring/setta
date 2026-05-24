import type {
  CommittedHtmlSurfaceTextureSnapshot,
  HtmlSurfaceTextureMemorySnapshot,
} from "./textures";

type HtmlSurfaceTextureMemoryRecord = Pick<
  CommittedHtmlSurfaceTextureSnapshot,
  "surfaceId" | "textureBytes"
> & {
  readonly pendingTextureRecord?:
    | Pick<CommittedHtmlSurfaceTextureSnapshot, "textureBytes">
    | null
    | undefined;
};

export function createHtmlSurfaceTextureMemorySnapshot(
  records: Iterable<HtmlSurfaceTextureMemoryRecord>,
  visibleIds: ReadonlySet<string>,
): HtmlSurfaceTextureMemorySnapshot {
  let allocatedBytes = 0;
  let largestTextureBytes = 0;
  let textureCount = 0;
  let visibleBytes = 0;
  let visibleTextureCount = 0;

  for (const record of records) {
    textureCount += 1;
    allocatedBytes += record.textureBytes;
    largestTextureBytes = Math.max(largestTextureBytes, record.textureBytes);
    if (record.pendingTextureRecord) {
      textureCount += 1;
      allocatedBytes += record.pendingTextureRecord.textureBytes;
      largestTextureBytes = Math.max(
        largestTextureBytes,
        record.pendingTextureRecord.textureBytes,
      );
    }
    if (visibleIds.has(record.surfaceId)) {
      visibleBytes += record.textureBytes;
      visibleTextureCount += 1;
      if (record.pendingTextureRecord) {
        visibleBytes += record.pendingTextureRecord.textureBytes;
        visibleTextureCount += 1;
      }
    }
  }

  return {
    allocatedBytes,
    largestTextureBytes,
    textureCount,
    visibleBytes,
    visibleTextureCount,
  };
}
