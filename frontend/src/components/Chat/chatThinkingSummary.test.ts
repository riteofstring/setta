import { describe, expect, it } from "vitest";
import {
  deriveThinkingHeadlineFromContent,
  resolveLatestThinkingSummary,
  resolveThinkingSummaryHeadline,
} from "./chatThinkingSummary";

describe("chatThinkingSummary", () => {
  it("derives a compact headline from markdown-like reasoning text", () => {
    expect(
      deriveThinkingHeadlineFromContent(
        "## Plan\n- Inspect reducer state\n- Compare finalized ids",
      ),
    ).toBe("Plan");
  });

  it("prefers an explicit summary headline when it differs from the body", () => {
    expect(
      resolveThinkingSummaryHeadline({
        content: "Detailed reasoning body",
        summary: "Summary headline\nExtra line",
        isStreaming: false,
      }),
    ).toBe("Summary headline");
  });

  it("falls back to the latest thinking item and handles empty arrays", () => {
    expect(resolveLatestThinkingSummary([], false)).toBe("No thoughts yet.");
    expect(
      resolveLatestThinkingSummary(
        [
          {
            thinking: "First thought",
            summary: null,
          },
          {
            thinking: "Second thought body",
            summary: "Second summary",
          },
        ],
        false,
      ),
    ).toBe("Second summary");
  });
});
