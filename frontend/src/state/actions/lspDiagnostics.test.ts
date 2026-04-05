import {
  useLspDiagnostics,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  route_set_code_section_diagnostic_code_suppression,
  route_set_code_section_diagnostics_mute,
} from "utils/generatedEndpoints";
import {
  createProjectConfig,
  LSPDiagnosticsPayload,
  SectionTypeEnum,
  type Core,
  type LSPDiagnostic,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FORMATTER_DIAGNOSTIC_SOURCE,
  processLspDiagnostics,
  setCodeSectionDiagnosticCodeSuppression,
  setCodeSectionDiagnosticsMuted,
} from "./lspDiagnostics";
import { getCurrEffectiveSectionImpl } from "./sectionInfos";
import { processTypeErrors } from "./typeCheck";

vi.mock("utils/generatedEndpoints", () => ({
  route_set_code_section_diagnostics_mute: vi.fn(),
  route_set_code_section_diagnostic_code_suppression: vi.fn(),
}));

vi.mock("./typeCheck", () => ({
  processTypeErrors: vi.fn(),
}));

describe("lspDiagnostics actions", () => {
  const sectionId = "section-1";
  const variantId = "variant-1";
  const implId = "impl-1";

  function setupProjectState() {
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
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({
        id: "project-1",
        sectionVariantMap: { [sectionId]: variantId },
      });
      state.sections = { [sectionId]: sectionCore };
      state.sectionVariants = { [variantId]: sectionVariant };
      state.sectionImpls = {
        [implId]: {
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
          code: "print('hello')",
          codeFileBinding: null,
          codeLanguage: "python",
          diagnosticsIgnoreState: {
            muted: false,
            suppressedCodes: [],
          },
        },
      };
      state.previewSectionVariantMap = {};
    });
  }

  beforeEach(() => {
    resetProjectStores();
    setupProjectState();
    useShareSession.setState({ isDeploymentMode: false });
    vi.mocked(route_set_code_section_diagnostics_mute).mockResolvedValue({
      status: 200,
      data: null,
      hasResponse: true,
    });
    vi.mocked(
      route_set_code_section_diagnostic_code_suppression,
    ).mockResolvedValue({
      status: 200,
      data: null,
      hasResponse: true,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("sends mute toggle when not in share mode and updates local state", async () => {
    await setCodeSectionDiagnosticsMuted("section-1", true);

    expect(route_set_code_section_diagnostics_mute).toHaveBeenCalledWith({
      projectConfigId: "project-1",
      sectionId: "section-1",
      mute: true,
    });
    expect(
      getCurrEffectiveSectionImpl(useProjectState.getState(), sectionId)
        .diagnosticsIgnoreState,
    ).toEqual({
      muted: true,
      suppressedCodes: [],
    });
  });

  it("does not send mute toggle in share mode", () => {
    useShareSession.setState({ isDeploymentMode: true });

    setCodeSectionDiagnosticsMuted("section-1", true);

    expect(route_set_code_section_diagnostics_mute).not.toHaveBeenCalled();
  });

  it("skips suppression for null or undefined codes", () => {
    setCodeSectionDiagnosticCodeSuppression("section-1", null, true);
    setCodeSectionDiagnosticCodeSuppression("section-1", undefined, true);

    expect(
      route_set_code_section_diagnostic_code_suppression,
    ).not.toHaveBeenCalled();
  });

  it("sends suppression update when code is provided and updates local state", async () => {
    await setCodeSectionDiagnosticCodeSuppression(
      "section-1",
      "reportFoo",
      true,
    );

    expect(
      route_set_code_section_diagnostic_code_suppression,
    ).toHaveBeenCalledWith({
      projectConfigId: "project-1",
      sectionId: "section-1",
      code: "reportFoo",
      suppress: true,
    });
    expect(
      getCurrEffectiveSectionImpl(useProjectState.getState(), sectionId)
        .diagnosticsIgnoreState,
    ).toEqual({
      muted: false,
      suppressedCodes: ["reportFoo"],
    });
  });

  it("does not mutate local ignore state when the backend rejects the mute update", async () => {
    vi.mocked(route_set_code_section_diagnostics_mute).mockResolvedValue({
      status: 500,
      data: null,
      hasResponse: true,
    });

    await setCodeSectionDiagnosticsMuted("section-1", true);

    expect(
      getCurrEffectiveSectionImpl(useProjectState.getState(), sectionId)
        .diagnosticsIgnoreState,
    ).toEqual({
      muted: false,
      suppressedCodes: [],
    });
  });
});

describe("processLspDiagnostics", () => {
  const baseDiagnostic: LSPDiagnostic = {
    message: "Bad code",
    severity: 1,
    code: "reportFoo",
    source: "pyright",
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 5 },
    },
    uri: "file:///tmp/section.py",
  };
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

  beforeEach(() => {
    resetProjectStores();
    useProjectState.setState({
      projectConfig: createProjectConfig({ id: "project-1" }),
    });
    useShareSession.setState({ isDeploymentMode: false });
    useLspDiagnostics.setState({ codeSections: {}, unmappedGenCode: [] });
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("updates diagnostics state and forwards gen-code errors", () => {
    const payload: LSPDiagnosticsPayload = {
      projectConfigId: "project-1",
      genCode: {
        projectConfigId: "project-1",
        errors: {},
        isGenCode: true,
      },
      codeSections: {
        "section-1": [baseDiagnostic],
      },
      unmappedGenCode: [baseDiagnostic],
    };

    processLspDiagnostics(payload);

    const state = useLspDiagnostics.getState();
    expect(state.codeSections["section-1"]).toEqual([baseDiagnostic]);
    expect(state.unmappedGenCode).toEqual([baseDiagnostic]);
    expect(processTypeErrors).toHaveBeenCalledWith(payload.genCode);
  });

  it("preserves existing diagnostics arrays when unchanged", () => {
    useLspDiagnostics.setState({
      codeSections: { "section-1": [baseDiagnostic] },
      unmappedGenCode: [],
    });
    const prevState = useLspDiagnostics.getState();
    const prevArray = prevState.codeSections["section-1"];
    const nextDiagnostic: LSPDiagnostic = {
      ...baseDiagnostic,
      range: {
        start: { ...baseDiagnostic.range.start },
        end: { ...baseDiagnostic.range.end },
      },
    };
    const payload: LSPDiagnosticsPayload = {
      projectConfigId: "project-1",
      genCode: {
        projectConfigId: "project-1",
        errors: {},
        isGenCode: true,
      },
      codeSections: {
        "section-1": [nextDiagnostic],
      },
      unmappedGenCode: [],
    };

    processLspDiagnostics(payload);

    const nextState = useLspDiagnostics.getState();
    expect(nextState.codeSections["section-1"]).toBe(prevArray);
  });

  it("merges formatter diagnostics with incoming section diagnostics", () => {
    useLspDiagnostics.setState({
      codeSections: { "section-1": [formatterDiagnostic] },
      unmappedGenCode: [],
    });
    const payload: LSPDiagnosticsPayload = {
      projectConfigId: "project-1",
      genCode: {
        projectConfigId: "project-1",
        errors: {},
        isGenCode: true,
      },
      codeSections: {
        "section-1": [baseDiagnostic],
      },
      unmappedGenCode: [],
    };

    processLspDiagnostics(payload);

    const diagnostics = useLspDiagnostics.getState().codeSections["section-1"];
    expect(diagnostics).toEqual([baseDiagnostic, formatterDiagnostic]);
  });

  it("keeps incoming formatter diagnostics without duplicating previous ones", () => {
    const incomingFormatter: LSPDiagnostic = {
      ...formatterDiagnostic,
      message: "Fresh formatter error",
    };
    useLspDiagnostics.setState({
      codeSections: { "section-1": [formatterDiagnostic] },
      unmappedGenCode: [],
    });
    const payload: LSPDiagnosticsPayload = {
      projectConfigId: "project-1",
      genCode: {
        projectConfigId: "project-1",
        errors: {},
        isGenCode: true,
      },
      codeSections: {
        "section-1": [incomingFormatter, baseDiagnostic],
      },
      unmappedGenCode: [],
    };

    processLspDiagnostics(payload);

    const diagnostics = useLspDiagnostics.getState().codeSections["section-1"];
    expect(diagnostics).toEqual([incomingFormatter, baseDiagnostic]);
  });

  it("clears formatter diagnostics when a section disappears", () => {
    useLspDiagnostics.setState({
      codeSections: { "section-1": [formatterDiagnostic] },
      unmappedGenCode: [],
    });
    const payload: LSPDiagnosticsPayload = {
      projectConfigId: "project-1",
      genCode: {
        projectConfigId: "project-1",
        errors: {},
        isGenCode: true,
      },
      codeSections: {},
      unmappedGenCode: [],
    };

    processLspDiagnostics(payload);

    expect(
      useLspDiagnostics.getState().codeSections["section-1"],
    ).toBeUndefined();
  });

  it("clears formatter diagnostics in unmapped gen-code payloads", () => {
    useLspDiagnostics.setState({
      codeSections: {},
      unmappedGenCode: [formatterDiagnostic],
    });
    const payload: LSPDiagnosticsPayload = {
      projectConfigId: "project-1",
      genCode: {
        projectConfigId: "project-1",
        errors: {},
        isGenCode: true,
      },
      codeSections: {},
      unmappedGenCode: [],
    };

    processLspDiagnostics(payload);

    expect(useLspDiagnostics.getState().unmappedGenCode).toEqual([]);
  });

  describe("immediate clears", () => {
    it("clears diagnostics when a section disappears", () => {
      useLspDiagnostics.setState({
        codeSections: { "section-1": [baseDiagnostic] },
        unmappedGenCode: [],
      });
      const payload: LSPDiagnosticsPayload = {
        projectConfigId: "project-1",
        genCode: {
          projectConfigId: "project-1",
          errors: {},
          isGenCode: true,
        },
        codeSections: {},
        unmappedGenCode: [],
      };

      processLspDiagnostics(payload);

      expect(
        useLspDiagnostics.getState().codeSections["section-1"],
      ).toBeUndefined();
    });

    it("clears diagnostics when a section sends an empty list", () => {
      useLspDiagnostics.setState({
        codeSections: { "section-1": [baseDiagnostic] },
        unmappedGenCode: [],
      });
      const payload: LSPDiagnosticsPayload = {
        projectConfigId: "project-1",
        genCode: {
          projectConfigId: "project-1",
          errors: {},
          isGenCode: true,
        },
        codeSections: {
          "section-1": [],
        },
        unmappedGenCode: [],
      };

      processLspDiagnostics(payload);

      expect(
        useLspDiagnostics.getState().codeSections["section-1"],
      ).toBeUndefined();
    });

    it("clears formatter diagnostics when a section sends an empty list", () => {
      useLspDiagnostics.setState({
        codeSections: { "section-1": [formatterDiagnostic] },
        unmappedGenCode: [],
      });
      const payload: LSPDiagnosticsPayload = {
        projectConfigId: "project-1",
        genCode: {
          projectConfigId: "project-1",
          errors: {},
          isGenCode: true,
        },
        codeSections: {
          "section-1": [],
        },
        unmappedGenCode: [],
      };

      processLspDiagnostics(payload);

      expect(
        useLspDiagnostics.getState().codeSections["section-1"],
      ).toBeUndefined();
    });

    it("clears unmapped gen-code diagnostics when payload is empty", () => {
      useLspDiagnostics.setState({
        codeSections: {},
        unmappedGenCode: [baseDiagnostic],
      });
      const emptyPayload: LSPDiagnosticsPayload = {
        projectConfigId: "project-1",
        genCode: {
          projectConfigId: "project-1",
          errors: {},
          isGenCode: true,
        },
        codeSections: {},
        unmappedGenCode: [],
      };

      processLspDiagnostics(emptyPayload);

      expect(useLspDiagnostics.getState().unmappedGenCode).toEqual([]);
    });
  });

  it("ignores diagnostics in share mode", () => {
    useShareSession.setState({ isDeploymentMode: true });
    const payload: LSPDiagnosticsPayload = {
      projectConfigId: "project-1",
      genCode: {
        projectConfigId: "project-1",
        errors: {},
        isGenCode: true,
      },
      codeSections: {
        "section-1": [baseDiagnostic],
      },
      unmappedGenCode: [baseDiagnostic],
    };

    processLspDiagnostics(payload);

    const state = useLspDiagnostics.getState();
    expect(state.codeSections).toEqual({});
    expect(state.unmappedGenCode).toEqual([]);
    expect(processTypeErrors).not.toHaveBeenCalled();
  });

  it("ignores diagnostics for other project configs", () => {
    const payload: LSPDiagnosticsPayload = {
      projectConfigId: "project-2",
      genCode: {
        projectConfigId: "project-2",
        errors: {},
        isGenCode: true,
      },
      codeSections: {
        "section-1": [baseDiagnostic],
      },
      unmappedGenCode: [baseDiagnostic],
    };

    processLspDiagnostics(payload);

    const state = useLspDiagnostics.getState();
    expect(state.codeSections).toEqual({});
    expect(state.unmappedGenCode).toEqual([]);
    expect(processTypeErrors).not.toHaveBeenCalled();
  });
});
