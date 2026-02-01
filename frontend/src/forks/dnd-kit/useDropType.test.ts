import { useDndState } from "forks/dnd-kit/dndState";
import { BehaviorDropTypeEnum } from "forks/dnd-kit/dropTypes";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  SectionTypeEnum,
  createProjectConfig,
  createTerminalSectionImpl,
  type BaseSectionImplUnion,
  type Core,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getBehaviorDropType } from "./useDropType";

describe("getBehaviorDropType", () => {
  const genSectionId = "gen-section";
  const terminalSectionId = "terminal-section";
  const genVariantId = "gen-variant";
  const terminalVariantId = "terminal-variant";
  const genImplId = "gen-impl";
  const terminalImplId = "terminal-impl";

  beforeEach(() => {
    resetProjectStores();
    useDndState.setState({ draggingIds: [] });
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("allows terminal drop onto gen python code sections", () => {
    const genCore: Core = {
      id: genSectionId,
      name: "Generated Code Section",
      displayName: "",
      variants: [genVariantId],
      defaultVariant: genVariantId,
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
    const genVariant: Variant = {
      id: genVariantId,
      name: "Gen Variant",
      impl: genImplId,
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
    const genImpl: BaseSectionImplUnion = {
      type: SectionTypeEnum.GenPythonCode,
      id: genImplId,
      name: "Generated Code Impl",
      isFrozen: false,
      isInOtherProjectConfigs: false,
      size: { width: 500, height: 300 },
      aspectRatio: false,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: false,
      positionAndSizeLocked: false,
      isPreset: false,
      children: [],
      code: "",
      codeFileBinding: null,
      attachedTerminalSectionId: null,
    };

    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: {
          [genSectionId]: genVariantId,
          [terminalSectionId]: terminalVariantId,
        },
        topLevelSections: {
          [genSectionId]: { x: 10, y: 20, zIndex: 1 },
          [terminalSectionId]: { x: 30, y: 40, zIndex: 2 },
        },
      }),
      sections: {
        [genSectionId]: genCore,
        [terminalSectionId]: terminalCore,
      },
      sectionVariants: {
        [genVariantId]: genVariant,
        [terminalVariantId]: terminalVariant,
      },
      sectionImpls: {
        [genImplId]: genImpl,
        [terminalImplId]: createTerminalSectionImpl({
          id: terminalImplId,
          type: SectionTypeEnum.Terminal,
        }),
      },
      parentSectionMap: {
        [genSectionId]: null,
        [terminalSectionId]: null,
      },
    });

    const behavior = getBehaviorDropType(terminalSectionId, genSectionId);

    expect(behavior).not.toBe(BehaviorDropTypeEnum.INVALID);
    expect(behavior).toBeNull();
  });
});
