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
  mimeType: string;
  originalRelativePath: string;
  thumbnailMimeType: string;
  thumbnailRelativePath: string;
}

type ChatAttachmentVariant = "thumbnail" | "preview";
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
    const relativePath =
      resource.variant === "thumbnail"
        ? metadata.thumbnailRelativePath
        : metadata.originalRelativePath;
    const filePath = safeChatAttachmentFilePath(attachmentDir, relativePath);
    const contentType =
      resource.variant === "thumbnail"
        ? metadata.thumbnailMimeType || "image/png"
        : metadata.mimeType;
    const data = await readFile(filePath);
    return new Response(data, {
      headers: {
        "cache-control": "no-store",
        "content-type": contentType || "application/octet-stream",
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
  return value === "thumbnail" || value === "preview";
}

async function readChatAttachmentMetadata(path: string): Promise<ChatAttachmentMetadata> {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as Partial<ChatAttachmentMetadata>;
  if (
    typeof parsed.mimeType !== "string" ||
    typeof parsed.originalRelativePath !== "string" ||
    typeof parsed.thumbnailMimeType !== "string" ||
    typeof parsed.thumbnailRelativePath !== "string"
  ) {
    throw new Error("invalid chat attachment metadata");
  }
  return parsed as ChatAttachmentMetadata;
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
