import { describe, expect, it } from "vitest";
import { CHAT_SLASH_COMMANDS } from "./chatComposerControls";
import {
  canUseManagedChatLLM,
  filterManagedChatThreadSlashCommands,
} from "./sharePolicyChatAccess";

describe("sharePolicyChatAccess", () => {
  it("allows managed chat LLM access outside deployment mode", () => {
    expect(
      canUseManagedChatLLM({
        isDeploymentMode: false,
        allowLLM: false,
      }),
    ).toBe(true);
  });

  it("blocks managed chat LLM access when deployment policy disallows it", () => {
    expect(
      canUseManagedChatLLM({
        isDeploymentMode: true,
        allowLLM: false,
      }),
    ).toBe(false);
  });

  it("keeps managed chat thread commands only when LLM access is allowed", () => {
    const filtered = filterManagedChatThreadSlashCommands(
      CHAT_SLASH_COMMANDS,
      false,
    );

    expect(filtered.some((command) => command.action === "new")).toBe(false);
    expect(filtered.some((command) => command.action === "resume")).toBe(false);
    expect(filtered.some((command) => command.action === "help")).toBe(true);
  });
});
