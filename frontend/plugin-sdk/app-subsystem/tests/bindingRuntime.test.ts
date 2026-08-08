import { describe, expect, it } from "vitest";
import {
  normalizeGeneratedOrigin,
  validateGeneratedParamNameInput,
} from "../src/index";

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

describe("validateGeneratedParamNameInput", () => {
  const pythonIdentifierStartChars = new Set(["a", "c", "_"]);
  const pythonIdentifierContinueChars = new Set(["a", "c", "l", "s", "1", "_"]);
  const pythonKeywords = new Set(["class"]);

  it("validates Python identifiers through the published SDK signature", () => {
    const options = {
      allowEmpty: false,
      label: "Param name",
      requirePythonIdentifier: true,
      pythonIdentifierStartChars,
      pythonIdentifierContinueChars,
      pythonKeywords,
    };

    expect(validateGeneratedParamNameInput("a_1", options)).toBeNull();
    expect(validateGeneratedParamNameInput("1a", options)).toBe(
      "Param name must be a valid Python identifier.",
    );
    expect(validateGeneratedParamNameInput("class", options)).toBe(
      "Param name cannot be a Python keyword.",
    );
  });
});
