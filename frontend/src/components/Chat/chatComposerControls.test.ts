import { describe, expect, it, vi } from "vitest";
import {
  buildChatSlashCommands,
  CREATE_PROJECT_STARTER_PROMPT,
  createManagedExecutionControlHandlers,
  executeManagedChatSlashCommand,
  formatSlashCommandHelp,
  getSlashCommandSuggestions,
  parseSlashCommand,
  resolvePermissionModeArg,
  resolveToggleArg,
  shouldTreatInputAsSlashCommand,
  type ChatSlashCommandDefinition,
} from "./chatComposerControls";

describe("chatComposerControls", () => {
  it("parses slash commands with args", () => {
    const parsed = parseSlashCommand("/permissions yolo");

    expect(parsed).not.toBeNull();
    expect(parsed?.command).toBe("/permissions");
    expect(parsed?.action).toBe("permissions");
    expect(parsed?.args).toEqual(["yolo"]);
  });

  it("parses slash commands case-insensitively", () => {
    const parsed = parseSlashCommand(" /Resume latest ");

    expect(parsed).not.toBeNull();
    expect(parsed?.command).toBe("/resume");
    expect(parsed?.args).toEqual(["latest"]);
  });

  it("returns null for unsupported slash commands", () => {
    const parsed = parseSlashCommand("/unknown");

    expect(parsed).toBeNull();
  });

  it("treats command-shaped slash input as command candidates", () => {
    expect(shouldTreatInputAsSlashCommand("/resume")).toBe(true);
    expect(shouldTreatInputAsSlashCommand("/res")).toBe(true);
    expect(shouldTreatInputAsSlashCommand("  /permissions yolo")).toBe(true);
  });

  it("ignores absolute-path style slash input", () => {
    expect(
      shouldTreatInputAsSlashCommand(
        "/Users/kevin/project/main.py has failing tests",
      ),
    ).toBe(false);
    expect(shouldTreatInputAsSlashCommand("/tmp/workspace/notes.txt")).toBe(
      false,
    );
    expect(shouldTreatInputAsSlashCommand("/tmp build logs look stale")).toBe(
      false,
    );
  });

  it("ignores ambiguous slash prefixes that do not map to one command", () => {
    const commands: ChatSlashCommandDefinition[] = [
      {
        command: "/run",
        action: "new",
        summary: "Run command",
      },
      {
        command: "/reset",
        action: "resume",
        summary: "Reset command",
      },
    ];

    expect(shouldTreatInputAsSlashCommand("/r", commands)).toBe(false);
    expect(shouldTreatInputAsSlashCommand("/run", commands)).toBe(true);
  });

  it("does not parse deprecated advisory slash commands", () => {
    const parsed = parseSlashCommand("/skills off");

    expect(parsed).toBeNull();
  });

  it("returns command suggestions for slash prefixes", () => {
    const suggestions = getSlashCommandSuggestions("/m");

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0]?.command).toBe("/model");
  });

  it("returns no suggestions for multiline input", () => {
    const suggestions = getSlashCommandSuggestions("/m\nother");

    expect(suggestions).toEqual([]);
  });

  it("does not suggest deprecated advisory slash commands", () => {
    const suggestions = getSlashCommandSuggestions("/s");

    expect(suggestions.find((entry) => entry.command === "/skills")).toBe(
      undefined,
    );
  });

  it("builds slash commands from capability flags", () => {
    const commands = buildChatSlashCommands({
      model: false,
      permissions: true,
      search: false,
    });

    expect(commands.map((entry) => entry.command)).toEqual([
      "/new",
      "/resume",
      "/permissions",
      "/help",
    ]);
  });

  it("creates shared managed execution setting handlers", () => {
    const updateExecutionSettings = vi.fn();
    const handlers = createManagedExecutionControlHandlers(
      {
        permissionMode: "minimal",
        searchEnabled: true,
      },
      updateExecutionSettings,
    );

    handlers.onPermissionModeChange("yolo");
    expect(updateExecutionSettings).toHaveBeenNthCalledWith(1, {
      permissionMode: "yolo",
      searchEnabled: true,
    });

    handlers.onSearchEnabledChange(false);
    expect(updateExecutionSettings).toHaveBeenNthCalledWith(2, {
      permissionMode: "minimal",
      searchEnabled: false,
    });
  });

  it("formats help text from command definitions", () => {
    const commands = buildChatSlashCommands({
      model: true,
      permissions: true,
      search: false,
    });

    expect(formatSlashCommandHelp(commands)).toBe(
      "Commands: /new, /resume, /model, /permissions, /help.",
    );
  });

  it("keeps create-project starter prompt completion guard language", () => {
    expect(CREATE_PROJECT_STARTER_PROMPT).toContain(
      "run error checks and report pass/fail explicitly",
    );
  });

  it("parses permission mode aliases from slash args", () => {
    expect(resolvePermissionModeArg("minimal")).toBe("minimal");
    expect(resolvePermissionModeArg("YOLO")).toBe("yolo");
    expect(resolvePermissionModeArg("config.toml.custom")).toBe(
      "config_toml_custom",
    );
  });

  it("rejects unknown permission mode args", () => {
    expect(resolvePermissionModeArg(undefined)).toBeNull();
    expect(resolvePermissionModeArg("safe")).toBeNull();
  });

  it("parses search toggle args", () => {
    expect(resolveToggleArg(undefined, true)).toBe(false);
    expect(resolveToggleArg("on", false)).toBe(true);
    expect(resolveToggleArg("OFF", true)).toBe(false);
    expect(resolveToggleArg("maybe", true)).toBeNull();
  });

  it("executes shared managed-chat slash command handlers", async () => {
    const onStartNewChat = vi.fn();
    const onResumeLatestChat = vi.fn(async () => true);
    const onSetPermissionMode = vi.fn();
    const onSetSearchEnabled = vi.fn();
    const slashCommands = buildChatSlashCommands({
      model: true,
      permissions: true,
      search: true,
    });

    const newResult = await executeManagedChatSlashCommand({
      command: { action: "new", args: [] },
      slashCommands,
      onSetPermissionMode,
      onStartNewChat,
      onResumeLatestChat,
      resumeFeedback: {
        success: "Resumed.",
        notFound: "No chat.",
      },
      modelFeedback: "Model picker",
      searchEnabled: true,
      onSetSearchEnabled,
    });
    expect(newResult).toEqual({ feedback: "Started a new chat thread." });
    expect(onStartNewChat).toHaveBeenCalledTimes(1);

    const resumeResult = await executeManagedChatSlashCommand({
      command: { action: "resume", args: [] },
      slashCommands,
      onSetPermissionMode,
      onStartNewChat,
      onResumeLatestChat,
      resumeFeedback: {
        success: "Resumed.",
        notFound: "No chat.",
      },
      modelFeedback: "Model picker",
      searchEnabled: true,
      onSetSearchEnabled,
    });
    expect(resumeResult).toEqual({ feedback: "Resumed." });

    const permissionsResult = await executeManagedChatSlashCommand({
      command: { action: "permissions", args: ["yolo"] },
      slashCommands,
      onSetPermissionMode,
      onStartNewChat,
      onResumeLatestChat,
      resumeFeedback: {
        success: "Resumed.",
        notFound: "No chat.",
      },
      modelFeedback: "Model picker",
      searchEnabled: true,
      onSetSearchEnabled,
    });
    expect(permissionsResult).toEqual({ feedback: "Permissions set to yolo." });
    expect(onSetPermissionMode).toHaveBeenCalledWith("yolo");

    const searchResult = await executeManagedChatSlashCommand({
      command: { action: "search", args: ["off"] },
      slashCommands,
      onSetPermissionMode,
      onStartNewChat,
      onResumeLatestChat,
      resumeFeedback: {
        success: "Resumed.",
        notFound: "No chat.",
      },
      modelFeedback: "Model picker",
      searchEnabled: true,
      onSetSearchEnabled,
    });
    expect(searchResult).toEqual({ feedback: "Search disabled." });
    expect(onSetSearchEnabled).toHaveBeenCalledWith(false);

    const modelResult = await executeManagedChatSlashCommand({
      command: { action: "model", args: [] },
      slashCommands,
      onSetPermissionMode,
      onStartNewChat,
      onResumeLatestChat,
      resumeFeedback: {
        success: "Resumed.",
        notFound: "No chat.",
      },
      modelFeedback: "Model picker",
      searchEnabled: true,
      onSetSearchEnabled,
    });
    expect(modelResult).toEqual({
      feedback: "Model picker",
      keepInput: true,
    });
  });

  it("returns false for unavailable shared managed-chat commands", async () => {
    const onSetPermissionMode = vi.fn();
    const onStartNewChat = vi.fn();
    const onResumeLatestChat = vi.fn(async () => false);
    const slashCommands = buildChatSlashCommands({
      model: false,
      permissions: true,
      search: false,
    });

    const searchResult = await executeManagedChatSlashCommand({
      command: { action: "search", args: [] },
      slashCommands,
      onSetPermissionMode,
      onStartNewChat,
      onResumeLatestChat,
      resumeFeedback: {
        success: "Resumed.",
        notFound: "No chat.",
      },
      modelFeedback: null,
    });
    expect(searchResult).toBe(false);

    const modelResult = await executeManagedChatSlashCommand({
      command: { action: "model", args: [] },
      slashCommands,
      onSetPermissionMode,
      onStartNewChat,
      onResumeLatestChat,
      resumeFeedback: {
        success: "Resumed.",
        notFound: "No chat.",
      },
      modelFeedback: null,
    });
    expect(modelResult).toBe(false);
  });
});
