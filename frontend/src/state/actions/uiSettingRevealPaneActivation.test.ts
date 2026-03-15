import { useActiveSectionUI } from "state/activeSectionUI";
import { useProjectState } from "state/definitions";
import { useLocalStorage } from "state/stores/uiPreferenceStores";
import { resetProjectStores } from "state/utils";
import { UIEditorTabNameEnum } from "utils/constants";
import {
  createCodeSectionImpl,
  createCore,
  createProjectConfig,
  createUserDefaultCodeSectionImpl,
  createVariant,
  type UISettingRevealTarget,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createEmptyRevealMutationDiff } from "./uiSettingRevealMutationCapture";
import {
  applyRequestedActiveSectionForReveal,
  openPaneForRevealTarget,
} from "./uiSettingRevealPaneActivation";

function createRevealTarget(
  overrides: Partial<UISettingRevealTarget>,
): UISettingRevealTarget {
  return {
    settingId: "core.watch_code.enabled",
    side: "left",
    overviewTabKey: "Overview",
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

function setActiveCodeSection(sectionId: string): void {
  const variantId = `variant-${sectionId}`;
  const implId = `impl-${sectionId}`;
  useProjectState.setState((state) => {
    state.projectConfig.sectionVariantMap[sectionId] = variantId;
    state.sections[sectionId] = createCore({ id: sectionId });
    state.sectionVariants[variantId] = createVariant({
      id: variantId,
      impl: implId,
      nonPresetImpls: [implId],
      name: `variant-${sectionId}`,
    });
    state.sectionImpls[implId] = createCodeSectionImpl(
      createUserDefaultCodeSectionImpl(),
      {
        id: implId,
      },
    );
  });
  useActiveSectionUI.setState({ activeIds: [sectionId] });
}

describe("uiSettingRevealPaneActivation", () => {
  beforeEach(() => {
    resetProjectStores();
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({ id: "project-1" });
    });
    useLocalStorage.setState({
      overviewVis: false,
      overviewTab: "Overview",
      uiEditorVis: false,
      uiEditorTab: {},
    });
    useActiveSectionUI.setState({ activeIds: [] });
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("activates the requested section in ui-only mode for matching project context", () => {
    const mutationDiff = createEmptyRevealMutationDiff();

    const result = applyRequestedActiveSectionForReveal({
      requestedActiveSectionId: "section-target",
      fallbackProjectConfigId: "project-1",
      mutationDiff,
    });

    expect(result).toEqual({ ok: true });
    expect(useActiveSectionUI.getState().activeIds).toEqual(["section-target"]);
    expect(
      mutationDiff.touchedProjectStateActiveIdsProjectConfigIds.has(
        "project-1",
      ),
    ).toBe(true);
  });

  it("opens the overview pane for a left-side reveal target", () => {
    const mutationDiff = createEmptyRevealMutationDiff();

    const result = openPaneForRevealTarget(
      createRevealTarget({
        side: "left",
        overviewTabKey: "RunInstructions",
      }),
      mutationDiff,
    );

    expect(result).toEqual({ ok: true });
    expect(useLocalStorage.getState()).toMatchObject({
      overviewVis: true,
      overviewTab: "RunInstructions",
    });
    expect(mutationDiff.touchedOverviewVis).toBe(true);
    expect(mutationDiff.touchedOverviewTab).toBe(true);
  });

  it("opens the ui editor tab for the active section type on right-side reveals", () => {
    const mutationDiff = createEmptyRevealMutationDiff();
    setActiveCodeSection("section-code");

    const result = openPaneForRevealTarget(
      createRevealTarget({
        side: "right",
        overviewTabKey: null,
        uiEditorTabName: UIEditorTabNameEnum.SectionConfig,
      }),
      mutationDiff,
    );

    expect(result).toEqual({ ok: true });
    expect(useLocalStorage.getState()).toMatchObject({
      uiEditorVis: true,
      uiEditorTab: {
        Code: UIEditorTabNameEnum.SectionConfig,
      },
    });
    expect(mutationDiff.touchedUiEditorVis).toBe(true);
    expect(mutationDiff.touchedUiEditorTabSectionTypes.has("Code")).toBe(true);
  });
});
