import {
  useNodeInternals,
  usePendingOperations,
  useProjectState,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createProjectChatWindowingState,
  createProjectConfig,
  createProjectStateSingleConfig,
  createSingletonSections,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { reconcileProjectStateSnapshot } from "./sectionProjectStateSnapshot";

function createProjectState(projectConfigId = "project-1") {
  return createProjectStateSingleConfig({
    projectConfig: createProjectConfig({
      id: projectConfigId,
    }),
    projectChatWindowing: createProjectChatWindowingState({
      nextInstanceNumber: 1,
    }),
  });
}

describe("sectionProjectStateSnapshot", () => {
  beforeEach(() => {
    resetProjectStores();
    useNodeInternals.setState({ x: new Map() });
    usePendingOperations.setState({ pending: [] });
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("marks backend-pending ops acknowledged and reapplies them over the backend snapshot", () => {
    useProjectState.setState({
      ...createProjectState(),
      previewSectionVariantMap: {},
    });
    usePendingOperations.setState({
      pending: [
        {
          opId: "frontend-op-1",
          acknowledged: false,
          apply: (state) => {
            state.projectChatWindowing.nextInstanceNumber = 9;
          },
        },
      ],
    });

    const snapshot = reconcileProjectStateSnapshot({
      projectState: createProjectState(),
      completedOpIds: [],
      pendingOpIds: ["frontend-op-1"],
    });

    expect(snapshot.nextPending).toHaveLength(1);
    expect(snapshot.nextPending[0]?.acknowledged).toBe(true);
    expect(
      snapshot.sanitizedProjectState.projectChatWindowing.nextInstanceNumber,
    ).toBe(9);
    expect(snapshot.projectStateChanged).toBe(true);
    expect(snapshot.nextNodesMap).not.toBeNull();
  });

  it("keeps the no-op short circuit when the comparable project state is unchanged", () => {
    const projectConfig = createProjectConfig({
      id: "project-1",
    });
    useProjectState.setState({
      projectConfig,
      sections: {},
      sectionImpls: {},
      sectionVariants: {},
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {},
      shownParamIds: {},
      projectChatWindowing: createProjectChatWindowingState(),
      previewSectionVariantMap: {
        "preview-only": "variant-preview",
      },
      requiredDecodedImages: [],
    });

    const snapshot = reconcileProjectStateSnapshot({
      projectState: {
        projectConfig,
        sections: {},
        sectionImpls: {},
        sectionVariants: {},
        codeObjs: {},
        codeObjImpls: {},
        codeObjVariants: {},
        artifactGroups: {},
        singletonSections: createSingletonSections(),
        parentSectionMap: {},
        shownParamIds: {},
        requiredDecodedImages: [],
        genCodeBinding: null,
        projectChatWindowing: createProjectChatWindowingState(),
      },
      completedOpIds: [],
      pendingOpIds: [],
    });

    expect(snapshot.projectStateChanged).toBe(false);
    expect(snapshot.nextNodesMap).toBeNull();
    expect(snapshot.nextPending).toEqual([]);
  });
});
