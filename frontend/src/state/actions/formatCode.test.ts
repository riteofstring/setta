import { formatCode, setCode } from "openapi/http";
import { useActiveSectionUI } from "state/activeSectionUI";
import {
  useLspDiagnostics,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  CodeFileAccessModeEnum,
  CodeLanguageEnum,
  createProjectConfig,
  SectionTypeEnum,
  type Core,
  type LSPDiagnostic,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queueCodeUpdate } from "./codeUpdates";
import { formatActiveCodeSection } from "./formatCode";
import { FORMATTER_DIAGNOSTIC_SOURCE } from "./lspDiagnostics";
import { addTemporaryNotification } from "./notifications";
vi.mock("openapi/http", () => ({
  formatCode: vi.fn(),
  setCode: vi.fn(),
}));
vi.mock("./notifications", () => ({
  addTemporaryNotification: vi.fn(),
}));
const mockedRouteFormatCode = vi.mocked(formatCode);
const mockedRouteSetCode = vi.mocked(setCode);
const mockedAddTemporaryNotification = vi.mocked(addTemporaryNotification);

function createSuccessResult(status: number = 200) {
  return {
    data: null,
    response: new Response(null, { status }),
  };
}

function createDetailErrorResult(status: number, detail: string) {
  return {
    error: { detail },
    response: new Response(null, { status }),
  };
}

