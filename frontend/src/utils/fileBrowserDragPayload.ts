export type FileBrowserDragPayload = {
  name: string;
  fullPath: string;
  type: "file" | "folder";
};

const FILE_BROWSER_DRAG_MIME_TYPE = "application/x-setta-file-browser-node";
const FILE_BROWSER_DRAG_TEXT_PREFIX = "setta:file-browser-node:";
type DragPayloadRecord = Record<string, unknown>;

function parseJsonObject(value: string): DragPayloadRecord | null {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as DragPayloadRecord)
      : null;
  } catch {
    return null;
  }
}

function getStringField(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function getPayloadType(value: unknown): FileBrowserDragPayload["type"] | null {
  return value === "file" || value === "folder" ? value : null;
}

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
  const parsed = parseJsonObject(value);
  if (!parsed) {
    return null;
  }
  const name = getStringField(parsed.name);
  const fullPath = getStringField(parsed.fullPath);
  const type = getPayloadType(parsed.type);
  if (!name || !fullPath || !type) {
    return null;
  }
  return {
    name,
    fullPath,
    type,
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
