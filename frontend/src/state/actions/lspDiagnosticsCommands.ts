import { useShareSession } from "state/definitions";
import {
  route_set_code_section_diagnostic_code_suppression,
  route_set_code_section_diagnostics_mute,
} from "utils/generatedEndpoints";
import { type SettaLspDiagnostic } from "utils/generatedTypes";
import { getCurrProjectConfigId } from "./sectionEffectiveImplSelectors";

export function setCodeSectionDiagnosticsMuted(
  sectionId: string,
  mute: boolean,
) {
  if (useShareSession.getState().isDeploymentMode) {
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
  if (useShareSession.getState().isDeploymentMode) {
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
