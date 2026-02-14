import { getAttachmentPreviewKind } from "utils/attachmentPreview";
import { isSpreadsheetPath } from "utils/spreadsheet";

export type FileDropSectionKind =
  | "spreadsheet"
  | "image"
  | "code"
  | "unsupported_binary";

export function resolveFileDropSectionKind({
  fileName,
  filePath,
}: {
  fileName: string;
  filePath: string;
}): FileDropSectionKind {
  if (isSpreadsheetPath(fileName) || isSpreadsheetPath(filePath)) {
    return "spreadsheet";
  }

  const previewKind = getAttachmentPreviewKind({
    id: filePath,
    name: fileName,
    mimeType: null,
    size: null,
  });

  if (previewKind === "image") {
    return "image";
  }
  if (previewKind === "text") {
    return "code";
  }
  return "unsupported_binary";
}
