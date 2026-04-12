import { describe, expect, it } from "vitest";

import { QUESTION_TOOL_NAME, normalizeToolName } from "./claudeTools";

describe("normalizeToolName", () => {
  it("returns null for empty values", () => {
    expect(normalizeToolName(undefined)).toBeNull();
    expect(normalizeToolName("   ")).toBeNull();
  });

  it("normalizes MCP-prefixed tool names", () => {
    expect(normalizeToolName("  mcp__setta__read_file  ")).toBe(
      "setta__read_file",
    );
  });

  it("repairs legacy single-underscore Setta prefixes", () => {
    expect(normalizeToolName("setta_read_file")).toBe("setta__read_file");
  });

  it("maps the bare question tool to AskUserQuestion", () => {
    expect(normalizeToolName("question")).toBe(QUESTION_TOOL_NAME);
    expect(normalizeToolName("QUESTION")).toBe(QUESTION_TOOL_NAME);
    expect(normalizeToolName("mcp__question")).toBe("question");
  });
});
