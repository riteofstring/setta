import { useActiveSectionUI } from "state/activeSectionUI";
import { useLocalStorage, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { UIEditorTabNameEnum } from "utils/constants";
import {
  SectionTypeEnum,
  createCore,
  createDictSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it } from "vitest";
import { showParamUITypeTab, showVersionsTab } from "./paneFns";

function configureActiveDictSection() {
  const sectionId = "section-dict";
  const variantId = "variant-dict";
  const implId = "impl-dict";

  useProjectState.setState((state) => {
    state.sections[sectionId] = createCore({ id: sectionId });
    state.projectConfig.sectionVariantMap[sectionId] = variantId;
    state.sectionVariants[variantId] = createVariant({
      id: variantId,
      impl: implId,
      nonPresetImpls: [implId],
      name: "dict-variant",
    });
    state.sectionImpls[implId] = createDictSectionImpl({ id: implId });
  });
  useActiveSectionUI.setState({ activeIds: [sectionId] });
}

describe("paneFns tab helpers", () => {
  beforeEach(() => {
    resetProjectStores();
    configureActiveDictSection();
    useLocalStorage.setState((state) => ({
      uiEditorVis: true,
      uiEditorTab: {
        ...state.uiEditorTab,
        [SectionTypeEnum.Dict]: UIEditorTabNameEnum.SectionConfig,
      },
    }));
  });

  it("switches the active dict section to the variants tab", () => {
    showVersionsTab();

    expect(useLocalStorage.getState().uiEditorTab[SectionTypeEnum.Dict]).toBe(
      UIEditorTabNameEnum.SectionVariantsConfig,
    );
  });

  it("switches the active dict section to the UI config tab", () => {
    showParamUITypeTab();

    expect(useLocalStorage.getState().uiEditorTab[SectionTypeEnum.Dict]).toBe(
      UIEditorTabNameEnum.UIConfig,
    );
  });
});