describe("formatActiveCodeSection", () => {
  const sectionId = "section-1";
  const variantId = "variant-1";
  const implId = "impl-1";
  const sectionCore: Core = {
    id: sectionId,
    name: "Section",
    displayName: "",
    variants: [variantId],
    defaultVariant: variantId,
    sharedModifier: {},
    unsharedKeys: [],
  };
  const sectionVariant: Variant = {
    id: variantId,
    name: "Variant",
    impl: implId,
    nonPresetImpls: [],
    modifier: {},
    isFrozen: false,
  };
  const baseDiagnostic: LSPDiagnostic = {
    message: "Bad code",
    severity: 1,
    code: "reportFoo",
    source: "pyright",
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 1 },
    },
    uri: "file:///tmp/section.py",
  };
  function setupProject(impl: Record<string, unknown>) {
    const projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [sectionId]: variantId },
      topLevelSections: {
        [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
      },
      activeIds: [sectionId],
    });
    useShareSession.setState({ isDeploymentMode: false });
    useProjectState.setState((state) => {
      state.projectConfig = projectConfig;
      state.sections = { [sectionId]: sectionCore };
      state.sectionVariants = { [variantId]: sectionVariant };
      state.sectionImpls = { [implId]: impl };
      state.previewSectionVariantMap = {};
    });
    useActiveSectionUI.setState({ activeIds: [sectionId] });
    useLspDiagnostics.setState({ codeSections: {}, unmappedGenCode: [] });
  }
  beforeEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
  });
  afterEach(() => {
    resetProjectStores();
  });
  it("stores formatter errors in diagnostics with a short notification", async () => {
    setupProject({
      type: SectionTypeEnum.Code,
      id: implId,
      name: "Code",
      isFrozen: false,
      isInOtherProjectConfigs: false,
      tagColor: null,
      size: { width: 500, height: 300 },
      aspectRatio: false,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: false,
      positionAndSizeLocked: false,
      isPreset: false,
      code: "print('hi')",
      codeFileBinding: null,
      codeLanguage: CodeLanguageEnum.python,
      diagnosticsIgnoreState: {
        muted: false,
        suppressedCodes: [],
      },
    });
    useLspDiagnostics.setState({
      codeSections: { [sectionId]: [baseDiagnostic] },
      unmappedGenCode: [],
    });
    mockedRouteFormatCode.mockResolvedValue(
      createDetailErrorResult(422, "stdin:2:5: invalid syntax"),
    );
    await formatActiveCodeSection();
    expect(formatCode).toHaveBeenCalledWith({
      body: {
        projectConfigId: "project-1",
        sectionId,
      },
    });
    expect(mockedAddTemporaryNotification).toHaveBeenCalledWith(
      "Failed to run formatter.",
    );
    const diagnostics = useLspDiagnostics.getState().codeSections[sectionId];
    const formatterDiagnostic = diagnostics?.find(
      (entry) => entry.source === FORMATTER_DIAGNOSTIC_SOURCE,
    );
    expect(formatterDiagnostic?.message).toBe("stdin:2:5: invalid syntax");
    expect(formatterDiagnostic?.range.start.line).toBe(1);
    expect(formatterDiagnostic?.range.start.character).toBe(4);
    expect(diagnostics).toHaveLength(2);
  });
  it("stops in share mode before touching formatter state", async () => {
    setupProject({
      type: SectionTypeEnum.Code,
      id: implId,
      name: "Code",
      isFrozen: false,
      isInOtherProjectConfigs: false,
      tagColor: null,
      size: { width: 500, height: 300 },
      aspectRatio: false,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: false,
      positionAndSizeLocked: false,
      isPreset: false,
      code: "print('hi')",
      codeFileBinding: null,
      codeLanguage: CodeLanguageEnum.python,
      diagnosticsIgnoreState: {
        muted: false,
        suppressedCodes: [],
      },
    });
    useShareSession.setState({ isDeploymentMode: true });

    await formatActiveCodeSection();

    expect(mockedAddTemporaryNotification).toHaveBeenCalledWith(
      "Formatting is disabled in share mode.",
    );
    expect(formatCode).not.toHaveBeenCalled();
  });
  it("rejects read-only Python code sections before calling the route", async () => {
    setupProject({
      type: SectionTypeEnum.Code,
      id: implId,
      name: "Code",
      isFrozen: false,
      isInOtherProjectConfigs: false,
      tagColor: null,
      size: { width: 500, height: 300 },
      aspectRatio: false,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: false,
      positionAndSizeLocked: false,
      isPreset: false,
      code: "print('hi')",
      codeFileBinding: {
        access_mode: CodeFileAccessModeEnum.read_only,
        path: "main.py",
      },
      codeLanguage: CodeLanguageEnum.python,
      diagnosticsIgnoreState: {
        muted: false,
        suppressedCodes: [],
      },
    });

    await formatActiveCodeSection();

    expect(mockedAddTemporaryNotification).toHaveBeenCalledWith(
      "This code section is read-only.",
    );
    expect(formatCode).not.toHaveBeenCalled();
  });
  it("waits for pending code updates before formatting", async () => {
    vi.useFakeTimers();
    try {
      setupProject({
        type: SectionTypeEnum.Code,
        id: implId,
        name: "Code",
        isFrozen: false,
        isInOtherProjectConfigs: false,
        tagColor: null,
        size: { width: 500, height: 300 },
        aspectRatio: false,
        aspectRatioExtraHeight: 0,
        aspectRatioExtraWidth: 0,
        isMinimized: false,
        positionAndSizeLocked: false,
        isPreset: false,
        code: "print('hi')",
        codeFileBinding: null,
        codeLanguage: CodeLanguageEnum.python,
        diagnosticsIgnoreState: {
          muted: false,
          suppressedCodes: [],
        },
      });
      let resolveSetCode: (
        value: ReturnType<typeof createSuccessResult>,
      ) => void = () => {};
      const setCodePromise = new Promise<
        ReturnType<typeof createSuccessResult>
      >((resolve) => {
        resolveSetCode = resolve;
      });
      mockedRouteSetCode.mockReturnValue(setCodePromise);
      mockedRouteFormatCode.mockResolvedValue(createSuccessResult());
      queueCodeUpdate(sectionId, "print('latest')");
      const formatPromise = formatActiveCodeSection();
      expect(setCode).toHaveBeenCalledWith({
        body: {
          projectConfigId: "project-1",
          sectionId,
          code: "print('latest')",
          frontendOpId: expect.any(String),
        },
      });
      expect(formatCode).not.toHaveBeenCalled();
      resolveSetCode(createSuccessResult());
      await formatPromise;
      expect(formatCode).toHaveBeenCalledWith({
        body: {
          projectConfigId: "project-1",
          sectionId,
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });
  it("parses line/column formatter errors into diagnostic ranges", async () => {
    setupProject({
      type: SectionTypeEnum.Code,
      id: implId,
      name: "Code",
      isFrozen: false,
      isInOtherProjectConfigs: false,
      tagColor: null,
      size: { width: 500, height: 300 },
      aspectRatio: false,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: false,
      positionAndSizeLocked: false,
      isPreset: false,
      code: "print('hi')",
      codeFileBinding: null,
      codeLanguage: CodeLanguageEnum.python,
      diagnosticsIgnoreState: {
        muted: false,
        suppressedCodes: [],
      },
    });
    mockedRouteFormatCode.mockResolvedValue(
      createDetailErrorResult(422, "Formatting failed on line 3, column 6."),
    );
    await formatActiveCodeSection();
    const diagnostics = useLspDiagnostics.getState().codeSections[sectionId];
    const formatterDiagnostic = diagnostics?.find(
      (entry) => entry.source === FORMATTER_DIAGNOSTIC_SOURCE,
    );
    expect(formatterDiagnostic?.range.start.line).toBe(2);
    expect(formatterDiagnostic?.range.start.character).toBe(5);
  });
  it("clears formatter diagnostics after a successful run", async () => {
    setupProject({
      type: SectionTypeEnum.Code,
      id: implId,
      name: "Code",
      isFrozen: false,
      isInOtherProjectConfigs: false,
      tagColor: null,
      size: { width: 500, height: 300 },
      aspectRatio: false,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: false,
      positionAndSizeLocked: false,
      isPreset: false,
      code: "print('hi')",
      codeFileBinding: null,
      codeLanguage: CodeLanguageEnum.python,
      diagnosticsIgnoreState: {
        muted: false,
        suppressedCodes: [],
      },
    });
    const formatterDiagnostic: LSPDiagnostic = {
      message: "Formatter failed.",
      severity: 1,
      code: null,
      source: FORMATTER_DIAGNOSTIC_SOURCE,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
      uri: null,
    };
    useLspDiagnostics.setState({
      codeSections: { [sectionId]: [formatterDiagnostic, baseDiagnostic] },
      unmappedGenCode: [],
    });
    mockedRouteFormatCode.mockResolvedValue(createSuccessResult());
    await formatActiveCodeSection();
    expect(mockedAddTemporaryNotification).toHaveBeenCalledWith(
      "Ran formatter.",
    );
    const diagnostics = useLspDiagnostics.getState().codeSections[sectionId];
    expect(diagnostics).toEqual([baseDiagnostic]);
  });
  it("stores formatter errors in generated-code diagnostics", async () => {
    setupProject({
      type: SectionTypeEnum.GenPythonCode,
      id: implId,
      name: "Generated",
      isFrozen: false,
      isInOtherProjectConfigs: false,
      tagColor: null,
      size: { width: 500, height: 300 },
      aspectRatio: false,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: false,
      positionAndSizeLocked: false,
      isPreset: false,
      code: "",
      codeFileBinding: null,
    });
    useLspDiagnostics.setState({
      codeSections: {},
      unmappedGenCode: [baseDiagnostic],
    });
    mockedRouteFormatCode.mockResolvedValue(
      createDetailErrorResult(422, "Gen code prefix: invalid syntax"),
    );
    await formatActiveCodeSection();
    expect(mockedAddTemporaryNotification).toHaveBeenCalledWith(
      "Failed to run formatter.",
    );
    const diagnostics = useLspDiagnostics.getState().unmappedGenCode;
    expect(
      diagnostics.some((entry) => entry.source === FORMATTER_DIAGNOSTIC_SOURCE),
    ).toBe(true);
    expect(diagnostics).toHaveLength(2);
  });
});
