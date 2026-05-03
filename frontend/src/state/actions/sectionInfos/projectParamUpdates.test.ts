import {
  getNextPendingOperations,
  receiveProjectParamUpdate,
} from "state/actions/sectionInfos";
import {
  usePendingOperations,
  useProjectState,
  type ZustandProjectState,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  CodeObjTypeEnum,
  createCore,
  createProjectChatWindowingState,
  createProjectConfig,
  createSingletonSections,
  createSwitchParamCodeObjImpl,
  createVariant,
  type BaseChildlessCodeObjImplUnion,
  type ProjectParamUpdateContent,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("receiveProjectParamUpdate", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  it("applies the backend code object payload and clears completed pending ops", () => {
    seedProjectParamState("initial");
    const completedApply = vi.fn();
    usePendingOperations.setState({
      pending: [
        {
          acknowledged: false,
          apply: completedApply,
          opId: "completed-op",
        },
        {
          acknowledged: false,
          apply: (state) => {
            const impl = state.codeObjImpls[
              "param-impl"
            ] as BaseChildlessCodeObjImplUnion;
            impl.value = "local-pending";
          },
          opId: "pending-op",
        },
      ],
    });

    receiveProjectParamUpdate(
      paramUpdateContent({
        completedOpIds: ["completed-op"],
        pendingOpIds: ["pending-op"],
        value: "backend",
      }),
    );

    expect(completedApply).not.toHaveBeenCalled();
    const impl = useProjectState.getState().codeObjImpls[
      "param-impl"
    ] as BaseChildlessCodeObjImplUnion;
    expect(impl.value).toBe("local-pending");
    expect(usePendingOperations.getState().pending).toEqual([
      expect.objectContaining({
        acknowledged: true,
        opId: "pending-op",
      }),
    ]);
  });

  it("ignores updates for a different current project", () => {
    seedProjectParamState("initial");

    receiveProjectParamUpdate(
      paramUpdateContent({
        projectConfigId: "other-project",
        value: "backend",
      }),
    );

    const impl = useProjectState.getState().codeObjImpls[
      "param-impl"
    ] as BaseChildlessCodeObjImplUnion;
    expect(impl.value).toBe("initial");
  });
});

describe("getNextPendingOperations", () => {
  it("marks backend-pending ops acknowledged and removes completed ops", () => {
    const keepApply = vi.fn();
    expect(
      getNextPendingOperations(
        [
          { acknowledged: false, apply: vi.fn(), opId: "done" },
          { acknowledged: false, apply: keepApply, opId: "pending" },
        ],
        new Set(["done"]),
        new Set(["pending"]),
      ),
    ).toEqual([
      {
        acknowledged: true,
        apply: keepApply,
        opId: "pending",
      },
    ]);
  });
});

function seedProjectParamState(value: string) {
  useProjectState.setState({
    projectConfig: createProjectConfig({
      id: "project-1",
      sectionVariantMap: { "section-1": "section-variant" },
    }),
    sections: {},
    sectionImpls: {},
    sectionCapabilities: {},
    sectionVariants: {},
    codeObjs: {
      "param-1": createCore({
        id: "param-1",
        variants: ["param-variant"],
      }),
    },
    codeObjImpls: {
      "param-impl": createSwitchParamCodeObjImpl({
        id: "param-impl",
        type: CodeObjTypeEnum.SwitchParam,
        value,
      }),
    },
    codeObjVariants: {
      "param-variant": createVariant({
        id: "param-variant",
        impl: "param-impl",
      }),
    },
    artifactGroups: {},
    pluginData: {},
    singletonSections: createSingletonSections(),
    parentSectionMap: {},
    shownParamIds: {},
    previewSectionVariantMap: {},
    requiredDecodedImages: [],
    projectChatWindowing: createProjectChatWindowingState(),
  } as ZustandProjectState);
}

function paramUpdateContent({
  completedOpIds = [],
  pendingOpIds = [],
  projectConfigId = "project-1",
  value,
}: {
  completedOpIds?: string[];
  pendingOpIds?: string[];
  projectConfigId?: string;
  value: string;
}): ProjectParamUpdateContent {
  return {
    codeObj: createCore({
      id: "param-1",
      variants: ["param-variant"],
    }),
    codeObjImpl: createSwitchParamCodeObjImpl({
      id: "param-impl",
      type: CodeObjTypeEnum.SwitchParam,
      value,
    }),
    codeObjVariant: createVariant({
      id: "param-variant",
      impl: "param-impl",
    }),
    completedOpIds,
    paramInfoId: "param-1",
    pendingOpIds,
    projectConfigId,
    sectionId: "section-1",
    sectionVariantId: "section-variant",
  };
}
