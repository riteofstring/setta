import { describe, expect, it } from "vitest";
import {
  resolveThinkingSummaryHeadline,
  resolveThinkingSummaryMeta,
} from "./chatThinkingSummary";

describe("chatThinkingSummary", () => {
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
});
