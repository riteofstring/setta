import {
  useLspDiagnostics,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { SettaLspDiagnosticsPayload } from "utils/generatedTypes";
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
