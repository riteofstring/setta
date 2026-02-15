import { describe, expect, it } from "vitest";

import { buildHiddenChatAppGenerationPrompt } from "./appGenerationModes";

describe("appGenerationModes (perf)", () => {
  it("builds chat prompts quickly for large section summaries", () => {
    const largeSectionsSummary = Array.from({ length: 500 }, (_, index) => {
      return `- Section ${index} (section-${index}) params: Param ${index} (param-${index}, type=CodeParam)`;
    }).join("\n");

    const start = performance.now();
    for (let i = 0; i < 150; i += 1) {
      buildHiddenChatAppGenerationPrompt({
        mode: "json_render_with_image",
        prompt: "",
        catalogSummary: "Catalog: setta.app.default (version v1)",
        sectionsSummary: largeSectionsSummary,
        appSpecStreamingEnabled: true,
        referenceImageUrl: "https://example.com/ref.png",
        referenceImageNotes: "Match spacing and hierarchy.",
      });
    }
    const elapsedMs = performance.now() - start;

    // Guard against accidental O(n^2) regressions in prompt construction.
    expect(elapsedMs).toBeLessThan(150);
  });
});
