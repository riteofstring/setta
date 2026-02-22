import { describe, expect, it } from "vitest";

import { buildDesignFirstFigmaStarterPrompt } from "./projectChatStarterPrompts";

describe("projectChatStarterPrompts", () => {
  it("builds a design-first starter prompt with visual-discovery questions", () => {
    const prompt = buildDesignFirstFigmaStarterPrompt();

    expect(prompt).toContain("design-first workflow");
    expect(prompt).toContain("Ask me 8-12 concise questions");
    expect(prompt).toContain("style tile");
    expect(prompt).toContain("style anchor image");
    expect(prompt).toContain("MCP/Figma flow");
  });
});
