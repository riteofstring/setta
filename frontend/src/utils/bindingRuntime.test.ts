import { normalizeGeneratedOrigin } from "@setta/app-subsystem-frontend-sdk";
import { describe, expect, it } from "vitest";

describe("normalizeGeneratedOrigin", () => {
  it("normalizes supported http origins", () => {
    expect(
      normalizeGeneratedOrigin("  http://localhost:8000/path?q=1#hash  "),
    ).toBe("http://localhost:8000");
    expect(normalizeGeneratedOrigin("https://example.com")).toBe(
      "https://example.com",
    );
  });

  it("formats ipv6 hosts without credentials", () => {
    expect(normalizeGeneratedOrigin("https://[::1]:8443/path")).toBe(
      "https://[::1]:8443",
    );
  });

  it("rejects unsupported schemes and credentials", () => {
    expect(normalizeGeneratedOrigin("ws://localhost:8000")).toBeNull();
    expect(
      normalizeGeneratedOrigin("https://user:pass@example.com"),
    ).toBeNull();
  });

  it("rejects blank and invalid origins", () => {
    expect(normalizeGeneratedOrigin("")).toBeNull();
    expect(normalizeGeneratedOrigin("   ")).toBeNull();
    expect(normalizeGeneratedOrigin("localhost:8000")).toBeNull();
  });
});
