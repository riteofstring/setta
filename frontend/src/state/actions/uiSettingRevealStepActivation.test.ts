import { useLocalStorage } from "state/stores/uiPreferenceStores";
import { resetProjectStores } from "state/utils";
import type { UISettingRevealTarget } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createEmptyRevealMutationDiff } from "./uiSettingRevealMutationCapture";
import { applyRevealActivationSteps } from "./uiSettingRevealStepActivation";

function createRevealTarget(
  overrides: Partial<UISettingRevealTarget>,
): UISettingRevealTarget {
  return {
    settingId: "core.watch_code.enabled",
    side: "left",
    overviewTabKey: "RunInstructions",
    uiEditorTabName: null,
    pluginId: null,
    paneId: null,
    strategy: "dom_anchor",
    anchorId: "core.watch_code.enabled",
    pluginRevealKey: null,
    revealActivationSteps: [],
    ...overrides,
  };
}

describe("uiSettingRevealStepActivation", () => {
  beforeEach(() => {
    resetProjectStores();
    useLocalStorage.setState({
      watchCodePortalOpen: false,
      projectChatAuxViewByProjectConfigId: {},
      runInstructionsAccordionOpenValuesByProjectConfigId: {},
      projectAiSettingsAccordionOpenValuesByProjectConfigId: {},
    });
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("opens the watch-code portal and run instructions accordion entries", () => {
    const mutationDiff = createEmptyRevealMutationDiff();

    applyRevealActivationSteps({
      target: createRevealTarget({
        settingId: "core.watch_code.enabled",
        revealActivationSteps: [
          {
            type: "run_instructions_accordion_item",
            itemValue: "run-instructions-codegen-targets",
          },
        ],
      }),
      fallbackProjectConfigId: "project-1",
      mutationDiff,
    });

    expect(useLocalStorage.getState()).toMatchObject({
      watchCodePortalOpen: true,
      runInstructionsAccordionOpenValuesByProjectConfigId: {
        "project-1": ["run-instructions-codegen-targets"],
      },
    });
    expect(mutationDiff.touchedWatchCodePortalOpen).toBe(true);
    expect(
      mutationDiff.touchedRunInstructionsProjectConfigIds.has("project-1"),
    ).toBe(true);
  });

  it("opens project AI accordion entries and switches the aux view", () => {
    const mutationDiff = createEmptyRevealMutationDiff();

    applyRevealActivationSteps({
      target: createRevealTarget({
        settingId: "project.ai_settings.model",
        revealActivationSteps: [
          {
            type: "project_ai_settings_accordion_item",
            itemValue: "project-ai-settings-prompt-templates",
          },
        ],
      }),
      fallbackProjectConfigId: "project-1",
      mutationDiff,
    });

    expect(useLocalStorage.getState()).toMatchObject({
      projectAiSettingsAccordionOpenValuesByProjectConfigId: {
        "project-1": ["project-ai-settings-prompt-templates"],
      },
      projectChatAuxViewByProjectConfigId: {
        "project-1": "ai_settings",
      },
    });
    expect(mutationDiff.touchedProjectAiProjectConfigIds.has("project-1")).toBe(
      true,
    );
    expect(
      mutationDiff.touchedProjectChatAuxViewProjectConfigIds.has("project-1"),
    ).toBe(true);
  });
});
