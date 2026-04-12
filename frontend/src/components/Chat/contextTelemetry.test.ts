import { describe, expect, it } from "vitest";
import {
  normalizeContextTokenCount,
  resolveAuthoritativeContextTelemetry,
} from "./contextTelemetry";

describe("normalizeContextTokenCount", () => {
  it("accepts non-negative integers", () => {
    expect(normalizeContextTokenCount(10)).toBe(10);
    expect(normalizeContextTokenCount(0)).toBe(0);
  });

  it("returns null for invalid or non-integer values", () => {
    expect(normalizeContextTokenCount(null)).toBeNull();
    expect(normalizeContextTokenCount(undefined)).toBeNull();
    expect(normalizeContextTokenCount(10.9)).toBeNull();
    expect(normalizeContextTokenCount(-5)).toBeNull();
    expect(normalizeContextTokenCount(Number.NaN)).toBeNull();
    expect(normalizeContextTokenCount(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

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
});
