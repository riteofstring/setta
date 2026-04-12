import { EditorState } from "@codemirror/state";
import { type LSPDiagnostic } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { mapLspDiagnosticsToCodeMirrorDiagnostics } from "./lspDiagnostics";

function createDiagnostic(
  range: LSPDiagnostic["range"],
  overrides: Partial<LSPDiagnostic> = {},
): LSPDiagnostic {
  return {
    message: "Bad code",
    range,
    severity: 1,
    source: "pyright",
    uri: "file:///tmp/example.py",
    ...overrides,
  };
}

describe("mapLspDiagnosticsToCodeMirrorDiagnostics", () => {
  it("skips diagnostics whose start line is outside the document", () => {
    const doc = EditorState.create({ doc: "alpha\nbeta" }).doc;

    const diagnostics = mapLspDiagnosticsToCodeMirrorDiagnostics(doc, [
      createDiagnostic({
        start: { line: 4, character: 0 },
        end: { line: 4, character: 2 },
      }),
    ]);

    expect(diagnostics).toEqual([]);
  });

  it("clamps offsets to the available line length", () => {
    const doc = EditorState.create({ doc: "abc\ndef" }).doc;
    const firstLine = doc.line(1);
    const secondLine = doc.line(2);

    const diagnostics = mapLspDiagnosticsToCodeMirrorDiagnostics(doc, [
      createDiagnostic({
        start: { line: 0, character: 20 },
        end: { line: 1, character: 20 },
      }),
    ]);

    expect(diagnostics).toEqual([
      {
        from: firstLine.from + firstLine.length,
        to: secondLine.from + secondLine.length,
        severity: "error",
        message: "Bad code",
        source: "pyright",
      },
    ]);
  });

  it("clamps reversed or missing end ranges to a valid diagnostic span", () => {
    const doc = EditorState.create({ doc: "abc\ndef" }).doc;
    const secondLine = doc.line(2);
    const expectedFrom = secondLine.from + 2;

    const diagnostics = mapLspDiagnosticsToCodeMirrorDiagnostics(doc, [
      createDiagnostic({
        start: { line: 1, character: 2 },
        end: { line: 0, character: 1 },
      }),
      createDiagnostic(
        {
          start: { line: 1, character: 1 },
          end: { line: 9, character: 1 },
        },
        { message: "Missing end", severity: null, source: null },
      ),
    ]);

    expect(diagnostics).toEqual([
      {
        from: expectedFrom,
        to: expectedFrom,
        severity: "error",
        message: "Bad code",
        source: "pyright",
      },
      {
        from: secondLine.from + 1,
        to: doc.length,
        severity: "error",
        message: "Missing end",
        source: undefined,
      },
    ]);
  });
});
