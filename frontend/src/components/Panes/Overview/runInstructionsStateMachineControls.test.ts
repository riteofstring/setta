import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  SectionTypeEnum,
  createCore,
  createProjectConfig,
  createSectionSize,
  createVariant,
  type BaseSectionImplUnion,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectRunInstructionsStateMachineControls } from "./runInstructionsStateMachineControls";

const COMMON_MACHINE_IMPL_FIELDS = {
  isFrozen: false,
  isInOtherProjectConfigs: false,
  tagColor: null,
  styleColor: null,
  aspectRatio: false,
  aspectRatioExtraHeight: 0,
  aspectRatioExtraWidth: 0,
  isMinimized: false,
  positionAndSizeLocked: false,
  isPreset: false,
} as const;

function seedWorkflowSections(
  entries: Array<{
    sectionId: string;
    sectionName: string;
    variantId: string;
    impl: BaseSectionImplUnion;
    topLevel: boolean;
  }>,
): void {
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: Object.fromEntries(
        entries.map((entry) => [entry.sectionId, entry.variantId]),
      ),
      topLevelSections: Object.fromEntries(
        entries
          .filter((entry) => entry.topLevel)
          .map((entry, index) => [
            entry.sectionId,
            { x: index * 40, y: 0, zIndex: index, w: null, h: null },
          ]),
      ),
    });
    state.sections = Object.fromEntries(
      entries.map((entry) => [
        entry.sectionId,
        createCore({
          id: entry.sectionId,
          name: entry.sectionName,
          variants: [entry.variantId],
          defaultVariant: entry.variantId,
        }),
      ]),
    );
    state.sectionVariants = Object.fromEntries(
      entries.map((entry) => [
        entry.variantId,
        createVariant({
          id: entry.variantId,
          name: `${entry.sectionName} Variant`,
          impl: entry.impl.id,
          nonPresetImpls: [],
        }),
      ]),
    );
    state.sectionImpls = Object.fromEntries(
      entries.map((entry) => [entry.impl.id, entry.impl]),
    );
    state.previewSectionVariantMap = {};
  });
}

describe("collectRunInstructionsStateMachineControls", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("collects sorted top-level workflow start sections and falls back to section names", () => {
    seedWorkflowSections([
      {
        sectionId: "section-start-a",
        sectionName: "Ignored Section Name",
        variantId: "variant-start-a",
        topLevel: true,
        impl: {
          id: "impl-start-a",
          type: SectionTypeEnum.StateMachineStart,
          name: "Start A",
          size: createSectionSize({ width: 240, height: 96 }),
          machineGroupId: "workflow-b",
          label: "Alpha Flow",
          ...COMMON_MACHINE_IMPL_FIELDS,
        },
      },
      {
        sectionId: "section-start-b",
        sectionName: "Alpha Flow",
        variantId: "variant-start-b",
        topLevel: true,
        impl: {
          id: "impl-start-b",
          type: SectionTypeEnum.StateMachineStart,
          name: "Start B",
          size: createSectionSize({ width: 240, height: 96 }),
          machineGroupId: "workflow-a",
          label: "",
          ...COMMON_MACHINE_IMPL_FIELDS,
        },
      },
      {
        sectionId: "section-start-c",
        sectionName: "Beta Flow",
        variantId: "variant-start-c",
        topLevel: true,
        impl: {
          id: "impl-start-c",
          type: SectionTypeEnum.StateMachineStart,
          name: "Start C",
          size: createSectionSize({ width: 240, height: 96 }),
          machineGroupId: "workflow-c",
          label: "   ",
          ...COMMON_MACHINE_IMPL_FIELDS,
        },
      },
      {
        sectionId: "section-start-blank-group",
        sectionName: "Blank Group",
        variantId: "variant-start-blank-group",
        topLevel: true,
        impl: {
          id: "impl-start-blank-group",
          type: SectionTypeEnum.StateMachineStart,
          name: "Start Blank Group",
          size: createSectionSize({ width: 240, height: 96 }),
          machineGroupId: "   ",
          label: "Hidden Flow",
          ...COMMON_MACHINE_IMPL_FIELDS,
        },
      },
      {
        sectionId: "section-end",
        sectionName: "End Flow",
        variantId: "variant-end",
        topLevel: true,
        impl: {
          id: "impl-end",
          type: SectionTypeEnum.StateMachineEnd,
          name: "End",
          size: createSectionSize({ width: 240, height: 96 }),
          machineGroupId: "workflow-end",
          label: "End Flow",
          ...COMMON_MACHINE_IMPL_FIELDS,
        },
      },
      {
        sectionId: "section-start-nested",
        sectionName: "Nested Flow",
        variantId: "variant-start-nested",
        topLevel: false,
        impl: {
          id: "impl-start-nested",
          type: SectionTypeEnum.StateMachineStart,
          name: "Nested Start",
          size: createSectionSize({ width: 240, height: 96 }),
          machineGroupId: "workflow-nested",
          label: "Nested Flow",
          ...COMMON_MACHINE_IMPL_FIELDS,
        },
      },
    ]);

    expect(
      collectRunInstructionsStateMachineControls(useProjectState.getState()),
    ).toEqual([
      {
        sectionId: "section-start-b",
        label: "Alpha Flow",
        machineGroupId: "workflow-a",
      },
      {
        sectionId: "section-start-a",
        label: "Alpha Flow",
        machineGroupId: "workflow-b",
      },
      {
        sectionId: "section-start-c",
        label: "Beta Flow",
        machineGroupId: "workflow-c",
      },
    ]);
  });

  it("fails when a top-level section is missing from project state", () => {
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({
        id: "project-1",
        topLevelSections: {
          "missing-section": { x: 0, y: 0, zIndex: 0, w: null, h: null },
        },
      });
      state.sections = {};
      state.sectionVariants = {};
      state.sectionImpls = {};
      state.previewSectionVariantMap = {};
    });

    expect(() =>
      collectRunInstructionsStateMachineControls(useProjectState.getState()),
    ).toThrowError(
      "Top-level section missing-section is missing from project state.",
    );
  });
});
