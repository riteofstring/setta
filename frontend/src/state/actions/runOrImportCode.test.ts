import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  CodeLanguageEnum,
  createCodeSectionImpl,
  createCore,
  createProjectCodegenPythonTarget,
  createProjectConfig,
  createProjectRunCapabilities,
  createProjectStateSingleConfigWithCompletedOpIDs,
  createSectionCapabilities,
  createSingleConfig,
  createSingletonSections,
  createTerminalSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCodeBlock, stopCode } from "./runOrImportCode";
const {
  callOpenAPIMock,
  routeGetLatestProjectStateMock,
  routeInterruptTerminalProcessesMock,
  routeRunCodeMock,
  addTemporaryNotificationMock,
  getCurrProjectConfigIdMock,
  processProjectStateUpdateFromBackendMock,
} = vi.hoisted(() => ({
  callOpenAPIMock: vi.fn((promise: Promise<unknown>) => promise),
  routeGetLatestProjectStateMock: vi.fn(),
  routeInterruptTerminalProcessesMock: vi.fn(),
  routeRunCodeMock: vi.fn(),
  addTemporaryNotificationMock: vi.fn(),
  getCurrProjectConfigIdMock: vi.fn(() => "project-1"),
  processProjectStateUpdateFromBackendMock: vi.fn(),
}));
vi.mock("openapi/http", () => ({
  getLatestProjectState: (...args: unknown[]) =>
    routeGetLatestProjectStateMock(...args),
  runCode: (...args: unknown[]) => routeRunCodeMock(...args),
  interruptTerminalProcesses: (...args: unknown[]) =>
    routeInterruptTerminalProcessesMock(...args),
}));
vi.mock("openapi/http/result", () => ({
  callOpenAPI: (promise: Promise<unknown>) => callOpenAPIMock(promise),
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
const codeSectionId = "code-section";
const codeVariantId = "code-variant";
const codeImplId = "code-impl";
const genPythonSectionId = "gen-python-section";
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
  return createSingleConfig({
    projectConfig: createProjectConfig({
      id: "project-1",
      sectionVariantMap,
      entryCodeBlockId: pythonCodegenEnabled ? null : codeSectionId,
      hasPythonCodegenTarget: pythonCodegenEnabled,
      runCapabilities: createProjectRunCapabilities(
        pythonCodegenEnabled
          ? {
              canRunFromMain: true,
              effectiveEntrySectionId: genPythonSectionId,
            }
          : {
              canRunFromMain: true,
              effectiveEntrySectionId: codeSectionId,
            },
      ),
      codegenTargets: pythonCodegenEnabled
        ? [createProjectCodegenPythonTarget()]
        : [],
    }),
    sections,
    sectionVariants,
    sectionImpls,
    sectionCapabilities: {
      [codeSectionId]: createSectionCapabilities({
        canRun: true,
        runRequestSectionId: codeSectionId,
        canSelectAsEntryCodeBlock: true,
        entryCodeBlockValue: codeSectionId,
      }),
      ...(pythonCodegenEnabled
        ? {
            [genPythonSectionId]: createSectionCapabilities({
              canRun: true,
              canSelectAsEntryCodeBlock: true,
            }),
          }
        : {}),
    },
    singletonSections: createSingletonSections({
      GenPythonCode: pythonCodegenEnabled ? genPythonSectionId : null,
    }),
  });
}
describe("runCodeBlock", () => {
  beforeEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
    routeRunCodeMock.mockResolvedValue({
      status: 200,
      data: null,
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    getCurrProjectConfigIdMock.mockReturnValue("project-1");
  });
  afterEach(() => {
    resetProjectStores();
  });
  it("rehydrates project state after a successful run when the backend creates the attached terminal", async () => {
    useProjectState.setState(buildProjectState({ attachedTerminalId: null }));
    const latestProjectState = createProjectStateSingleConfigWithCompletedOpIDs(
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
        body: expect.objectContaining({
          projectConfigId: "project-1",
          sectionId: codeSectionId,
          terminalSectionId: null,
        }),
      }),
    );
    expect(routeGetLatestProjectStateMock).toHaveBeenCalledWith({
      body: {
        projectConfigId: "project-1",
      },
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
        body: expect.objectContaining({
          projectConfigId: "project-1",
          sectionId: codeSectionId,
          terminalSectionId,
        }),
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
    const latestProjectState = createProjectStateSingleConfigWithCompletedOpIDs(
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
        body: expect.objectContaining({
          projectConfigId: "project-1",
          sectionId: null,
          terminalSectionId: null,
        }),
      }),
    );
    expect(routeGetLatestProjectStateMock).toHaveBeenCalledWith({
      body: {
        projectConfigId: "project-1",
      },
    });
    expect(processProjectStateUpdateFromBackendMock).toHaveBeenCalledWith(
      latestProjectState,
    );
  });
  it("uses the current local entry code block for main runs even when backend run capabilities are stale", async () => {
    useProjectState.setState(
      buildProjectState({
        attachedTerminalId: null,
        pythonCodegenEnabled: true,
      }),
    );
    useProjectState.setState((state) => {
      state.projectConfig.entryCodeBlockId = codeSectionId;
    });
    const latestProjectState = createProjectStateSingleConfigWithCompletedOpIDs(
      {
        projectState: buildProjectState({
          attachedTerminalId: terminalSectionId,
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
        body: expect.objectContaining({
          projectConfigId: "project-1",
          sectionId: codeSectionId,
          terminalSectionId: null,
        }),
      }),
    );
  });
});
describe("stopCode", () => {
  beforeEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
    getCurrProjectConfigIdMock.mockReturnValue("project-1");
    routeInterruptTerminalProcessesMock.mockResolvedValue({
      data: null,
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
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
      body: {
        projectId: "project-1",
      },
    });
  });
});
