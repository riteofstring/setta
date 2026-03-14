import { type AppGenerationMode } from "state/types/appGenerationMode";

export type { AppGenerationMode };

type AppGenerationModeOption = {
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

const DEFAULT_APP_GENERATION_MODE: AppGenerationMode = "json_render";

export function isAppGenerationMode(
  value: unknown,
): value is AppGenerationMode {
  return APP_GENERATION_MODE_OPTIONS.some((entry) => entry.mode === value);
}

export function coerceAppGenerationMode(value: unknown): AppGenerationMode {
  if (isAppGenerationMode(value)) {
    return value;
  }
  return DEFAULT_APP_GENERATION_MODE;
}

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
  referenceImageUrl,
  referenceImageNotes,
}: {
  mode: AppGenerationMode;
  prompt: string;
  catalogSummary: string;
  sectionsSummary: string;
  referenceImageUrl: string | null;
  referenceImageNotes: string | null;
}): string {
  const normalizedPrompt = prompt.trim();
  const fallbackPrompt = buildDefaultAppGenerationPrompt(mode);
  const effectivePrompt = normalizedPrompt || fallbackPrompt;

  const referenceImageLines =
    mode === "json_render_with_image"
      ? [
          "Reference-image context:",
          referenceImageUrl
            ? `- URL: ${referenceImageUrl}`
            : "- URL: (none provided; ask for one if needed).",
          referenceImageNotes
            ? `- Notes: ${referenceImageNotes}`
            : "- Notes: (none provided).",
        ].join("\n")
      : "";

  return [
    `App generation mode: ${mode}`,
    "",
    "Goal:",
    effectivePrompt,
    "",
    referenceImageLines,
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
