import {
  useLspDiagnostics,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { getActiveSectionUIIds } from "state/activeSectionUI";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import { route_format_code } from "utils/generatedEndpoints";
import {
  CodeFileAccessModeEnum,
  CodeLanguageEnum,
  SectionTypeEnum,
  type SettaLspDiagnostic,
} from "utils/generatedTypes";
import {
  flushPendingCodeUpdate,
  flushPendingGenCodeUpdates,
} from "./codeUpdates";
import { FORMATTER_DIAGNOSTIC_SOURCE } from "./lspDiagnostics";
import { addTemporaryNotification } from "./notifications";
import {
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
} from "./sectionInfos";

const FORMATTER_SUCCESS_MESSAGE = "Ran formatter.";
const FORMATTER_FAILURE_MESSAGE = "Failed to run formatter.";

const LOCATION_COLON_RE = /:(\d+):(\d+)(?::|\s)/;
const LOCATION_TEXT_RE = /line\s+(\d+).*column\s+(\d+)/i;

function parseFormatterLocation(detail: string) {
  for (const line of detail.split("\n")) {
    const match = LOCATION_COLON_RE.exec(line);
    if (match) {
      return {
        line: Math.max(0, Number.parseInt(match[1], 10) - 1),
        character: Math.max(0, Number.parseInt(match[2], 10) - 1),
      };
    }
    const textMatch = LOCATION_TEXT_RE.exec(line);
    if (textMatch) {
      return {
        line: Math.max(0, Number.parseInt(textMatch[1], 10) - 1),
        character: Math.max(0, Number.parseInt(textMatch[2], 10) - 1),
      };
    }
  }
  return { line: 0, character: 0 };
}

function buildFormatterDiagnostic(detail: string): SettaLspDiagnostic {
  const message = detail.trim() || "Formatter failed.";
  const { line, character } = parseFormatterLocation(message);
  return {
    message,
    severity: 1,
    code: null,
    source: FORMATTER_DIAGNOSTIC_SOURCE,
    range: {
      start: { line, character },
      end: { line, character: character + 1 },
    },
    uri: null,
  };
}

function updateFormatterDiagnosticsForSection(
  sectionId: string,
  diagnostic: SettaLspDiagnostic,
) {
  useLspDiagnostics.setState((state) => {
    const existing = state.codeSections[sectionId] ?? [];
    const filtered = existing.filter(
      (entry) => entry.source !== FORMATTER_DIAGNOSTIC_SOURCE,
    );
    state.codeSections[sectionId] = [...filtered, diagnostic];
  });
}

function clearFormatterDiagnosticsForSection(sectionId: string) {
  useLspDiagnostics.setState((state) => {
    const existing = state.codeSections[sectionId];
    if (!existing) {
      return;
    }
    const filtered = existing.filter(
      (entry) => entry.source !== FORMATTER_DIAGNOSTIC_SOURCE,
    );
    if (filtered.length === 0) {
      delete state.codeSections[sectionId];
      return;
    }
    state.codeSections[sectionId] = filtered;
  });
}

function updateFormatterDiagnosticsForGenCode(diagnostic: SettaLspDiagnostic) {
  useLspDiagnostics.setState((state) => {
    const filtered = state.unmappedGenCode.filter(
      (entry) => entry.source !== FORMATTER_DIAGNOSTIC_SOURCE,
    );
    state.unmappedGenCode = [...filtered, diagnostic];
  });
}

function clearFormatterDiagnosticsForGenCode() {
  useLspDiagnostics.setState((state) => {
    if (state.unmappedGenCode.length === 0) {
      return;
    }
    state.unmappedGenCode = state.unmappedGenCode.filter(
      (entry) => entry.source !== FORMATTER_DIAGNOSTIC_SOURCE,
    );
  });
}

export async function formatActiveCodeSection(): Promise<void> {
  const shareSession = useShareSession.getState();
  if (shareSession.isDeploymentMode) {
    addTemporaryNotification("Formatting is disabled in share mode.");
    return;
  }

  const state = useProjectState.getState();
  const sectionId = getActiveSectionUIIds()[0];
  if (!sectionId) {
    addTemporaryNotification("Select a code section to format.");
    return;
  }

  const impl = getCurrEffectiveSectionImpl(state, sectionId);
  if (
    impl.type !== SectionTypeEnum.Code &&
    impl.type !== SectionTypeEnum.GenPythonCode
  ) {
    addTemporaryNotification("Select a Python code section to format.");
    return;
  }
  if (
    impl.type === SectionTypeEnum.Code &&
    impl.codeLanguage !== CodeLanguageEnum.python
  ) {
    addTemporaryNotification("Format is only available for Python code.");
    return;
  }
  if (
    impl.type === SectionTypeEnum.Code &&
    impl.codeFileBinding?.access_mode === CodeFileAccessModeEnum.read_only
  ) {
    addTemporaryNotification("This code section is read-only.");
    return;
  }

  if (impl.type === SectionTypeEnum.GenPythonCode) {
    await flushPendingGenCodeUpdates();
  } else {
    await flushPendingCodeUpdate(sectionId);
  }

  const res = await route_format_code({
    projectConfigId: getCurrProjectConfigId(),
    sectionId,
  });
  if (!res200(res)) {
    const detail = getErrorDetail(res.data) ?? "Formatter failed.";
    const diagnostic = buildFormatterDiagnostic(detail);
    if (impl.type === SectionTypeEnum.GenPythonCode) {
      updateFormatterDiagnosticsForGenCode(diagnostic);
    } else {
      updateFormatterDiagnosticsForSection(sectionId, diagnostic);
    }
    addTemporaryNotification(FORMATTER_FAILURE_MESSAGE);
    return;
  }

  if (impl.type === SectionTypeEnum.GenPythonCode) {
    clearFormatterDiagnosticsForGenCode();
  } else {
    clearFormatterDiagnosticsForSection(sectionId);
  }
  addTemporaryNotification(FORMATTER_SUCCESS_MESSAGE);
}
