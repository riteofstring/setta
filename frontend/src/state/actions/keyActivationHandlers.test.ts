// @vitest-environment jsdom

import { useActiveSectionUI } from "state/activeSectionUI";
import { useProjectState } from "state/definitions";
import { useSettings } from "state/stores/uiPreferenceStores";
import { resetProjectStores } from "state/utils";
import {
  createCore,
  createDictSectionImpl,
  createSettingsState,
  createUserDefaultDictSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const projectStateCommandMocks = vi.hoisted(() => ({
  deleteAllActiveSections: vi.fn(),
  groupActiveSections: vi.fn(),
  ungroupActiveGroups: vi.fn(),
  unselectAllParams: vi.fn(() => false),
}));

vi.mock("components/Utils/FloatingBox", () => ({
  copyFloatingBoxContent: vi.fn(),
  copyFrozenFloatingBoxContent: vi.fn(),
  decrementFloatingBoxIdx: vi.fn(),
  decrementFrozenFloatingBoxIdx: vi.fn(),
  disableFloatingBox: vi.fn(),
  enableFloatingBox: vi.fn(),
  freezeFloatingBox: vi.fn(),
  getConvertFloatingBoxToSectionFn: vi.fn(() => vi.fn()),
  incrementFloatingBoxIdx: vi.fn(),
  incrementFrozenFloatingBoxIdx: vi.fn(),
  removeFrozenFloatingBox: vi.fn(),
}));

vi.mock("./projectStateCommands", () => projectStateCommandMocks);

import {
  activeSectionHasSelectedParams,
  onEscapeKey,
  resolveTabParamAction,
} from "./keyActivationHandlers";

function configureActiveCodeSection(selectedParams: Array<string>) {
  const sectionId = "section-active";
  const variantId = "variant-active";
  const implId = "impl-active";

  useProjectState.setState((state) => {
    state.sections[sectionId] = createCore({ id: sectionId });
    state.projectConfig.sectionVariantMap[sectionId] = variantId;
    state.sectionVariants[variantId] = createVariant({
      id: variantId,
      impl: implId,
      nonPresetImpls: [implId],
      name: "variant-active",
    });
    const impl = createDictSectionImpl(createUserDefaultDictSectionImpl(), {
      id: implId,
    });
    impl.selectedParams = [...selectedParams];
    state.sectionImpls[implId] = impl;
  });
  useActiveSectionUI.setState({ activeIds: [sectionId] });
}

describe("keyActivationHandlers", () => {
  beforeEach(() => {
    resetProjectStores();
    useSettings.setState(createSettingsState());
    projectStateCommandMocks.unselectAllParams.mockReturnValue(false);
  });

  afterEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
  });

  it("resolves tab indentation actions from the configured shortcuts", () => {
    // Tab handling should respect whichever shortcut owns indent vs unindent.
    useSettings.setState(
      createSettingsState({
        shortcuts: {
          paramIndentShortcut: "Tab",
          paramUnindentShortcut: "Shift + Tab",
        },
      }),
    );

    expect(
      resolveTabParamAction(new KeyboardEvent("keydown", { key: "Tab" })),
    ).toBe("indent");
    expect(
      resolveTabParamAction(
        new KeyboardEvent("keydown", { key: "Tab", shiftKey: true }),
      ),
    ).toBe("unindent");
  });

  it("detects whether the active code section currently has selected params", () => {
    // Param-tab overrides should only run when the active section actually has a param selection.
    configureActiveCodeSection(["param-a"]);
    expect(activeSectionHasSelectedParams()).toBe(true);

    configureActiveCodeSection([]);
    expect(activeSectionHasSelectedParams()).toBe(false);
  });

  it("clears the active section selection when Escape is pressed inside the active section node", () => {
    // Escape should release selection when there are no selected params left to unselect.
    configureActiveCodeSection([]);

    const sectionNode = document.createElement("div");
    sectionNode.className = "react-flow__node";
    sectionNode.setAttribute("data-id", "section-active");
    const input = document.createElement("input");
    sectionNode.append(input);
    document.body.append(sectionNode);
    input.focus();

    onEscapeKey(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
      }),
    );

    expect(useActiveSectionUI.getState().activeIds).toEqual(["section-active"]);

    onEscapeKey({
      key: "Escape",
      target: input,
    } as KeyboardEvent);

    expect(projectStateCommandMocks.unselectAllParams).toHaveBeenCalledTimes(2);
    expect(useActiveSectionUI.getState().activeIds).toEqual([]);
  });
});
