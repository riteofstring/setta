import { Diagnostic, linter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { LSPDiagnostic } from "utils/generatedTypes";

const LSP_SEVERITY_MAP: Record<number, Diagnostic["severity"]> = {
  1: "error",
  2: "warning",
  3: "info",
  4: "info",
};

function toCodeMirrorDiagnostics(
  view: EditorView,
  diagnostics: Array<LSPDiagnostic>,
): Array<Diagnostic> {
  const { doc } = view.state;
  const lastLine = doc.lines;
  return diagnostics
    .map((diagnostic) => {
      const startLine = diagnostic.range.start.line + 1;
      if (startLine < 1 || startLine > lastLine) {
        return null;
      }
      const startInfo = doc.line(startLine);
      const startOffset = Math.min(
        diagnostic.range.start.character,
        startInfo.length,
      );
      const from = startInfo.from + startOffset;

      const endLine = diagnostic.range.end.line + 1;
      let endInfo = null;
      if (endLine >= 1 && endLine <= lastLine) {
        endInfo = doc.line(endLine);
      }
      const endOffset = endInfo
        ? Math.min(diagnostic.range.end.character, endInfo.length)
        : 0;
      let to = endInfo ? endInfo.from + endOffset : doc.length;
      if (to < from) {
        to = from;
      }

      return {
        from,
        to,
        severity:
          (diagnostic.severity && LSP_SEVERITY_MAP[diagnostic.severity]) ||
          "error",
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
  return [linter((view) => toCodeMirrorDiagnostics(view, diagnostics))];
}
