export type AppGenerationMode =
  | "json_render"
  | "json_render_with_image"
  | "prompt_builder"
  | "mcp_server";

function isAppGenerationMode(value: unknown): value is AppGenerationMode {
  return (
    value === "json_render" ||
    value === "json_render_with_image" ||
    value === "prompt_builder" ||
    value === "mcp_server"
  );
}

export function parseAppGenerationMode(
  value: unknown,
): AppGenerationMode | null {
  return isAppGenerationMode(value) ? value : null;
}
