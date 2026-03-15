import type { FolderContentItem } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  extractExtension,
  getBrowserPreviewKind,
  getExtensionBadge,
  isFileUrlStale,
} from "./browserAreaPreviewModel";

describe("browserAreaPreviewModel", () => {
  it("derives preview kinds from folders, spreadsheets, and regular files", () => {
    // Keep the preview owner aligned with the section's open/preview routing.
    const folder = {
      name: "assets",
      fullPath: "/tmp/assets",
      type: "folder",
    } satisfies FolderContentItem;
    const spreadsheet = {
      name: "report.xlsx",
      fullPath: "/tmp/report.xlsx",
      type: "file",
    } satisfies FolderContentItem;
    const image = {
      name: "diagram.png",
      fullPath: "/tmp/diagram.png",
      type: "file",
    } satisfies FolderContentItem;

    expect(getBrowserPreviewKind(folder)).toBe("folder");
    expect(getBrowserPreviewKind(spreadsheet)).toBe("spreadsheet");
    expect(getBrowserPreviewKind(image)).toBe("image");
  });

  it("normalizes extensions into stable badges for thumbnail and carousel labels", () => {
    // Long extensions should stay compact so the extracted view keeps the same badge sizing.
    expect(extractExtension("/tmp/archive.tar.gz")).toBe(".gz");
    expect(getExtensionBadge("/tmp/archive.markdown")).toBe("MARKDO");
    expect(getExtensionBadge("/tmp/notes.txt")).toBe("TXT");
    expect(getExtensionBadge("/tmp/README")).toBeNull();
  });

  it("treats nearly expired preview urls as stale so the section refreshes them early", () => {
    // The refresh buffer is part of the preview-state ownership split, so keep it explicit.
    const now = Date.now();
    const fresh = {
      url: "https://example.com/fresh",
      expiresAt: (now + 60_000) / 1000,
    };
    const stale = {
      url: "https://example.com/stale",
      expiresAt: (now + 5_000) / 1000,
    };

    expect(isFileUrlStale(fresh, now)).toBe(false);
    expect(isFileUrlStale(stale, now)).toBe(true);
  });
});
