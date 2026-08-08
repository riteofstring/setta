import { describe, expect, it } from "vitest";
import { resolveAuthoritativeContextTelemetry } from "./contextTelemetry";

describe("resolveAuthoritativeContextTelemetry", () => {
  it("returns backend telemetry values directly", () => {
    expect(
      resolveAuthoritativeContextTelemetry({
        contextWindowTokens: 200,
        contextUsedTokens: 150,
        estimated: true,
      }),
    ).toEqual({
      contextWindowTokens: 200,
      contextUsedTokens: 150,
      contextUsageIsEstimated: true,
    });
  });

  it("keeps missing backend usage as null telemetry without fallback state", () => {
    expect(resolveAuthoritativeContextTelemetry(null)).toEqual({
      contextWindowTokens: null,
      contextUsedTokens: null,
      contextUsageIsEstimated: false,
    });
  });

  it("keeps partial backend usage without inventing missing fields", () => {
    expect(
      resolveAuthoritativeContextTelemetry({
        contextWindowTokens: 4000,
        contextUsedTokens: null,
        estimated: false,
      }),
    ).toEqual({
      contextWindowTokens: 4000,
      contextUsedTokens: null,
      contextUsageIsEstimated: false,
    });
  });

  it("drops invalid token counts instead of forwarding malformed backend values", () => {
    expect(
      resolveAuthoritativeContextTelemetry({
        contextWindowTokens: 10.9,
        contextUsedTokens: Number.NaN,
        estimated: true,
      }),
    ).toEqual({
      contextWindowTokens: null,
      contextUsedTokens: null,
      contextUsageIsEstimated: true,
    });
  });
});
