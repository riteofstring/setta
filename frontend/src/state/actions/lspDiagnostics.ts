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
  const seen = new Set<string>();

  for (const [sectionId, nextDiagnostics] of Object.entries(incoming)) {
    seen.add(sectionId);
    const prevDiagnostics = previous[sectionId];
    if (nextDiagnostics.length === 0) {
      if (prevDiagnostics?.length) {
        changed = true;
      }
      continue;
    }

    if (
      prevDiagnostics &&
      areDiagnosticsListEqual(prevDiagnostics, nextDiagnostics)
    ) {
      merged[sectionId] = prevDiagnostics;
      continue;
    }
    merged[sectionId] = nextDiagnostics;
    if (!prevDiagnostics || prevDiagnostics !== nextDiagnostics) {
      changed = true;
    }
  }

  for (const sectionId of Object.keys(previous)) {
    if (seen.has(sectionId)) {
      continue;
    }
    if (previous[sectionId]?.length) {
      changed = true;
    }
  }

  return { codeSections: merged, changed };
}

function mergeUnmappedGenCode(
  previous: Array<SettaLspDiagnostic>,
  incoming: Array<SettaLspDiagnostic>,
) {
  if (incoming.length === 0) {
    if (previous.length > 0) {
      return { unmappedGenCode: [], changed: true };
    }
    return { unmappedGenCode: previous, changed: false };
  }
  if (areDiagnosticsListEqual(previous, incoming)) {
    return { unmappedGenCode: previous, changed: false };
  }
  return { unmappedGenCode: incoming, changed: true };
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
  const mergedUnmapped = mergeUnmappedGenCode(
    prevState.unmappedGenCode,
    payload.unmappedGenCode,
  );
  if (!merged.changed && !mergedUnmapped.changed) {
    return;
  }
  useLspDiagnostics.setState({
    codeSections: merged.codeSections,
    unmappedGenCode: mergedUnmapped.unmappedGenCode,
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
