import { describe, expect, it } from "vitest";
import { resolveProjectChatShortcutActiveSectionId } from "components/ChatWindowing/projectChatActiveSelection";

describe("resolveProjectChatShortcutActiveSectionId", () => {
  it("prefers the immediate UI selection when it exists", () => {
    expect(
      resolveProjectChatShortcutActiveSectionId("section-ui", "section-sync"),
    ).toBe("section-ui");
  });

  it("falls back to the durable project selection when the UI selection is empty", () => {
    expect(
      resolveProjectChatShortcutActiveSectionId(null, "section-sync"),
    ).toBe("section-sync");
  });

  it("returns null when neither selection source has an active section", () => {
    expect(resolveProjectChatShortcutActiveSectionId(null, null)).toBeNull();
  });
});
