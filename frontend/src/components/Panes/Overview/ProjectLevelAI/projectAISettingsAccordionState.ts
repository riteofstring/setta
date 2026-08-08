export const PROJECT_AI_SETTINGS_ACCORDION_ITEM_ORDER = [
  "project-ai-settings-llm-api-keys",
  "project-ai-settings-guardrails",
  "project-ai-settings-agent-profiles",
  "project-ai-settings-transcription-profiles",
  "project-ai-settings-prompt-templates",
  "project-ai-settings-external-agents",
] as const;

export type ProjectAISettingsAccordionItemValue =
  (typeof PROJECT_AI_SETTINGS_ACCORDION_ITEM_ORDER)[number];

export const PROJECT_AI_SETTINGS_ACCORDION_DEFAULT_OPEN_VALUES: Array<ProjectAISettingsAccordionItemValue> =
  ["project-ai-settings-llm-api-keys", "project-ai-settings-agent-profiles"];

const PROJECT_AI_SETTINGS_ACCORDION_ITEM_VALUE_SET = new Set<string>(
  PROJECT_AI_SETTINGS_ACCORDION_ITEM_ORDER,
);

export function normalizeProjectAISettingsAccordionOpenValues(
  openValues: Array<string>,
): Array<ProjectAISettingsAccordionItemValue> {
  const openValueSet = new Set(
    openValues.filter((value) =>
      PROJECT_AI_SETTINGS_ACCORDION_ITEM_VALUE_SET.has(value),
    ),
  );
  return PROJECT_AI_SETTINGS_ACCORDION_ITEM_ORDER.filter((value) =>
    openValueSet.has(value),
  );
}
