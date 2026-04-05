import type { AppGenerationMode } from "state/types/appGenerationMode";
import { AppGenerationModeEnum } from "utils/generatedTypes";

export type AppGenerationSlashCommandAction =
  | "app_json_render"
  | "app_json_render_with_image"
  | "app_prompt_builder"
  | "app_mcp_server";

type AppGenerationSlashCommandEntry = {
  command: string;
  action: AppGenerationSlashCommandAction;
  mode: AppGenerationMode;
  summary: string;
  promptTemplate: string;
};

export const APP_GENERATION_SLASH_COMMANDS: AppGenerationSlashCommandEntry[] = [
  {
    command: "/app-json",
    action: "app_json_render",
    mode: AppGenerationModeEnum.JSONRender,
    summary: "Generate a standalone app spec through JSON render.",
    promptTemplate: [
      "Generate a polished standalone JSON-render app spec.",
      "Use a strong hero section, clear content grouping, and consistent spacing/typography by default.",
      "Include one obvious primary action path and production-ready baseline structure.",
    ].join(" "),
  },
  {
    command: "/app-image",
    action: "app_json_render_with_image",
    mode: AppGenerationModeEnum.JSONRenderWithImage,
    summary: "Generate an app spec using attached image guidance.",
    promptTemplate: [
      "Generate a JSON-render app spec that matches the attached reference image as closely as possible.",
      "Prioritize layout composition first, then spacing, typography scale, and color intent.",
      "Stay within catalog constraints and preserve the closest visual approximation when exact parity is impossible.",
    ].join(" "),
  },
  {
    command: "/app-prompt",
    action: "app_prompt_builder",
    mode: AppGenerationModeEnum.PromptBuilder,
    summary: "Generate an app-definition plan for chat-driven iteration.",
    promptTemplate: [
      "Generate a practical, polished JSON-render app spec for this project.",
      "Use strong information hierarchy, clear spacing rhythm, and one primary action path.",
      "Persist the result into the project via Setta app-definition tools.",
    ].join(" "),
  },
  {
    command: "/app-mcp",
    action: "app_mcp_server",
    mode: AppGenerationModeEnum.MCPServer,
    summary: "Route app generation through MCP-capable tools.",
    promptTemplate: [
      "Use MCP tools to produce a high-fidelity UI implementation for this project.",
      "If design-import tools are available, import an existing design or generate one before mapping it back into Setta's app definition.",
      "Preserve clear hierarchy, responsive layout behavior, and practical defaults.",
    ].join(" "),
  },
];

export function buildAppGenerationSlashCommandDefinitions(): Array<{
  command: string;
  action: AppGenerationSlashCommandAction;
  summary: string;
  promptTemplate: string;
}> {
  return APP_GENERATION_SLASH_COMMANDS.map(
    ({ command, action, summary, promptTemplate }) => ({
      command,
      action,
      summary,
      promptTemplate,
    }),
  );
}

export function getAppGenerationSlashCommandByAction(
  action: string,
): AppGenerationSlashCommandEntry | null {
  return (
    APP_GENERATION_SLASH_COMMANDS.find((entry) => entry.action === action) ??
    null
  );
}

export function resolveAppGenerationModeForSlashAction(
  action: string,
): AppGenerationMode | null {
  return getAppGenerationSlashCommandByAction(action)?.mode ?? null;
}
