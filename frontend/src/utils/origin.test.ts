import { describe, expect, it, vi } from "vitest";
import { normalizeOrigin } from "./origin";

describe("normalizeOrigin", () => {
  it("normalizes host:port by assuming http", () => {
    expect(normalizeOrigin("127.0.0.1:54321")).toBe("http://127.0.0.1:54321");
  });

  it("trims whitespace", () => {
    expect(normalizeOrigin("  http://localhost:8000  ")).toBe(
      "http://localhost:8000",
    );
  });

  it("rejects non-http(s) schemes", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(normalizeOrigin("ws://127.0.0.1:8000")).toBeUndefined();
      expect(normalizeOrigin("ftp://example.com")).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });
});

