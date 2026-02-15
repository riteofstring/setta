import { describe, expect, it } from "vitest";
import {
  buildChatSlashCommands,
  CREATE_PROJECT_STARTER_PROMPT,
  formatSlashCommandHelp,
  getSlashCommandSuggestions,
  parseSlashCommand,
  resolvePermissionModeArg,
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
});
