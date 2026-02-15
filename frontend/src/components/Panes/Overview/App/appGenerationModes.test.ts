import { describe, expect, it } from "vitest";

import {
  APP_GENERATION_MODE_OPTIONS,
  buildDefaultAppGenerationPrompt,
  buildHiddenChatAppGenerationPrompt,
  coerceAppGenerationMode,
  isAppGenerationMode,
  isJsonRenderMode,
} from "./appGenerationModes";

describe("appGenerationModes", () => {
  it("exposes all supported app generation modes", () => {
    // Keep this list explicit so adding/removing modes requires test updates.
    expect(APP_GENERATION_MODE_OPTIONS.map((entry) => entry.mode)).toEqual([
      "json_render",
      "json_render_with_image",
      "prompt_builder",
      "mcp_server",
    ]);
  });

  it("builds mode-specific default prompts", () => {
    expect(buildDefaultAppGenerationPrompt("json_render")).toContain(
      "standalone JSON-render app spec",
    );
    expect(buildDefaultAppGenerationPrompt("json_render_with_image")).toContain(
      "reference image",
    );
    expect(buildDefaultAppGenerationPrompt("prompt_builder")).toContain(
      "Persist the result",
    );
    expect(buildDefaultAppGenerationPrompt("mcp_server")).toContain(
      "MCP tools",
    );
  });

  it("includes image + MCP guidance when building hidden chat prompts", () => {
    const prompt = buildHiddenChatAppGenerationPrompt({
      mode: "mcp_server",
      prompt: "Build a dashboard from Figma.",
      catalogSummary: "Catalog: setta.app.default (version v1)",
      sectionsSummary:
        "- Sales (section-sales) params: Revenue (revenue, type=CodeParam)",
      referenceImageUrl: "https://example.com/reference.png",
      referenceImageNotes: "Prefer compact cards and wider gutters.",
    });

    expect(prompt).toContain("App generation mode: mcp_server");
    expect(prompt).not.toContain("setta__stream_app_definition");
    expect(prompt).not.toContain("setta__set_app_definition");
    expect(prompt).toContain("URL: https://example.com/reference.png");
    expect(prompt).toContain("Prefer compact cards and wider gutters.");
    expect(prompt).toContain("Catalog: setta.app.default (version v1)");
  });

  it("recognizes json-render modes", () => {
    expect(isJsonRenderMode("json_render")).toBe(true);
    expect(isJsonRenderMode("json_render_with_image")).toBe(true);
    expect(isJsonRenderMode("prompt_builder")).toBe(false);
    expect(isJsonRenderMode("mcp_server")).toBe(false);
  });

  it("validates app generation mode values", () => {
    expect(isAppGenerationMode("json_render")).toBe(true);
    expect(isAppGenerationMode("mcp_server")).toBe(true);
    expect(isAppGenerationMode("legacy_mode")).toBe(false);
    expect(isAppGenerationMode(null)).toBe(false);
  });

  it("coerces invalid mode values to the default mode", () => {
    expect(coerceAppGenerationMode("json_render_with_image")).toBe(
      "json_render_with_image",
    );
    expect(coerceAppGenerationMode("invalid_mode")).toBe("json_render");
    expect(coerceAppGenerationMode(undefined)).toBe("json_render");
  });
});
