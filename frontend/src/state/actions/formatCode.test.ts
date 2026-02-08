import {
  useLspDiagnostics,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import { route_format_code, route_set_code } from "utils/generatedEndpoints";
import {
  CodeLanguageEnum,
  createProjectConfig,
  SectionTypeEnum,
  type Core,
  type SettaLspDiagnostic,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queueCodeUpdate } from "./codeUpdates";
import { formatActiveCodeSection } from "./formatCode";
import { FORMATTER_DIAGNOSTIC_SOURCE } from "./lspDiagnostics";
import { addTemporaryNotification } from "./notifications";

vi.mock("utils/generatedEndpoints", () => ({
  route_format_code: vi.fn(),
  route_set_code: vi.fn(),
}));

vi.mock("./notifications", () => ({
  addTemporaryNotification: vi.fn(),
}));

const mockedRouteFormatCode = vi.mocked(route_format_code);
const mockedRouteSetCode = vi.mocked(route_set_code);
const mockedAddTemporaryNotification = vi.mocked(addTemporaryNotification);

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

  const baseDiagnostic: SettaLspDiagnostic = {
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

    mockedRouteFormatCode.mockResolvedValue({
      status: 422,
      data: { detail: "stdin:2:5: invalid syntax" },
      hasResponse: true,
    });

    await formatActiveCodeSection();

    expect(route_format_code).toHaveBeenCalledWith({
      projectConfigId: "project-1",
      sectionId,
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

  it("waits for pending code updates before formatting", async () => {
    vi.useFakeTimers();
    try {
      setupProject({
        type: SectionTypeEnum.Code,
        id: implId,
        name: "Code",
        isFrozen: false,
        isInOtherProjectConfigs: false,
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

      let resolveSetCode: (value: {
        status: number;
        data: null;
        hasResponse: boolean;
      }) => void = () => {};
      const setCodePromise = new Promise<{
        status: number;
        data: null;
        hasResponse: boolean;
      }>((resolve) => {
        resolveSetCode = resolve;
      });
      mockedRouteSetCode.mockReturnValue(setCodePromise);
      mockedRouteFormatCode.mockResolvedValue({
        status: 200,
        data: null,
        hasResponse: true,
      });

      queueCodeUpdate(sectionId, "print('latest')");
      const formatPromise = formatActiveCodeSection();

      expect(route_set_code).toHaveBeenCalledWith({
        projectConfigId: "project-1",
        sectionId,
        code: "print('latest')",
        frontendOpId: expect.any(String),
      });
      expect(route_format_code).not.toHaveBeenCalled();

      resolveSetCode({ status: 200, data: null, hasResponse: true });
      await formatPromise;

      expect(route_format_code).toHaveBeenCalledWith({
        projectConfigId: "project-1",
        sectionId,
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

    mockedRouteFormatCode.mockResolvedValue({
      status: 422,
      data: { detail: "Formatting failed on line 3, column 6." },
      hasResponse: true,
    });

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
    const formatterDiagnostic: SettaLspDiagnostic = {
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

    mockedRouteFormatCode.mockResolvedValue({
      status: 200,
      data: null,
      hasResponse: true,
    });

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

    mockedRouteFormatCode.mockResolvedValue({
      status: 422,
      data: { detail: "Gen code prefix: invalid syntax" },
      hasResponse: true,
    });

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
