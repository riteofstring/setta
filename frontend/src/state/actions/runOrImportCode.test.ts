import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  CodeLanguageEnum,
  createCodeSectionImpl,
  createCore,
  createProjectCodegenPythonTarget,
  createProjectConfig,
  createProjectStateSingleConfig,
  createProjectStateSingleConfigWithCompletedOpIds,
  createSingletonSections,
  createTerminalSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  routeGetLatestProjectStateMock,
  routeInterruptTerminalProcessesMock,
  routeRunCodeMock,
  addTemporaryNotificationMock,
  getCurrProjectConfigIdMock,
  processProjectStateUpdateFromBackendMock,
} = vi.hoisted(() => ({
  routeGetLatestProjectStateMock: vi.fn(),
  routeInterruptTerminalProcessesMock: vi.fn(),
  routeRunCodeMock: vi.fn(),
  addTemporaryNotificationMock: vi.fn(),
  getCurrProjectConfigIdMock: vi.fn(() => "project-1"),
  processProjectStateUpdateFromBackendMock: vi.fn(),
}));

vi.mock("utils/generatedEndpoints", () => ({
  route_get_latest_project_state: routeGetLatestProjectStateMock,
  route_interrupt_terminal_processes: routeInterruptTerminalProcessesMock,
  route_run_code: routeRunCodeMock,
}));

vi.mock("./notifications", () => ({
  addTemporaryNotification: addTemporaryNotificationMock,
}));

vi.mock("./sectionInfos", async () => {
  const actual =
    await vi.importActual<typeof import("./sectionInfos")>("./sectionInfos");
  return {
    ...actual,
    getCurrProjectConfigId: getCurrProjectConfigIdMock,
    processProjectStateUpdateFromBackend:
      processProjectStateUpdateFromBackendMock,
  };
});

import { runCodeBlock, stopCode } from "./runOrImportCode";

const codeSectionId = "code-section";
const codeVariantId = "code-variant";
const codeImplId = "code-impl";
const terminalSectionId = "terminal-section";
const terminalVariantId = "terminal-variant";
const terminalImplId = "terminal-impl";

function buildProjectState({
  attachedTerminalId,
  pythonCodegenEnabled = false,
}: {
  attachedTerminalId: string | null;
  pythonCodegenEnabled?: boolean;
}) {
  const sectionVariantMap: Record<string, string> = {
    [codeSectionId]: codeVariantId,
  };
  const sections = {
    [codeSectionId]: createCore({
      id: codeSectionId,
      name: "Code",
      variants: [codeVariantId],
      defaultVariant: codeVariantId,
    }),
  };
  const sectionVariants = {
    [codeVariantId]: createVariant({
      id: codeVariantId,
      name: "Default",
      impl: codeImplId,
    }),
  };
  const sectionImpls = {
    [codeImplId]: createCodeSectionImpl({
      id: codeImplId,
      name: "Code",
      code: "print('hi')",
      codeLanguage: CodeLanguageEnum.python,
      attachedTerminalSectionId: attachedTerminalId,
    }),
  };

  if (attachedTerminalId) {
    sectionVariantMap[attachedTerminalId] = terminalVariantId;
    sections[attachedTerminalId] = createCore({
      id: attachedTerminalId,
      name: "Terminal",
      variants: [terminalVariantId],
      defaultVariant: terminalVariantId,
    });
    sectionVariants[terminalVariantId] = createVariant({
      id: terminalVariantId,
      name: "Default",
      impl: terminalImplId,
    });
    sectionImpls[terminalImplId] = createTerminalSectionImpl({
      id: terminalImplId,
      name: "Terminal",
    });
  }

  return createProjectStateSingleConfig({
    projectConfig: createProjectConfig({
      id: "project-1",
      sectionVariantMap,
      codegenTargets: pythonCodegenEnabled
        ? [createProjectCodegenPythonTarget()]
        : [],
    }),
    sections,
    sectionVariants,
    sectionImpls,
    singletonSections: createSingletonSections(),
  });
}

describe("runCodeBlock", () => {
  beforeEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
    routeRunCodeMock.mockResolvedValue({
      status: 200,
      data: null,
      hasResponse: true,
    });
    getCurrProjectConfigIdMock.mockReturnValue("project-1");
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("rehydrates project state after a successful run when the backend creates the attached terminal", async () => {
    useProjectState.setState(buildProjectState({ attachedTerminalId: null }));
    const latestProjectState = createProjectStateSingleConfigWithCompletedOpIds(
      {
        projectState: buildProjectState({
          attachedTerminalId: terminalSectionId,
        }),
      },
    );
    routeGetLatestProjectStateMock.mockResolvedValue({
      status: 200,
      data: latestProjectState,
      hasResponse: true,
    });

    await runCodeBlock(codeSectionId);

    expect(routeRunCodeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectConfigId: "project-1",
        sectionId: codeSectionId,
        terminalSectionId: null,
      }),
    );
    expect(routeGetLatestProjectStateMock).toHaveBeenCalledWith({
      projectConfigId: "project-1",
    });
    expect(processProjectStateUpdateFromBackendMock).toHaveBeenCalledWith(
      latestProjectState,
    );
  });

  it("reuses the existing attached terminal without rehydrating project state", async () => {
    useProjectState.setState(
      buildProjectState({ attachedTerminalId: terminalSectionId }),
    );

    await runCodeBlock(codeSectionId);

    expect(routeRunCodeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectConfigId: "project-1",
        sectionId: codeSectionId,
        terminalSectionId,
      }),
    );
    expect(routeGetLatestProjectStateMock).not.toHaveBeenCalled();
    expect(processProjectStateUpdateFromBackendMock).not.toHaveBeenCalled();
  });

  it("rehydrates project state after a generated-entry run creates a top-level terminal", async () => {
    useProjectState.setState(
      buildProjectState({
        attachedTerminalId: null,
        pythonCodegenEnabled: true,
      }),
    );
    const latestProjectState = createProjectStateSingleConfigWithCompletedOpIds(
      {
        projectState: buildProjectState({
          attachedTerminalId: null,
          pythonCodegenEnabled: true,
        }),
      },
    );
    routeGetLatestProjectStateMock.mockResolvedValue({
      status: 200,
      data: latestProjectState,
      hasResponse: true,
    });

    await runCodeBlock(null);

    expect(routeRunCodeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectConfigId: "project-1",
        sectionId: null,
        terminalSectionId: null,
      }),
    );
    expect(routeGetLatestProjectStateMock).toHaveBeenCalledWith({
      projectConfigId: "project-1",
    });
    expect(processProjectStateUpdateFromBackendMock).toHaveBeenCalledWith(
      latestProjectState,
    );
  });
});

describe("stopCode", () => {
  beforeEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
    getCurrProjectConfigIdMock.mockReturnValue("project-1");
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("posts the canonical interrupt-terminal request for the current project", async () => {
    await stopCode();

    expect(addTemporaryNotificationMock).toHaveBeenCalledWith(
      "Stopping subprocesses",
    );
    expect(routeInterruptTerminalProcessesMock).toHaveBeenCalledWith({
      projectId: "project-1",
    });
  });
});
