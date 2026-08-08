import { Diagnostic, linter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { LSPDiagnostic } from "utils/generatedTypes";

const LSP_SEVERITY_MAP: Record<number, Diagnostic["severity"]> = {
  1: "error",
  2: "warning",
  3: "info",
  4: "info",
};

type CodeMirrorDoc = EditorView["state"]["doc"];

function getDiagnosticSeverity(
  diagnostic: LSPDiagnostic,
): Diagnostic["severity"] {
  return (
    (diagnostic.severity && LSP_SEVERITY_MAP[diagnostic.severity]) || "error"
  );
}

function getValidDocLine(doc: CodeMirrorDoc, zeroBasedLine: number) {
  const lineNumber = zeroBasedLine + 1;
  if (lineNumber < 1 || lineNumber > doc.lines) {
    return null;
  }
  return doc.line(lineNumber);
}

function getLineOffset(
  lineInfo: { from: number; length: number },
  character: number,
) {
  return lineInfo.from + Math.min(character, lineInfo.length);
}

function getDiagnosticRange(doc: CodeMirrorDoc, diagnostic: LSPDiagnostic) {
  const startLine = getValidDocLine(doc, diagnostic.range.start.line);
  if (!startLine) {
    return null;
  }

  const from = getLineOffset(startLine, diagnostic.range.start.character);
  const endLine = getValidDocLine(doc, diagnostic.range.end.line);
  const to = endLine
    ? getLineOffset(endLine, diagnostic.range.end.character)
    : doc.length;

  return { from, to: Math.max(to, from) };
}

function mapLspDiagnosticsToCodeMirrorDiagnostics(
  doc: CodeMirrorDoc,
  diagnostics: Array<LSPDiagnostic>,
): Array<Diagnostic> {
  return diagnostics
    .map((diagnostic) => {
      const range = getDiagnosticRange(doc, diagnostic);
      if (!range) {
        return null;
      }

      return {
        ...range,
        severity: getDiagnosticSeverity(diagnostic),
        message: diagnostic.message,
        source: diagnostic.source ?? undefined,
      } satisfies Diagnostic;
    })
    .filter((entry): entry is Diagnostic => entry !== null);
}

export function buildLspDiagnosticsExtensions(
  diagnostics: Array<LSPDiagnostic>,
) {
  if (diagnostics.length === 0) {
    return [];
  }
  return [
    linter((view) =>
      mapLspDiagnosticsToCodeMirrorDiagnostics(view.state.doc, diagnostics),
    ),
  ];
}
