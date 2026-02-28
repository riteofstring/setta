import { describe, expect, it } from "vitest";
import { getProjectChatDeleteRecoveryTooltipContent } from "./ProjectChatHistory";

describe("project chat delete tooltip copy", () => {
  it("uses Restore Delete guidance for thread deletion", () => {
    const copy = getProjectChatDeleteRecoveryTooltipContent("thread");

    // Thread deletion should point users to the explicit restore control.
    expect(copy).toContain("Restore Delete");
    expect(copy).not.toContain("Cmd/Ctrl+Z");
  });

  it("uses Restore Delete guidance for group deletion", () => {
    const copy = getProjectChatDeleteRecoveryTooltipContent("group");

    // Group deletion should provide the same explicit restore path.
    expect(copy).toContain("Restore Delete");
    expect(copy).not.toContain("Cmd/Ctrl+Z");
  });
});
