import { describe, expect, it } from "vitest";

import { buildDesignFirstFigmaStarterPrompt } from "./projectChatStarterPrompts";

describe("projectChatStarterPrompts (perf)", () => {
  it("builds starter prompts quickly", () => {
    const start = performance.now();
    for (let index = 0; index < 20_000; index += 1) {
      buildDesignFirstFigmaStarterPrompt();
    }
    const elapsedMs = performance.now() - start;

    // Guard against accidental heavy prompt-construction work.
    expect(elapsedMs).toBeLessThan(120);
  });
});
