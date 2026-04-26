import { formatCode } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import { getActiveSectionUIIds } from "state/activeSectionUI";
import {
  useLspDiagnostics,
  useProjectState,
  useShareSession,
} from "state/definitions";
import {
  getErrorDetail,
  res200,
  type ResponseDataAndStatus,
} from "utils/endpointUtils";
import {
  CodeFileAccessModeEnum,
  CodeLanguageEnum,
  SectionTypeEnum,
  type BaseSectionImplUnion,
  type LSPDiagnostic,
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
type FormatCodeRouteResponse = ResponseDataAndStatus<null>;
const LOCATION_COLON_RE = /:(\d+):(\d+)(?::|\s)/;
const LOCATION_TEXT_RE = /line\s+(\d+).*column\s+(\d+)/i;
type CodeFormatTarget = {
  sectionId: string;
  impl: Extract<BaseSectionImplUnion, { type: SectionTypeEnum.Code }>;
};
type GeneratedCodeFormatTarget = {
  sectionId: string;
  impl: Extract<BaseSectionImplUnion, { type: SectionTypeEnum.GenPythonCode }>;
};
type FormatTarget = CodeFormatTarget | GeneratedCodeFormatTarget;

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
function buildFormatterDiagnostic(detail: string): LSPDiagnostic {
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
  diagnostic: LSPDiagnostic,
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
function updateFormatterDiagnosticsForGenCode(diagnostic: LSPDiagnostic) {
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

function getActiveFormatTarget(): FormatTarget | null {
  const sectionId = getActiveSectionUIIds()[0];
  if (!sectionId) {
    addTemporaryNotification("Select a code section to format.");
    return null;
  }
  const impl = getCurrEffectiveSectionImpl(
    useProjectState.getState(),
    sectionId,
  );
  if (impl.type === SectionTypeEnum.GenPythonCode) {
    return { sectionId, impl };
  }
  if (impl.type !== SectionTypeEnum.Code) {
    addTemporaryNotification("Select a Python code section to format.");
    return null;
  }
  if (impl.codeLanguage !== CodeLanguageEnum.python) {
    addTemporaryNotification("Format is only available for Python code.");
    return null;
  }
  if (impl.codeFileBinding?.access_mode === CodeFileAccessModeEnum.read_only) {
    addTemporaryNotification("This code section is read-only.");
    return null;
  }
  return { sectionId, impl };
}

async function flushPendingFormatTarget(target: FormatTarget): Promise<void> {
  if (target.impl.type === SectionTypeEnum.GenPythonCode) {
    await flushPendingGenCodeUpdates();
    return;
  }
  await flushPendingCodeUpdate(target.sectionId);
}

function updateFormatFailureDiagnostics(
  target: FormatTarget,
  diagnostic: LSPDiagnostic,
): void {
  if (target.impl.type === SectionTypeEnum.GenPythonCode) {
    updateFormatterDiagnosticsForGenCode(diagnostic);
    return;
  }
  updateFormatterDiagnosticsForSection(target.sectionId, diagnostic);
}

function clearFormatDiagnostics(target: FormatTarget): void {
  if (target.impl.type === SectionTypeEnum.GenPythonCode) {
    clearFormatterDiagnosticsForGenCode();
    return;
  }
  clearFormatterDiagnosticsForSection(target.sectionId);
}

export async function formatActiveCodeSection(): Promise<void> {
  const shareSession = useShareSession.getState();
  if (shareSession.isDeploymentMode) {
    addTemporaryNotification("Formatting is disabled in share mode.");
    return;
  }
  const target = getActiveFormatTarget();
  if (!target) {
    return;
  }
  await flushPendingFormatTarget(target);
  const res = (await callOpenAPI(
    formatCode({
      body: {
        projectConfigId: getCurrProjectConfigId(),
        sectionId: target.sectionId,
      },
    } as Parameters<typeof formatCode>[0]),
  )) as FormatCodeRouteResponse;
  if (!res200(res)) {
    const detail = getErrorDetail(res.data) ?? "Formatter failed.";
    updateFormatFailureDiagnostics(target, buildFormatterDiagnostic(detail));
    addTemporaryNotification(FORMATTER_FAILURE_MESSAGE);
    return;
  }
  clearFormatDiagnostics(target);
  addTemporaryNotification(FORMATTER_SUCCESS_MESSAGE);
}
