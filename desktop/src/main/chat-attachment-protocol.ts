import {
  imageAttachmentMimeTypeValues,
  imageAttachmentVariantKindValues,
  type ImageAttachmentMimeType,
  type ImageAttachmentVariantKind,
} from "@generated/backend";
import { protocol } from "electron";
import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

const chatAttachmentScheme = "setta-attachment";
const chatAttachmentIDPattern = /^[A-Za-z0-9_-]+$/;

protocol.registerSchemesAsPrivileged([
  {
    scheme: chatAttachmentScheme,
    privileges: { secure: true, standard: true, supportFetchAPI: true },
  },
]);

interface ChatAttachmentMetadata {
  variants: ChatAttachmentVariantRecord[];
}

interface ChatAttachmentVariantRecord {
  kind: ImageAttachmentVariantKind;
  relativePath: string;
  mimeType: ImageAttachmentMimeType;
  byteSize: number;
  width: number;
  height: number;
}

type ChatAttachmentVariant = ImageAttachmentVariantKind;
type ChatAttachmentPathParts = [string, string, string, ChatAttachmentVariant];

export function registerChatAttachmentProtocol(appDataDir: string) {
  protocol.handle(chatAttachmentScheme, async (request) => {
    return serveChatAttachment(appDataDir, request.url);
  });
}

async function serveChatAttachment(appDataDir: string, rawUrl: string) {
  try {
    const resource = parseChatAttachmentURL(rawUrl);
    if (!resource) {
      return new Response(null, { status: 404 });
    }
    const attachmentDir = resolve(
      appDataDir,
      "workspaces",
      resource.workspaceId,
      "conversations",
      resource.conversationId,
      "attachments",
      resource.attachmentId,
    );
    const metadata = await readChatAttachmentMetadata(join(attachmentDir, "metadata.json"));
    const variant = metadata.variants.find((candidate) => candidate.kind === resource.variant);
    if (!variant) {
      throw new Error(`missing chat attachment ${resource.variant} variant`);
    }
    const filePath = safeChatAttachmentFilePath(attachmentDir, variant.relativePath);
    const data = await readFile(filePath);
    return new Response(data, {
      headers: {
        "cache-control": "no-store",
        "content-type": variant.mimeType,
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}

function parseChatAttachmentURL(rawUrl: string) {
  const parsed = new URL(rawUrl);
  if (parsed.hostname !== "image") {
    return null;
  }
  const parts = parsed.pathname
    .split("/")
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));
  if (!isChatAttachmentPath(parts)) {
    return null;
  }
  const [workspaceId, conversationId, attachmentId, variant] = parts;
  return { attachmentId, conversationId, variant, workspaceId };
}

function isChatAttachmentPath(parts: string[]): parts is ChatAttachmentPathParts {
  if (parts.length !== 4) {
    return false;
  }
  const [workspaceId = "", conversationId = "", attachmentId = "", variant = ""] = parts;
  return (
    isChatAttachmentID(workspaceId) &&
    isChatAttachmentID(conversationId) &&
    isChatAttachmentID(attachmentId) &&
    isChatAttachmentVariant(variant)
  );
}

function isChatAttachmentVariant(value: string): value is ChatAttachmentVariant {
  return (imageAttachmentVariantKindValues as readonly string[]).includes(value);
}

function isChatAttachmentMimeType(value: string): value is ImageAttachmentMimeType {
  return (imageAttachmentMimeTypeValues as readonly string[]).includes(value);
}

async function readChatAttachmentMetadata(path: string): Promise<ChatAttachmentMetadata> {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as Partial<ChatAttachmentMetadata>;
  if (!Array.isArray(parsed.variants) || !parsed.variants.every(isChatAttachmentVariantRecord)) {
    throw new Error("invalid chat attachment metadata");
  }
  return parsed as ChatAttachmentMetadata;
}

function isChatAttachmentVariantRecord(value: unknown): value is ChatAttachmentVariantRecord {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Partial<ChatAttachmentVariantRecord>;
  return hasChatAttachmentVariantIdentity(record) && hasChatAttachmentVariantMetrics(record);
}

function hasChatAttachmentVariantIdentity(record: Partial<ChatAttachmentVariantRecord>) {
  return (
    typeof record.kind === "string" &&
    isChatAttachmentVariant(record.kind) &&
    typeof record.relativePath === "string" &&
    typeof record.mimeType === "string" &&
    isChatAttachmentMimeType(record.mimeType)
  );
}

function hasChatAttachmentVariantMetrics(record: Partial<ChatAttachmentVariantRecord>) {
  return (
    isPositiveNumber(record.byteSize) &&
    isPositiveNumber(record.width) &&
    isPositiveNumber(record.height)
  );
}

function isPositiveNumber(value: unknown) {
  return typeof value === "number" && value > 0;
}

function safeChatAttachmentFilePath(attachmentDir: string, relativePath: string) {
  if (
    relativePath === "" ||
    relativePath.includes("/") ||
    relativePath.includes("\\") ||
    relativePath === "." ||
    relativePath === ".."
  ) {
    throw new Error("invalid chat attachment path");
  }
  const filePath = resolve(attachmentDir, relativePath);
  const root = resolve(attachmentDir) + sep;
  if (!filePath.startsWith(root)) {
    throw new Error("invalid chat attachment path");
  }
  return filePath;
}

function isChatAttachmentID(value: string) {
  return chatAttachmentIDPattern.test(value);
}
