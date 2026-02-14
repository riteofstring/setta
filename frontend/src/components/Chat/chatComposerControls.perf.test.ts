import { describe, expect, it } from "vitest";
import { getSlashCommandSuggestions } from "./chatComposerControls";

describe("chatComposerControls (perf)", () => {
  it("keeps slash suggestions responsive with large command sets", () => {
    const commands = Array.from({ length: 6000 }, (_, index) => ({
      command: `/cmd-${index}`,
      action: "help" as const,
      summary: `Command ${index}`,
    }));

    const start = performance.now();
    for (let index = 0; index < 200; index += 1) {
      getSlashCommandSuggestions("/cmd-59", commands);
    }
    const elapsedMs = performance.now() - start;

    // Perf smoke threshold keeps the test stable in CI while catching regressions.
    expect(elapsedMs).toBeLessThan(350);
  });
});
