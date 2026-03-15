import { useProjectState, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  route_set_code_section_diagnostic_code_suppression,
  route_set_code_section_diagnostics_mute,
} from "utils/generatedEndpoints";
import { createProjectConfig } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  setCodeSectionDiagnosticCodeSuppression,
  setCodeSectionDiagnosticsMuted,
} from "./lspDiagnosticsCommands";

vi.mock("utils/generatedEndpoints", () => ({
  route_set_code_section_diagnostics_mute: vi.fn(),
  route_set_code_section_diagnostic_code_suppression: vi.fn(),
}));

describe("lspDiagnosticsCommands", () => {
  beforeEach(() => {
    resetProjectStores();
    useProjectState.setState({
      projectConfig: createProjectConfig({ id: "project-1" }),
    });
    useShareSession.setState({ isDeploymentMode: false });
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("sends mute toggle when not in share mode", () => {
    setCodeSectionDiagnosticsMuted("section-1", true);

    expect(route_set_code_section_diagnostics_mute).toHaveBeenCalledWith({
      projectConfigId: "project-1",
      sectionId: "section-1",
      mute: true,
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

  it("sends suppression update when code is provided", () => {
    setCodeSectionDiagnosticCodeSuppression("section-1", "reportFoo", true);

    expect(
      route_set_code_section_diagnostic_code_suppression,
    ).toHaveBeenCalledWith({
      projectConfigId: "project-1",
      sectionId: "section-1",
      code: "reportFoo",
      suppress: true,
    });
  });
});
