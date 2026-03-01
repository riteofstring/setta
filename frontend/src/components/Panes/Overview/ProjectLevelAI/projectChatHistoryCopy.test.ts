import { describe, expect, it } from "vitest";
import {
  getProjectChatDeleteRecoveryTooltipContent,
  getProjectChatPlaceholderState,
  shouldShowProjectChatNoThreadsPlaceholder,
} from "./ProjectChatHistory";

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

describe("project chat placeholder state", () => {
  it("returns no-threads state after initial load when no entries exist", () => {
    const state = getProjectChatPlaceholderState(true, null, 0);

    expect(state).toEqual({
      kind: "no_threads",
      text: "No threads yet",
    });
  });

  it("keeps empty-state CTA hidden when master search is active", () => {
    const showNoThreadsPlaceholder = shouldShowProjectChatNoThreadsPlaceholder({
      hasAnyContent: false,
      hasMasterSearch: true,
      placeholderKind: "no_threads",
    });

    expect(showNoThreadsPlaceholder).toBe(false);
  });
});
