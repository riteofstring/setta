import { describe, expect, it } from "vitest";
import {
  PROJECT_AI_SETTINGS_ACCORDION_ITEM_ORDER,
  normalizeProjectAISettingsAccordionOpenValues,
} from "./projectAISettingsAccordionState";

describe("projectAISettingsAccordionState", () => {
  it("keeps a stable accordion order while dropping unknown values", () => {
    // Persisted localStorage payloads may include stale keys after refactors.
    const normalized = normalizeProjectAISettingsAccordionOpenValues([
      "project-ai-settings-external-agents",
      "stale-value",
      "project-ai-settings-agent-profiles",
      "project-ai-settings-llm-api-keys",
    ]);

    expect(normalized).toEqual([
      "project-ai-settings-llm-api-keys",
      "project-ai-settings-agent-profiles",
      "project-ai-settings-external-agents",
    ]);
  });

  it("deduplicates repeated accordion values from localStorage", () => {
    // Duplicate values can happen when users rapidly toggle sections.
    const normalized = normalizeProjectAISettingsAccordionOpenValues([
      "project-ai-settings-prompt-templates",
      "project-ai-settings-prompt-templates",
      "project-ai-settings-llm-api-keys",
      "project-ai-settings-llm-api-keys",
    ]);

    expect(normalized).toEqual([
      "project-ai-settings-llm-api-keys",
      "project-ai-settings-prompt-templates",
    ]);
    expect(normalized).toHaveLength(2);
    expect(
      normalized.every((value) =>
        PROJECT_AI_SETTINGS_ACCORDION_ITEM_ORDER.includes(value),
      ),
    ).toBe(true);
  });
});
