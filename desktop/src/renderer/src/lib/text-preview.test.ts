import { describe, expect, test } from "vitest";

import { truncateTextPreview } from "./text-preview";

describe("truncateTextPreview", () => {
  test("does not split emoji surrogate pairs", () => {
    const preview = truncateTextPreview("🙂🙂🙂", 2, "\n...");

    expect(preview).toBe("🙂🙂\n...");
    expect(preview).not.toContain("\uFFFD");
  });

  test("does not truncate when text is already within the limit", () => {
    expect(truncateTextPreview("short", 10, "\n...")).toBe("short");
  });
});
