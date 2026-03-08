import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createCore,
  createProjectConfig,
  createSectionSize,
  createStateMachineStartSectionImpl,
  createVariant,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getStateMachineDraftWarning } from "./stateMachineDraftValidation";

function seedWorkflowNodes({
  startMachineGroups,
  endMachineGroups,
}: {
  startMachineGroups: string[];
  endMachineGroups: string[];
}): void {
  const sectionVariantMap: Record<string, string> = {};
  const sections: ReturnType<typeof useProjectState.getState>["sections"] = {};
  const sectionVariants: ReturnType<
    typeof useProjectState.getState
  >["sectionVariants"] = {};
  const sectionImpls: ReturnType<
    typeof useProjectState.getState
  >["sectionImpls"] = {};

  startMachineGroups.forEach((machineGroupId, index) => {
    const sectionId = `start-${index}`;
    const variantId = `variant-start-${index}`;
    const implId = `impl-start-${index}`;
    sectionVariantMap[sectionId] = variantId;
    sections[sectionId] = createCore({
      id: sectionId,
      name: `Start ${index}`,
      variants: [variantId],
      defaultVariant: variantId,
    });
    sectionVariants[variantId] = createVariant({
      id: variantId,
      name: `Start Variant ${index}`,
      impl: implId,
      nonPresetImpls: [],
    });
    sectionImpls[implId] = createStateMachineStartSectionImpl(
      {},
      {
        id: implId,
        machineGroupId,
        label: "Start",
      },
    );
  });

  endMachineGroups.forEach((machineGroupId, index) => {
    const sectionId = `end-${index}`;
    const variantId = `variant-end-${index}`;
    const implId = `impl-end-${index}`;
    sectionVariantMap[sectionId] = variantId;
    sections[sectionId] = createCore({
      id: sectionId,
      name: `End ${index}`,
      variants: [variantId],
      defaultVariant: variantId,
    });
    sectionVariants[variantId] = createVariant({
      id: variantId,
      name: `End Variant ${index}`,
      impl: implId,
      nonPresetImpls: [],
    });
    sectionImpls[implId] = {
      type: SectionTypeEnum.StateMachineEnd,
      id: implId,
      name: `End ${index}`,
      isFrozen: false,
      isInOtherProjectConfigs: false,
      tagColor: null,
      styleColor: null,
      size: createSectionSize({ width: 240, height: 96 }),
      aspectRatio: false,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: false,
      positionAndSizeLocked: false,
      isPreset: false,
      machineGroupId,
      label: "End",
    };
  });

  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap,
    });
    state.sections = sections;
    state.sectionVariants = sectionVariants;
    state.sectionImpls = sectionImpls;
    state.previewSectionVariantMap = {};
  });
}

describe("state machine draft validation", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("warns when a machine group is missing both Start and End sections", () => {
    seedWorkflowNodes({
      startMachineGroups: [],
      endMachineGroups: [],
    });

    expect(
      getStateMachineDraftWarning(useProjectState.getState(), "workflow-main"),
    ).toEqual(
      expect.objectContaining({
        startCount: 0,
        endCount: 0,
      }),
    );
  });

  it("warns when a machine group has multiple Start sections", () => {
    seedWorkflowNodes({
      startMachineGroups: ["workflow-main", "workflow-main"],
      endMachineGroups: ["workflow-main"],
    });

    expect(
      getStateMachineDraftWarning(useProjectState.getState(), "workflow-main"),
    ).toEqual(
      expect.objectContaining({
        startCount: 2,
        endCount: 1,
      }),
    );
  });

  it("returns null for a runnable machine group", () => {
    seedWorkflowNodes({
      startMachineGroups: ["workflow-main"],
      endMachineGroups: ["workflow-main"],
    });

    expect(
      getStateMachineDraftWarning(useProjectState.getState(), "workflow-main"),
    ).toBeNull();
  });
});
