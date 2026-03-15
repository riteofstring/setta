import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  SectionTypeEnum,
  createCodeSectionImpl,
  createProjectConfig,
  createTerminalSectionImpl,
  type Core,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  resolveParentIds,
  shouldUseAttachedTerminalRoute,
} from "./moveSectionQueries";

describe("moveSectionQueries", () => {
  const projectConfigId = "project-1";
  const codeSectionId = "code-section";
  const terminalSectionId = "terminal-section";
  const otherSectionId = "other-section";
  const codeVariantId = "code-variant";
  const terminalVariantId = "terminal-variant";
  const otherVariantId = "other-variant";
  const codeImplId = "code-impl";
  const terminalImplId = "terminal-impl";
  const otherImplId = "other-impl";

  beforeEach(() => {
    resetProjectStores();

    const codeCore: Core = {
      id: codeSectionId,
      name: "Code Section",
      displayName: "",
      variants: [codeVariantId],
      defaultVariant: codeVariantId,
      sharedModifier: {},
      unsharedKeys: [],
    };
    const terminalCore: Core = {
      id: terminalSectionId,
      name: "Terminal Section",
      displayName: "",
      variants: [terminalVariantId],
      defaultVariant: terminalVariantId,
      sharedModifier: {},
      unsharedKeys: [],
    };
    const otherCore: Core = {
      id: otherSectionId,
      name: "Other Section",
      displayName: "",
      variants: [otherVariantId],
      defaultVariant: otherVariantId,
      sharedModifier: {},
      unsharedKeys: [],
    };
    const codeVariant: Variant = {
      id: codeVariantId,
      name: "Code Variant",
      impl: codeImplId,
      nonPresetImpls: [],
      modifier: {},
      isFrozen: false,
    };
    const terminalVariant: Variant = {
      id: terminalVariantId,
      name: "Terminal Variant",
      impl: terminalImplId,
      nonPresetImpls: [],
      modifier: {},
      isFrozen: false,
    };
    const otherVariant: Variant = {
      id: otherVariantId,
      name: "Other Variant",
      impl: otherImplId,
      nonPresetImpls: [],
      modifier: {},
      isFrozen: false,
    };

    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: projectConfigId,
        sectionVariantMap: {
          [codeSectionId]: codeVariantId,
          [terminalSectionId]: terminalVariantId,
          [otherSectionId]: otherVariantId,
        },
      }),
      sections: {
        [codeSectionId]: codeCore,
        [terminalSectionId]: terminalCore,
        [otherSectionId]: otherCore,
      },
      sectionVariants: {
        [codeVariantId]: codeVariant,
        [terminalVariantId]: terminalVariant,
        [otherVariantId]: otherVariant,
      },
      sectionImpls: {
        [codeImplId]: createCodeSectionImpl({
          id: codeImplId,
          type: SectionTypeEnum.Code,
        }),
        [terminalImplId]: createTerminalSectionImpl({
          id: terminalImplId,
          type: SectionTypeEnum.Terminal,
        }),
        [otherImplId]: createTerminalSectionImpl({
          id: otherImplId,
          type: SectionTypeEnum.Terminal,
        }),
      },
      parentSectionMap: {
        [codeSectionId]: null,
        [terminalSectionId]: codeSectionId,
      },
    });
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("uses the attached-terminal route only for a single terminal dropped into a code section", () => {
    // The attached-terminal optimization only applies to one terminal targeting one code parent.
    const state = useProjectState.getState();

    expect(
      shouldUseAttachedTerminalRoute({
        state,
        sectionIds: [terminalSectionId],
        newParentId: codeSectionId,
      }),
    ).toBe(true);
    expect(
      shouldUseAttachedTerminalRoute({
        state,
        sectionIds: [terminalSectionId, otherSectionId],
        newParentId: codeSectionId,
      }),
    ).toBe(false);
    expect(
      shouldUseAttachedTerminalRoute({
        state,
        sectionIds: [terminalSectionId],
        newParentId: null,
      }),
    ).toBe(false);
  });

  it("falls back to null for sections without a recorded parent", () => {
    // Parent resolution should preserve explicit nulls for top-level sections and missing entries.
    const parentsById = resolveParentIds(useProjectState.getState(), [
      codeSectionId,
      terminalSectionId,
      otherSectionId,
    ]);

    expect(parentsById).toEqual({
      [codeSectionId]: null,
      [terminalSectionId]: codeSectionId,
      [otherSectionId]: null,
    });
  });
});
