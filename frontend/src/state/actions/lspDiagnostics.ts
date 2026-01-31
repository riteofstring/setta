import {
  useLspDiagnostics,
  useProjectState,
  useShareSession,
} from "state/definitions";
import {
  route_set_code_section_diagnostic_code_suppression,
  route_set_code_section_diagnostics_mute,
} from "utils/generatedEndpoints";
import {
  SettaLspDiagnosticsPayload,
  type SettaLspDiagnostic,
} from "utils/generatedTypes";
import { getCurrProjectConfigId } from "./sectionInfos";
import { processTypeErrors } from "./typeCheck";

export function processLspDiagnostics(payload: SettaLspDiagnosticsPayload) {
  if (useShareSession.getState().isShareMode) {
    return;
  }
  const projectConfigId = useProjectState.getState().projectConfig.id;
  if (payload.projectConfigId !== projectConfigId) {
    return;
  }

  processTypeErrors(payload.genCode);
  useLspDiagnostics.setState({
    codeSections: payload.codeSections,
    unmappedGenCode: payload.unmappedGenCode,
  });
}

export function setCodeSectionDiagnosticsMuted(
  sectionId: string,
  mute: boolean,
) {
  if (useShareSession.getState().isShareMode) {
    return;
  }
  const projectConfigId = getCurrProjectConfigId();
  return route_set_code_section_diagnostics_mute({
    projectConfigId,
    sectionId,
    mute,
  });
}

export function setCodeSectionDiagnosticCodeSuppression(
  sectionId: string,
  code: SettaLspDiagnostic["code"],
  suppress: boolean,
) {
  if (useShareSession.getState().isShareMode) {
    return;
  }
  if (code === null || code === undefined) {
    return;
  }
  const projectConfigId = getCurrProjectConfigId();
  return route_set_code_section_diagnostic_code_suppression({
    projectConfigId,
    sectionId,
    code,
    suppress,
  });
}
