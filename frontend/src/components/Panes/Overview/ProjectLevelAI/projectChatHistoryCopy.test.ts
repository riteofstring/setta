import { describe, expect, it } from "vitest";
import { getProjectChatDeleteRecoveryTooltipContent } from "./projectChatHistoryShared";

describe("project chat delete tooltip copy", () => {
  it("uses Undo Delete guidance for thread deletion", () => {
    const copy = getProjectChatDeleteRecoveryTooltipContent("thread");

    // Thread deletion should point users to the explicit local delete-undo control.
    expect(copy).toContain("Undo Delete");
    expect(copy).not.toContain("Cmd/Ctrl+Z");
  });

  it("uses Undo Delete guidance for group deletion", () => {
    const copy = getProjectChatDeleteRecoveryTooltipContent("group");

    // Group deletion should provide the same explicit restore path.
    expect(copy).toContain("Undo Delete");
    expect(copy).not.toContain("Cmd/Ctrl+Z");
  });
});
