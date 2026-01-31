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

function areDiagnosticRangesEqual(
  left: SettaLspDiagnostic["range"],
  right: SettaLspDiagnostic["range"],
) {
  return (
    left.start.line === right.start.line &&
    left.start.character === right.start.character &&
    left.end.line === right.end.line &&
    left.end.character === right.end.character
  );
}

function areDiagnosticsEqual(
  left: SettaLspDiagnostic,
  right: SettaLspDiagnostic,
) {
  if (left === right) {
    return true;
  }
  return (
    left.message === right.message &&
    left.severity === right.severity &&
    left.code === right.code &&
    left.source === right.source &&
    left.uri === right.uri &&
    areDiagnosticRangesEqual(left.range, right.range)
  );
}

function areDiagnosticsListEqual(
  left: Array<SettaLspDiagnostic>,
  right: Array<SettaLspDiagnostic>,
) {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let idx = 0; idx < left.length; idx += 1) {
    if (!areDiagnosticsEqual(left[idx], right[idx])) {
      return false;
    }
  }
  return true;
}

function mergeDiagnosticsBySection(
  previous: Record<string, Array<SettaLspDiagnostic>>,
  incoming: Record<string, Array<SettaLspDiagnostic>>,
) {
  let changed = false;
  const merged: Record<string, Array<SettaLspDiagnostic>> = {};

  for (const [sectionId, nextDiagnostics] of Object.entries(incoming)) {
    const prevDiagnostics = previous[sectionId];
    if (
      prevDiagnostics &&
      areDiagnosticsListEqual(prevDiagnostics, nextDiagnostics)
    ) {
      merged[sectionId] = prevDiagnostics;
    } else {
      merged[sectionId] = nextDiagnostics;
      if (prevDiagnostics !== nextDiagnostics) {
        changed = true;
      }
    }
  }

  for (const sectionId of Object.keys(previous)) {
    if (!(sectionId in incoming)) {
      changed = true;
    }
  }

  return { codeSections: merged, changed };
}

export function processLspDiagnostics(payload: SettaLspDiagnosticsPayload) {
  if (useShareSession.getState().isShareMode) {
    return;
  }
  const projectConfigId = useProjectState.getState().projectConfig.id;
  if (payload.projectConfigId !== projectConfigId) {
    return;
  }

  processTypeErrors(payload.genCode);
  const prevState = useLspDiagnostics.getState();
  const merged = mergeDiagnosticsBySection(
    prevState.codeSections,
    payload.codeSections,
  );
  const unmappedChanged = !areDiagnosticsListEqual(
    prevState.unmappedGenCode,
    payload.unmappedGenCode,
  );
  if (!merged.changed && !unmappedChanged) {
    return;
  }
  useLspDiagnostics.setState({
    codeSections: merged.codeSections,
    unmappedGenCode: unmappedChanged
      ? payload.unmappedGenCode
      : prevState.unmappedGenCode,
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
