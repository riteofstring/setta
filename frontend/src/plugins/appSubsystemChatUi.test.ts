import { describe, expect, it } from "vitest";

import {
  APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE_OPTIONS,
  buildAppGenerationSlashCommandDefinitions,
  DEFAULT_APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE,
  getAppGenerationSlashCommandByAction,
  resolveAppGenerationModeForSlashAction,
} from "./appSubsystemChatUi";

describe("appSubsystemChatUi", () => {
  it("defines fixed built-in app generation slash commands with unique tokens", () => {
    const definitions = buildAppGenerationSlashCommandDefinitions();

    expect(
      definitions.map(({ command, action }) => ({
        command,
        action,
        mode: resolveAppGenerationModeForSlashAction(action),
      })),
    ).toEqual([
      {
        command: "/app-json",
        action: "app_json_render",
        mode: "json_render",
      },
      {
        command: "/app-image",
        action: "app_json_render_with_image",
        mode: "json_render_with_image",
      },
      {
        command: "/app-prompt",
        action: "app_prompt_builder",
        mode: "prompt_builder",
      },
      {
        command: "/app-mcp",
        action: "app_mcp_server",
        mode: "mcp_server",
      },
    ]);
    expect(new Set(definitions.map((entry) => entry.command)).size).toBe(
      definitions.length,
    );
    for (const entry of definitions) {
      expect(entry.promptTemplate?.trim().length).toBeGreaterThan(0);
      expect(entry.summary.trim().length).toBeGreaterThan(0);
    }
  });

  it("resolves built-in slash commands by action", () => {
    const definitions = buildAppGenerationSlashCommandDefinitions();

    expect(
      definitions.map(({ command, action, summary, promptTemplate }) => ({
        command,
        action,
        summary,
        promptTemplate,
      })),
    ).toEqual(
      definitions.map(({ action }) => {
        const entry = getAppGenerationSlashCommandByAction(action);
        return {
          command: entry?.command,
          action: entry?.action,
          summary: entry?.summary,
          promptTemplate: entry?.promptTemplate,
        };
      }),
    );
    expect(getAppGenerationSlashCommandByAction("help")).toBeNull();
  });

  it("maps built-in app generation slash actions back to explicit app modes", () => {
    expect(resolveAppGenerationModeForSlashAction("app_json_render")).toBe(
      "json_render",
    );
    expect(
      resolveAppGenerationModeForSlashAction("app_json_render_with_image"),
    ).toBe("json_render_with_image");
    expect(resolveAppGenerationModeForSlashAction("app_prompt_builder")).toBe(
      "prompt_builder",
    );
    expect(resolveAppGenerationModeForSlashAction("app_mcp_server")).toBe(
      "mcp_server",
    );
    expect(resolveAppGenerationModeForSlashAction("help")).toBeNull();
  });

  it("keeps plain chat as the default custom slash mode while exposing plugin-owned app modes", () => {
    expect(DEFAULT_APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE).toBe("plain_chat");
    expect(APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE_OPTIONS).toEqual([
      { id: "plain_chat", name: "Plain chat" },
      { id: "json_render", name: "JSON Render" },
      { id: "json_render_with_image", name: "Image to JSON Render" },
      { id: "prompt_builder", name: "Prompt Builder" },
      { id: "mcp_server", name: "MCP Server" },
    ]);
  });
});
