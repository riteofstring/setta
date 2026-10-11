import {
  WORKSPACE_CODE_SECTION_KIND,
  createWorkspaceCodeSectionData,
  getWorkspaceCodeSectionData,
  type WorkspaceCodeSectionDiagnostic,
  type WorkspaceHost,
  type WorkspaceSection,
} from "@riteofstring/setta";

import {
  DIAGNOSTIC_SEVERITY_INFORMATION_V2,
  type ProjectSnapshotV2,
} from "../api/generatedContract";

const generatedCodeSeparator = "\n\n";

export function projectGeneratedPythonSection(
  snapshot: ProjectSnapshotV2,
  sectionId: string,
  size: WorkspaceSection["size"],
): WorkspaceSection {
  return {
    children: [],
    data: projectGeneratedCodeData(snapshot),
    id: sectionId,
    isHorizontalOrientation: false,
    isMinimized: false,
    kind: WORKSPACE_CODE_SECTION_KIND,
    name: "Generated Python",
    overflowMode: false,
    positionAndSizeLocked: false,
    size,
    styleColor: null,
    tagColor: null,
  };
}

export function readGeneratedPythonTarget(
  host: WorkspaceHost,
  sectionId: string,
): { generated: string; prefix: string; suffix: string } {
  const data = getWorkspaceCodeSectionData(host, sectionId);
  if (data.mode !== "generated-document") {
    throw new Error("Generated Python is not a generated document.");
  }
  const { from, to } = data.generatedRegion;
  const protectedCode = data.code.slice(from, to);
  if (
    !protectedCode.startsWith(generatedCodeSeparator) ||
    !protectedCode.endsWith(generatedCodeSeparator)
  ) {
    throw new Error("Generated Python separators are not canonical.");
  }
  return {
    generated: protectedCode.slice(
      generatedCodeSeparator.length,
      -generatedCodeSeparator.length,
    ),
    prefix: data.code.slice(0, from),
    suffix: data.code.slice(to),
  };
}

export function retainedGeneratedCodeData(
  host: WorkspaceHost,
  snapshot: ProjectSnapshotV2,
  sectionId: string,
) {
  const { prefix, suffix } = readGeneratedPythonTarget(host, sectionId);
  return generatedCodeSectionData({
    body: snapshot.generatedCode.body,
    diagnostics: [],
    prefix,
    suffix,
  });
}

function projectGeneratedCodeData(snapshot: ProjectSnapshotV2) {
  const { prefix, suffix } = snapshot.pythonTarget;
  const { body, code, generatedBodyRange } = snapshot.generatedCode;
  const expected = `${prefix}${generatedCodeSeparator}${body}${generatedCodeSeparator}${suffix}`;
  if (code !== expected) {
    throw new Error(
      "Generated Python does not compose its canonical target and body.",
    );
  }
  return generatedCodeSectionData({
    body,
    diagnostics: projectDocumentDiagnostics(snapshot),
    generatedBodyRange,
    prefix,
    suffix,
  });
}

function generatedCodeSectionData({
  body,
  diagnostics,
  generatedBodyRange,
  prefix,
  suffix,
}: {
  body: string;
  diagnostics: ReadonlyArray<WorkspaceCodeSectionDiagnostic>;
  generatedBodyRange?: { end: number; start: number };
  prefix: string;
  suffix: string;
}) {
  const bodyStartBytes =
    generatedBodyRange?.start ??
    utf8ByteLength(prefix) + generatedCodeSeparator.length;
  const bodyEndBytes =
    generatedBodyRange?.end ?? bodyStartBytes + utf8ByteLength(body);
  const code = `${prefix}${generatedCodeSeparator}${body}${generatedCodeSeparator}${suffix}`;
  const separatorBytes = utf8ByteLength(generatedCodeSeparator);
  return createWorkspaceCodeSectionData({
    code,
    diagnostics: [...diagnostics],
    generatedRegion: {
      from: utf8ByteOffsetToUtf16Offset(code, bodyStartBytes - separatorBytes),
      to: utf8ByteOffsetToUtf16Offset(code, bodyEndBytes + separatorBytes),
    },
    indentWidth: 4,
    language: "python",
    lineNumbers: true,
    mode: "generated-document",
    wrapLines: true,
  });
}

function projectDocumentDiagnostics(
  snapshot: ProjectSnapshotV2,
): Array<WorkspaceCodeSectionDiagnostic> {
  return snapshot.diagnostics.flatMap((diagnostic) => {
    if (diagnostic.targetId !== null) {
      return [];
    }
    return [
      {
        from: utf8ByteOffsetToUtf16Offset(
          snapshot.generatedCode.code,
          diagnostic.start,
        ),
        to: utf8ByteOffsetToUtf16Offset(
          snapshot.generatedCode.code,
          diagnostic.end,
        ),
        message: diagnostic.message,
        severity:
          diagnostic.severity === DIAGNOSTIC_SEVERITY_INFORMATION_V2
            ? "info"
            : diagnostic.severity,
      },
    ];
  });
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function utf8ByteOffsetToUtf16Offset(code: string, byteOffset: number): number {
  const encoder = new TextEncoder();
  let utf8Offset = 0;
  let utf16Offset = 0;
  if (byteOffset === 0) {
    return 0;
  }
  for (const character of code) {
    const nextUtf8Offset = utf8Offset + encoder.encode(character).length;
    if (byteOffset < nextUtf8Offset) {
      throw new Error("Document offset is not a UTF-8 boundary.");
    }
    utf8Offset = nextUtf8Offset;
    utf16Offset += character.length;
    if (byteOffset === utf8Offset) {
      return utf16Offset;
    }
  }
  throw new Error("Document offset exceeds generated Python.");
}
