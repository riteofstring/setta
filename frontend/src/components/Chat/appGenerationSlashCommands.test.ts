import { describe, expect, it } from "vitest";

import {
  APP_GENERATION_SLASH_COMMANDS,
  buildAppGenerationSlashCommandDefinitions,
  resolveAppGenerationModeForSlashAction,
} from "./appGenerationSlashCommands";

describe("appGenerationSlashCommands", () => {
  it("defines fixed built-in app generation slash commands with unique tokens", () => {
    expect(
      APP_GENERATION_SLASH_COMMANDS.map(({ command, action, mode }) => ({
        command,
        action,
        mode,
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
    expect(
      new Set(APP_GENERATION_SLASH_COMMANDS.map((entry) => entry.command)).size,
    ).toBe(APP_GENERATION_SLASH_COMMANDS.length);
    for (const entry of APP_GENERATION_SLASH_COMMANDS) {
      expect(entry.promptTemplate.trim().length).toBeGreaterThan(0);
      expect(entry.summary.trim().length).toBeGreaterThan(0);
    }
  });

  it("builds chat slash command definitions with fixed prompt templates", () => {
    const definitions = buildAppGenerationSlashCommandDefinitions();

    expect(
      definitions.map(({ command, action, promptTemplate }) => ({
        command,
        action,
        promptTemplate,
      })),
    ).toEqual(
      APP_GENERATION_SLASH_COMMANDS.map(
        ({ command, action, promptTemplate }) => ({
          command,
          action,
          promptTemplate,
        }),
      ),
    );
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
});
