import { resolveCodeLanguageFromPath } from "utils/codeLanguage";
import { resolveFileDropSectionKind } from "utils/fileDropSectionKind";
import { Position } from "utils/generatedTypes";
import {
  openFileInCodeSection,
  openFileInImageSection,
  openFileInSpreadsheetSection,
} from "./createSectionFileOpenCommands";

export type FileDropSectionOpenTarget =
  | {
      kind: "code";
      codeLanguage: ReturnType<typeof resolveCodeLanguageFromPath>;
    }
  | { kind: "image" }
  | { kind: "spreadsheet" }
  | { kind: "unsupported_binary" };

export type OpenFileAsSectionResult =
  | { status: "opened"; sectionId: string }
  | { status: "unsupported_binary" }
  | { status: "failed" };

export function resolveFileDropSectionOpenTarget({
  filePath,
  fileName,
}: {
  filePath: string;
  fileName: string;
}): FileDropSectionOpenTarget {
  const kind = resolveFileDropSectionKind({ fileName, filePath });
  if (kind === "spreadsheet") {
    return { kind: "spreadsheet" };
  }
  if (kind === "image") {
    return { kind: "image" };
  }
  if (kind === "unsupported_binary") {
    return { kind: "unsupported_binary" };
  }
  return {
    kind: "code",
    codeLanguage: resolveCodeLanguageFromPath(filePath),
  };
}

export async function openFileAsSectionForDrop({
  filePath,
  fileName,
  position,
  focusOnSection = true,
}: {
  filePath: string;
  fileName: string;
  position: Position | null;
  focusOnSection?: boolean;
}): Promise<OpenFileAsSectionResult> {
  const target = resolveFileDropSectionOpenTarget({ filePath, fileName });

  if (target.kind === "unsupported_binary") {
    return { status: "unsupported_binary" };
  }

  let sectionId: string | null = null;
  if (target.kind === "spreadsheet") {
    sectionId = await openFileInSpreadsheetSection({
      filePath,
      fileName,
      position,
      focusOnSection,
    });
  } else if (target.kind === "image") {
    sectionId = await openFileInImageSection({
      filePath,
      fileName,
      position,
      focusOnSection,
    });
  } else {
    sectionId = await openFileInCodeSection({
      filePath,
      fileName,
      codeLanguage: target.codeLanguage,
      position,
      focusOnSection,
    });
  }

  if (!sectionId) {
    return { status: "failed" };
  }
  return { status: "opened", sectionId };
}
