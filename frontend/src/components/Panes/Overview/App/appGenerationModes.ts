export type AppGenerationMode =
  | "json_render"
  | "json_render_with_image"
  | "prompt_builder"
  | "mcp_server";

export type AppGenerationModeOption = {
  mode: AppGenerationMode;
  label: string;
  description: string;
};

export const APP_GENERATION_MODE_OPTIONS: AppGenerationModeOption[] = [
  {
    mode: "json_render",
    label: "JSON Render",
    description: "Generate directly into App Spec JSON using patch streaming.",
  },
  {
    mode: "json_render_with_image",
    label: "JSON + Image",
    description: "Use JSON render plus reference-image style/layout guidance.",
  },
  {
    mode: "prompt_builder",
    label: "Prompt Builder",
    description: "Send a generated app prompt to chat without switching panes.",
  },
  {
    mode: "mcp_server",
    label: "MCP Server",
    description:
      "Route generation through MCP tools (including Figma-oriented flows).",
  },
];

export const DEFAULT_APP_GENERATION_MODE: AppGenerationMode = "json_render";

export function buildDefaultAppGenerationPrompt(
  mode: AppGenerationMode,
): string {
  if (mode === "mcp_server") {
    return [
      "Use MCP tools to produce a high-fidelity UI implementation for this project.",
      "If Figma tools are available, either import an existing design or generate one in Figma first, then map it back into Setta's JSON-render app spec.",
      "Preserve clear hierarchy, responsive layout behavior, and practical defaults.",
    ].join(" ");
  }
  if (mode === "prompt_builder") {
    return [
      "Generate a practical, polished JSON-render app spec for this project.",
      "Use strong information hierarchy, clear spacing rhythm, and one primary action path.",
      "Persist the result into the project via Setta app-definition tools.",
    ].join(" ");
  }
  if (mode === "json_render_with_image") {
    return [
      "Generate a JSON-render app spec that matches the reference image as closely as possible.",
      "Prioritize layout composition first, then spacing, typography scale, and color intent.",
      "Stay within catalog constraints and preserve the closest visual approximation when exact parity is impossible.",
    ].join(" ");
  }
  return [
    "Generate a polished standalone JSON-render app spec.",
    "Use a strong hero section, clear content grouping, and consistent spacing/typography by default.",
    "Include one obvious primary action path and production-ready baseline structure.",
  ].join(" ");
}

export function buildHiddenChatAppGenerationPrompt({
  mode,
  prompt,
  catalogSummary,
  sectionsSummary,
  appSpecStreamingEnabled,
  referenceImageUrl,
  referenceImageNotes,
}: {
  mode: AppGenerationMode;
  prompt: string;
  catalogSummary: string;
  sectionsSummary: string;
  appSpecStreamingEnabled: boolean;
  referenceImageUrl: string | null;
  referenceImageNotes: string | null;
}): string {
  const normalizedPrompt = prompt.trim();
  const fallbackPrompt = buildDefaultAppGenerationPrompt(mode);
  const effectivePrompt = normalizedPrompt || fallbackPrompt;

  const deliveryInstructions = appSpecStreamingEnabled
    ? [
        "Streaming mode: ENABLED",
        "- DO NOT paste JSON into the chat.",
        "- Use MCP tool `setta__stream_app_definition` with newline-delimited JSON patch lines in `patches`.",
        "- For updates, omit baseAppSpec unless you need to patch an explicit snapshot.",
      ].join("\n")
    : [
        "Streaming mode: DISABLED",
        "- DO NOT paste JSON into the chat.",
        "- Use MCP tool `setta__set_app_definition` with full UITree JSON.",
        "- Optionally validate first with `setta__validate_app_definition`.",
      ].join("\n");

  const referenceImageLines =
    mode === "json_render_with_image" ||
    referenceImageUrl ||
    referenceImageNotes
      ? [
          "Reference-image guidance:",
          referenceImageUrl
            ? `- URL: ${referenceImageUrl}`
            : "- URL: (none provided; ask for one if needed).",
          referenceImageNotes
            ? `- Notes: ${referenceImageNotes}`
            : "- Notes: (none provided).",
          "- Match layout first, then spacing, typography, and color intent.",
          "- If exact parity is impossible, keep structural fidelity and explain compromises.",
        ].join("\n")
      : "";

  const mcpLines =
    mode === "mcp_server"
      ? [
          "MCP/Figma flow guidance:",
          "- Use MCP tools as the source of truth for design artifacts.",
          "- Support both paths: pull existing Figma design, or generate in Figma then pull back.",
          "- Convert retrieved design output into Setta app spec and persist.",
        ].join("\n")
      : "";

  return [
    `App generation mode: ${mode}`,
    "",
    "Goal:",
    effectivePrompt,
    "",
    "Delivery:",
    deliveryInstructions,
    "",
    referenceImageLines,
    referenceImageLines ? "" : "",
    mcpLines,
    mcpLines ? "" : "",
    catalogSummary,
    "",
    "Available sections (use section ids and param ids exactly):",
    sectionsSummary || "- (none)",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function isJsonRenderMode(mode: AppGenerationMode): boolean {
  return mode === "json_render" || mode === "json_render_with_image";
}
