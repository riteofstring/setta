import { normalizeOrigin } from "@setta/app-subsystem-frontend-sdk";
import { describe, expect, it, vi } from "vitest";

describe("normalizeOrigin", () => {
  it("rejects schemeless host:port values", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(normalizeOrigin("127.0.0.1:54321")).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
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

  it("rejects origins with credentials", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(normalizeOrigin("https://user:pass@example.com")).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });
});
