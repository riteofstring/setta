import { describe, expect, it, vi } from "vitest";
import {
  buildChatSlashCommands,
  buildCustomPromptSlashCommandDefinitions,
  CREATE_PROJECT_STARTER_PROMPT,
  createManagedExecutionControlHandlers,
  executeManagedChatSlashCommand,
  formatSlashCommandHelp,
  getSlashCommandSuggestions,
  normalizeSlashCommandToken,
  parseSlashCommand,
  resolvePermissionModeArg,
  resolveToggleArg,
  shouldTreatInputAsSlashCommand,
  type ChatSlashCommandDefinition,
  type ManagedChatExecutionSettings,
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
    expect(shouldTreatInputAsSlashCommand("/Resume")).toBe(true);
    expect(shouldTreatInputAsSlashCommand("/res")).toBe(true);
    expect(shouldTreatInputAsSlashCommand("  /permissions yolo")).toBe(true);
  });

  it("parses unambiguous slash prefixes", () => {
    const parsed = parseSlashCommand("/res latest");

    expect(parsed).not.toBeNull();
    expect(parsed?.command).toBe("/resume");
    expect(parsed?.action).toBe("resume");
    expect(parsed?.args).toEqual(["latest"]);
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

  it("includes app-generation slash commands when capability is enabled", () => {
    const commands = buildChatSlashCommands({
      model: false,
      permissions: false,
      search: false,
      appGenerationModes: true,
    });

    expect(commands.map((entry) => entry.command)).toEqual([
      "/new",
      "/resume",
      "/app-json",
      "/app-image",
      "/app-prompt",
      "/app-mcp",
      "/help",
    ]);
  });

  it("normalizes and validates slash command tokens", () => {
    expect(normalizeSlashCommandToken("  TriAge ")).toBe("/triage");
    expect(normalizeSlashCommandToken("/PROMPT_1")).toBe("/prompt_1");
    expect(normalizeSlashCommandToken("")).toBeNull();
    expect(normalizeSlashCommandToken("no-spaces allowed")).toBeNull();
  });

  it("builds custom prompt slash commands from normalized unique tokens", () => {
    const commands = buildCustomPromptSlashCommandDefinitions([
      { command: "  triage  ", prompt: "Summarize regressions." },
      { command: "/triage", prompt: "Duplicate should be ignored." },
      { command: "/invalid command", prompt: "skip" },
      { command: "/empty", prompt: "   " },
    ]);

    expect(commands).toEqual([
      {
        command: "/triage",
        action: "custom_prompt",
        summary: "Run a saved custom prompt.",
        promptTemplate: "Summarize regressions.",
      },
    ]);

    const parsed = parseSlashCommand("/triage", commands);
    expect(parsed).not.toBeNull();
    expect(parsed?.action).toBe("custom_prompt");
    expect(parsed?.promptTemplate).toBe("Summarize regressions.");
  });

  it("drops malformed custom prompt slash command entries without throwing", () => {
    const commands = buildCustomPromptSlashCommandDefinitions([
      { command: "/triage", prompt: "Summarize regressions." },
      null,
      { command: 123, prompt: "invalid command" },
      { command: "/broken", prompt: 42 },
      { command: "/empty", prompt: "   " },
    ]);

    expect(commands).toEqual([
      {
        command: "/triage",
        action: "custom_prompt",
        summary: "Run a saved custom prompt.",
        promptTemplate: "Summarize regressions.",
      },
    ]);
  });

  it("creates shared managed execution setting handlers without clobbering sibling settings", () => {
    let currentSettings: ManagedChatExecutionSettings = {
      permissionMode: "minimal",
      searchEnabled: true,
    };
    const updateExecutionSettings = vi.fn(
      (
        nextSettings:
          | ManagedChatExecutionSettings
          | ((
              previousSettings: ManagedChatExecutionSettings,
            ) => ManagedChatExecutionSettings),
      ) => {
        currentSettings =
          typeof nextSettings === "function"
            ? nextSettings(currentSettings)
            : nextSettings;
      },
    );
    const handlers = createManagedExecutionControlHandlers(
      updateExecutionSettings,
    );

    handlers.onPermissionModeChange("yolo");
    handlers.onSearchEnabledChange(false);

    expect(updateExecutionSettings).toHaveBeenCalledTimes(2);
    expect(currentSettings).toEqual({
      permissionMode: "yolo",
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

  it("keeps create-project starter prompt clarifying-question and completion guard language", () => {
    expect(CREATE_PROJECT_STARTER_PROMPT).toContain(
      "ask me 8-12 concise clarifying questions",
    );
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
    const onSetAppGenerationMode = vi.fn();
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
      appGenerationMode: "json_render",
      onSetAppGenerationMode,
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
      appGenerationMode: "json_render",
      onSetAppGenerationMode,
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
      appGenerationMode: "json_render",
      onSetAppGenerationMode,
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
      appGenerationMode: "json_render",
      onSetAppGenerationMode,
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
      appGenerationMode: "json_render",
      onSetAppGenerationMode,
    });
    expect(modelResult).toEqual({
      feedback: "Model picker",
      keepInput: true,
    });
  });

  it("executes app-generation mode slash commands", async () => {
    const onSetPermissionMode = vi.fn();
    const onSetSearchEnabled = vi.fn();
    const onSetAppGenerationMode = vi.fn();
    const slashCommands = buildChatSlashCommands({
      model: false,
      permissions: true,
      search: true,
      appGenerationModes: true,
    });

    const appModeResult = await executeManagedChatSlashCommand({
      command: { action: "app_mcp_server", args: [] },
      slashCommands,
      onSetPermissionMode,
      onStartNewChat: vi.fn(),
      onResumeLatestChat: vi.fn(async () => false),
      resumeFeedback: {
        success: "Resumed.",
        notFound: "No chat.",
      },
      modelFeedback: null,
      searchEnabled: true,
      onSetSearchEnabled,
      appGenerationMode: "json_render",
      onSetAppGenerationMode,
    });

    expect(onSetAppGenerationMode).toHaveBeenCalledWith("mcp_server");
    expect(appModeResult).toEqual({
      feedback: "App mode set to MCP Server.",
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
