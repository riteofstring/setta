import { resetProjectStores } from "state/utils";
import {
  createSettingsState,
  type SettaLspDiagnostic,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it } from "vitest";
import {
  useLspDiagnostics,
  useNameValidationErrors,
  useTypeErrors,
  useWaitingForLSPResult,
} from "./editorDiagnosticsStores";
import { useSettings } from "./uiPreferenceStores";

describe("editorDiagnosticsStores", () => {
  beforeEach(() => {
    resetProjectStores();
    useSettings.setState({});
  });

  it("resets project-scoped editor diagnostics without touching shared settings", () => {
    const settings = createSettingsState();
    useSettings.setState(settings);
    useWaitingForLSPResult.setState({
      textFields: { "section-a-null": true },
      parametersRequest: { "section-a": true },
    });
    useTypeErrors.setState({
      userRequested: true,
      errors: {
        "section-a": {
          callable: ["Bad callable"],
          params: { foo: ["Bad param"] },
        },
      },
    });
    const diagnostic: SettaLspDiagnostic = {
      message: "bad",
      severity: 1,
      code: "reportFoo",
      source: "pyright",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
      uri: "file:///tmp/example.py",
    };
    useLspDiagnostics.setState({
      codeSections: { "section-a": [] },
      unmappedGenCode: [diagnostic],
    });
    useNameValidationErrors.setState({
      pendingByProjectId: {
        "project-a": {
          projectConfigId: "project-a",
          projectErrors: ["bad project"],
          sectionErrors: { "section-a": ["bad section"] },
          paramErrors: { "param-a": ["bad param"] },
        },
      },
      projectErrors: ["bad project"],
      sectionErrors: { "section-a": ["bad section"] },
      paramErrors: { "param-a": ["bad param"] },
    });

    resetProjectStores();

    expect(useSettings.getState()).toEqual(settings);
    expect(useWaitingForLSPResult.getState()).toEqual({
      textFields: {},
      parametersRequest: {},
      reset: expect.any(Function),
    });
    expect(useTypeErrors.getState()).toEqual({
      userRequested: false,
      errors: {},
      reset: expect.any(Function),
    });
    expect(useLspDiagnostics.getState()).toEqual({
      codeSections: {},
      unmappedGenCode: [],
      reset: expect.any(Function),
    });
    expect(useNameValidationErrors.getState()).toEqual({
      pendingByProjectId: {},
      projectErrors: [],
      sectionErrors: {},
      paramErrors: {},
      reset: expect.any(Function),
    });
  });
});
