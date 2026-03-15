import { useProjectState } from "state/definitions";
import { useServerMode } from "state/stores/sessionStores";
import { resetProjectStores } from "state/utils";
import type { ProjectStateSingleConfigWithCompletedOpIds } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("state/actions/appProjectState", () => ({
  processAppProjectStateUpdateFromBackend: vi.fn(),
}));

vi.mock("./sectionProjectStateSync", () => ({
  processProjectStateUpdateFromBackend: vi.fn(),
}));

function buildProjectStateSnapshot(
  projectConfigId: string,
): ProjectStateSingleConfigWithCompletedOpIds {
  // Mirror the backend snapshot envelope instead of inventing a bespoke fixture.
  const currentState = useProjectState.getState();
  return {
    projectState: {
      projectConfig: {
        ...currentState.projectConfig,
        id: projectConfigId,
        activeIds: [],
      },
      sections: { ...currentState.sections },
      sectionImpls: { ...currentState.sectionImpls },
      sectionVariants: { ...currentState.sectionVariants },
      codeObjs: { ...currentState.codeObjs },
      codeObjImpls: { ...currentState.codeObjImpls },
      codeObjVariants: { ...currentState.codeObjVariants },
      artifactGroups: { ...currentState.artifactGroups },
      singletonSections: currentState.singletonSections,
      parentSectionMap: { ...currentState.parentSectionMap },
      shownParamIds: { ...currentState.shownParamIds },
      requiredDecodedImages: [...currentState.requiredDecodedImages],
      genCodeBinding: currentState.genCodeBinding ?? null,
    },
    completedOpIds: [],
    pendingOpIds: [],
  };
}

describe("handleIncomingProjectStateSnapshot", () => {
  beforeEach(() => {
    resetProjectStores();
    useServerMode.setState({
      mode: "ide",
      modeResolved: true,
      modeError: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    resetProjectStores();
    useServerMode.setState({
      mode: null,
      modeResolved: false,
      modeError: null,
    });
  });

  it("routes app-mode snapshots into the app project-state store", async () => {
    // App deployments hydrate the app-config store instead of the IDE project store.
    const { processAppProjectStateUpdateFromBackend } = await import(
      "state/actions/appProjectState"
    );
    const { processProjectStateUpdateFromBackend } = await import(
      "./sectionProjectStateSync"
    );
    const { handleIncomingProjectStateSnapshot } = await import(
      "./websocketIncomingProjectSnapshots"
    );
    const payload = buildProjectStateSnapshot("app-project-1");

    useServerMode.setState({
      mode: "app",
      modeResolved: true,
      modeError: null,
    });
    handleIncomingProjectStateSnapshot(payload);

    expect(processAppProjectStateUpdateFromBackend).toHaveBeenCalledWith(
      payload,
    );
    expect(processProjectStateUpdateFromBackend).not.toHaveBeenCalled();
  });

  it("routes non-app snapshots into the standard project-state sync", async () => {
    // IDE and share flows still reconcile snapshots through the shared project-state path.
    const { processAppProjectStateUpdateFromBackend } = await import(
      "state/actions/appProjectState"
    );
    const { processProjectStateUpdateFromBackend } = await import(
      "./sectionProjectStateSync"
    );
    const { handleIncomingProjectStateSnapshot } = await import(
      "./websocketIncomingProjectSnapshots"
    );
    const payload = buildProjectStateSnapshot("ide-project-1");

    useServerMode.setState({
      mode: "ide",
      modeResolved: true,
      modeError: null,
    });
    handleIncomingProjectStateSnapshot(payload);

    expect(processProjectStateUpdateFromBackend).toHaveBeenCalledWith(payload);
    expect(processAppProjectStateUpdateFromBackend).not.toHaveBeenCalled();
  });
});
