import { describe, expect, it } from "vitest";
import {
  deriveThinkingHeadlineFromContent,
  resolveLatestThinkingSummary,
  resolveThinkingSummaryHeadline,
  resolveThinkingSummaryMeta,
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

  it("falls back to derived thinking text when the summary only repeats the body", () => {
    expect(
      resolveThinkingSummaryMeta({
        content: "## Investigate reducer churn",
        summary: "Investigate reducer churn",
        isStreaming: false,
      }),
    ).toEqual({
      headline: "Investigate reducer churn",
      hasTitle: true,
    });
  });

  it("uses the unavailable message for markdown-only thinking text", () => {
    expect(
      resolveThinkingSummaryMeta({
        content: "-",
        summary: null,
        isStreaming: false,
      }),
    ).toEqual({
      headline: "Summary unavailable. Expand to view full reasoning.",
      hasTitle: false,
    });
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
