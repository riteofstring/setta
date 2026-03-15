import { clearAppSpecPatchStream } from "state/appSpecPatchStreaming";
import { useAppDefinition, useAppPreview } from "state/stores/appStores";
import { AppDefinition, ToolChatMessage } from "utils/generatedTypes";
import { addTemporaryNotification } from "./notifications";

const APP_DEFINITION_TOOL_NAMES = new Set([
  "setta__set_app_definition",
  "setta__update_app_definition",
  "setta__stream_app_definition",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractToolStructuredContent(
  toolResult: unknown,
): Record<string, unknown> | null {
  if (!isRecord(toolResult)) {
    return null;
  }
  const structured = toolResult.structuredContent;
  if (!structured) {
    return null;
  }
  if (!isRecord(structured)) {
    return null;
  }
  return structured;
}

export function maybeApplyAppDefinitionToolResult(
  toolMessage: ToolChatMessage,
): void {
  const toolName =
    typeof toolMessage.tool_name === "string" ? toolMessage.tool_name : null;
  if (!toolName || !APP_DEFINITION_TOOL_NAMES.has(toolName)) {
    return;
  }
  if (toolMessage.is_error) {
    if (toolName === "setta__stream_app_definition") {
      clearAppSpecPatchStream(toolMessage.tool_call_id);
      // Keep the last streamed preview visible even if the tool call fails validation.
    }
    return;
  }
  const structured = extractToolStructuredContent(toolMessage.result);
  if (!structured) {
    return;
  }
  const hasSpec = Object.prototype.hasOwnProperty.call(structured, "appSpec");
  const hasDefinition = Object.prototype.hasOwnProperty.call(
    structured,
    "appDefinition",
  );
  if (!hasSpec && !hasDefinition) {
    return;
  }

  const nextSpec = hasSpec ? (structured.appSpec as unknown) : undefined;
  const nextDefinition = hasDefinition
    ? (structured.appDefinition as unknown)
    : undefined;

  useAppDefinition.setState((state) => ({
    appSpec: nextSpec === undefined ? state.appSpec : nextSpec ?? null,
    appDefinition:
      nextDefinition === undefined
        ? state.appDefinition
        : ((nextDefinition ?? null) as AppDefinition | null),
  }));
  useAppPreview.setState({
    previewSpecOverride: undefined,
    aiPreviewSpecOverride: undefined,
    previewThemeOverride: undefined,
    previewAssetsOverride: undefined,
  });
  if (toolName === "setta__stream_app_definition") {
    clearAppSpecPatchStream(toolMessage.tool_call_id);
  }
  addTemporaryNotification("App spec updated.");
}
