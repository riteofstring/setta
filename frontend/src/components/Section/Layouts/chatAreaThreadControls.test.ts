import { type ChatSlashCommand } from "components/Chat/ChatInput";
import { buildChatSlashCommands } from "components/Chat/chatComposerControls";
import { describe, expect, it, vi } from "vitest";
import {
  buildManagedZeroScopeBannerSessionKey,
  executeSectionChatSlashCommand,
} from "./chatAreaThreadControls";

function createCommand(action: ChatSlashCommand["action"]): ChatSlashCommand {
  return { action };
}

describe("buildManagedZeroScopeBannerSessionKey", () => {
  it("keys the dismissal by project and section", () => {
    expect(
      buildManagedZeroScopeBannerSessionKey("project-a", "section-a"),
    ).toBe("setta:managed-zero-scope-banner-dismissed:project-a:section-a");
  });
});

describe("executeSectionChatSlashCommand", () => {
  it("blocks thread-changing commands when share policy disallows managed chat", async () => {
    await expect(
      executeSectionChatSlashCommand({
        command: createCommand("new"),
        canUseManagedChat: false,
        slashCommands: [],
        onStartNewChat: vi.fn(),
        onResumeLatestChat: vi.fn(async () => false),
      }),
    ).resolves.toEqual({
      feedback: "Chat thread changes are disabled by share policy.",
      keepInput: true,
    });
  });

  it("starts a new thread when /new is requested", async () => {
    const onStartNewChat = vi.fn();

    await expect(
      executeSectionChatSlashCommand({
        command: createCommand("new"),
        canUseManagedChat: true,
        slashCommands: [],
        onStartNewChat,
        onResumeLatestChat: vi.fn(async () => false),
      }),
    ).resolves.toEqual({
      feedback: "Started a new chat thread.",
    });
    expect(onStartNewChat).toHaveBeenCalledTimes(1);
  });

  it("reports whether /resume found a previous thread", async () => {
    await expect(
      executeSectionChatSlashCommand({
        command: createCommand("resume"),
        canUseManagedChat: true,
        slashCommands: [],
        onStartNewChat: vi.fn(),
        onResumeLatestChat: vi.fn(async () => true),
      }),
    ).resolves.toEqual({
      feedback: "Resumed the latest section chat.",
    });

    await expect(
      executeSectionChatSlashCommand({
        command: createCommand("resume"),
        canUseManagedChat: true,
        slashCommands: [],
        onStartNewChat: vi.fn(),
        onResumeLatestChat: vi.fn(async () => false),
      }),
    ).resolves.toEqual({
      feedback: "No previous section chat found to resume.",
      keepInput: true,
    });
  });

  it("returns the provided help text for /help", async () => {
    const slashCommands = buildChatSlashCommands({
      model: false,
      permissions: false,
      search: false,
    });

    await expect(
      executeSectionChatSlashCommand({
        command: createCommand("help"),
        canUseManagedChat: true,
        slashCommands,
        onStartNewChat: vi.fn(),
        onResumeLatestChat: vi.fn(async () => false),
      }),
    ).resolves.toMatchObject({
      feedback: expect.stringContaining("/help"),
    });
  });

  it("leaves unrelated commands unresolved", async () => {
    const slashCommands = buildChatSlashCommands({
      model: false,
      permissions: false,
      search: false,
    });
    expect(slashCommands.length).toBeGreaterThan(0);

    await expect(
      executeSectionChatSlashCommand({
        command: createCommand("model"),
        canUseManagedChat: true,
        slashCommands,
        onStartNewChat: vi.fn(),
        onResumeLatestChat: vi.fn(async () => false),
      }),
    ).resolves.toBe(false);
  });
});
