export type FileBrowserDragPayload = {
  name: string;
  fullPath: string;
  type: "file" | "folder";
};

export const FILE_BROWSER_DRAG_MIME_TYPE =
  "application/x-setta-file-browser-node";
const FILE_BROWSER_DRAG_TEXT_PREFIX = "setta:file-browser-node:";

export function setFileBrowserDragPayload(
  dataTransfer: DataTransfer,
  payload: FileBrowserDragPayload,
) {
  const serialized = JSON.stringify(payload);
  dataTransfer.setData(FILE_BROWSER_DRAG_MIME_TYPE, serialized);
  dataTransfer.setData(
    "text/plain",
    `${FILE_BROWSER_DRAG_TEXT_PREFIX}${serialized}`,
  );
}

function parsePayload(value: string | null): FileBrowserDragPayload | null {
  if (!value) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("name" in parsed) ||
    !("fullPath" in parsed) ||
    !("type" in parsed)
  ) {
    return null;
  }
  const candidate = parsed as {
    name?: unknown;
    fullPath?: unknown;
    type?: unknown;
  };
  if (
    typeof candidate.name !== "string" ||
    typeof candidate.fullPath !== "string" ||
    (candidate.type !== "file" && candidate.type !== "folder")
  ) {
    return null;
  }
  return {
    name: candidate.name,
    fullPath: candidate.fullPath,
    type: candidate.type,
  };
}

export function getFileBrowserDragPayload(
  dataTransfer: DataTransfer | null,
): FileBrowserDragPayload | null {
  if (!dataTransfer) {
    return null;
  }
  const typedPayload = parsePayload(
    dataTransfer.getData(FILE_BROWSER_DRAG_MIME_TYPE),
  );
  if (typedPayload) {
    return typedPayload;
  }
  const plainText = dataTransfer.getData("text/plain");
  if (!plainText.startsWith(FILE_BROWSER_DRAG_TEXT_PREFIX)) {
    return null;
  }
  return parsePayload(plainText.slice(FILE_BROWSER_DRAG_TEXT_PREFIX.length));
}
