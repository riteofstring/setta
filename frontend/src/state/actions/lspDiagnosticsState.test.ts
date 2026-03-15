import { useProjectState, useShareSession } from "state/definitions";
import { useLspDiagnostics } from "state/stores/editorDiagnosticsStores";
import { resetProjectStores } from "state/utils";
import {
  createProjectConfig,
  type SettaLspDiagnostic,
  type SettaLspDiagnosticsPayload,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FORMATTER_DIAGNOSTIC_SOURCE,
  processLspDiagnostics,
} from "./lspDiagnosticsState";
import { processTypeErrors } from "./typeCheck";

vi.mock("./typeCheck", () => ({
  processTypeErrors: vi.fn(),
}));

describe("lspDiagnosticsState", () => {
  const baseDiagnostic: SettaLspDiagnostic = {
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
    const payload: SettaLspDiagnosticsPayload = {
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
    const prevArray = useLspDiagnostics.getState().codeSections["section-1"];
    const nextDiagnostic: SettaLspDiagnostic = {
      ...baseDiagnostic,
      range: {
        start: { ...baseDiagnostic.range.start },
        end: { ...baseDiagnostic.range.end },
      },
    };
    const payload: SettaLspDiagnosticsPayload = {
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

    expect(useLspDiagnostics.getState().codeSections["section-1"]).toBe(
      prevArray,
    );
  });

  it("merges formatter diagnostics with incoming section diagnostics", () => {
    useLspDiagnostics.setState({
      codeSections: { "section-1": [formatterDiagnostic] },
      unmappedGenCode: [],
    });
    const payload: SettaLspDiagnosticsPayload = {
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

    expect(useLspDiagnostics.getState().codeSections["section-1"]).toEqual([
      baseDiagnostic,
      formatterDiagnostic,
    ]);
  });

  it("keeps incoming formatter diagnostics without duplicating previous ones", () => {
    const incomingFormatter: SettaLspDiagnostic = {
      ...formatterDiagnostic,
      message: "Fresh formatter error",
    };
    useLspDiagnostics.setState({
      codeSections: { "section-1": [formatterDiagnostic] },
      unmappedGenCode: [],
    });
    const payload: SettaLspDiagnosticsPayload = {
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

    expect(useLspDiagnostics.getState().codeSections["section-1"]).toEqual([
      incomingFormatter,
      baseDiagnostic,
    ]);
  });

  it("clears diagnostics immediately when a section disappears", () => {
    useLspDiagnostics.setState({
      codeSections: { "section-1": [baseDiagnostic] },
      unmappedGenCode: [],
    });

    processLspDiagnostics({
      projectConfigId: "project-1",
      genCode: {
        projectConfigId: "project-1",
        errors: {},
        isGenCode: true,
      },
      codeSections: {},
      unmappedGenCode: [],
    });

    expect(
      useLspDiagnostics.getState().codeSections["section-1"],
    ).toBeUndefined();
  });

  it("clears diagnostics when a section sends an empty list", () => {
    useLspDiagnostics.setState({
      codeSections: { "section-1": [formatterDiagnostic] },
      unmappedGenCode: [],
    });

    processLspDiagnostics({
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
    });

    expect(
      useLspDiagnostics.getState().codeSections["section-1"],
    ).toBeUndefined();
  });

  it("clears unmapped gen-code diagnostics when the payload is empty", () => {
    useLspDiagnostics.setState({
      codeSections: {},
      unmappedGenCode: [formatterDiagnostic],
    });

    processLspDiagnostics({
      projectConfigId: "project-1",
      genCode: {
        projectConfigId: "project-1",
        errors: {},
        isGenCode: true,
      },
      codeSections: {},
      unmappedGenCode: [],
    });

    expect(useLspDiagnostics.getState().unmappedGenCode).toEqual([]);
  });

  it("ignores diagnostics in share mode", () => {
    useShareSession.setState({ isDeploymentMode: true });

    processLspDiagnostics({
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
    });

    expect(useLspDiagnostics.getState().codeSections).toEqual({});
    expect(useLspDiagnostics.getState().unmappedGenCode).toEqual([]);
    expect(processTypeErrors).not.toHaveBeenCalled();
  });

  it("ignores diagnostics for other project configs", () => {
    processLspDiagnostics({
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
    });

    expect(useLspDiagnostics.getState().codeSections).toEqual({});
    expect(useLspDiagnostics.getState().unmappedGenCode).toEqual([]);
    expect(processTypeErrors).not.toHaveBeenCalled();
  });
});
