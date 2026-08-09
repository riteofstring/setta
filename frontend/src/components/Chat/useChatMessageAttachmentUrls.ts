import {
  callOpenAPI,
  getErrorDetail,
  res200,
} from "@setta/app-subsystem-frontend-sdk";
import {
  getAttachmentDownloadUrls,
  type HttpapiAttachmentDownloadUrlEntry,
} from "openapi/http";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { BaseChatMessageUnion, ChatFileAttachment } from "utils/generatedTypes";
const ATTACHMENT_URL_REFRESH_BUFFER_MS = 30000;
export type AttachmentUrlEntry = {
  url: HttpapiAttachmentDownloadUrlEntry["url"];
  expiresAt: HttpapiAttachmentDownloadUrlEntry["expiresAt"];
};

export function isAttachmentUrlStale(
  entry: AttachmentUrlEntry,
  now: number,
): boolean {
  return entry.expiresAt <= now + ATTACHMENT_URL_REFRESH_BUFFER_MS;
}

function collectChatMessageAttachments(
  messages: Array<BaseChatMessageUnion>,
): ChatFileAttachment[] {
  const attachmentsById = new Map<string, ChatFileAttachment>();
  for (const message of messages) {
    const attachments =
      "attachments" in message && Array.isArray(message.attachments)
        ? message.attachments
        : [];
    for (const attachment of attachments) {
      if (!attachmentsById.has(attachment.id)) {
        attachmentsById.set(attachment.id, attachment);
      }
    }
  }
  return Array.from(attachmentsById.values());
}

function shouldRequestAttachmentUrl({
  attachment,
  attachmentUrlMap,
  force,
  now,
  requestedAttachmentIds,
}: {
  attachment: ChatFileAttachment;
  attachmentUrlMap: Record<string, AttachmentUrlEntry>;
  force?: boolean;
  now: number;
  requestedAttachmentIds: Set<string>;
}): boolean {
  if (force) {
    return true;
  }
  if (requestedAttachmentIds.has(attachment.id)) {
    return false;
  }
  const entry = attachmentUrlMap[attachment.id];
  return !entry || isAttachmentUrlStale(entry, now);
}

function collectPendingAttachments({
  attachmentUrlMap,
  force,
  now,
  requestedAttachmentIds,
  targets,
}: {
  attachmentUrlMap: Record<string, AttachmentUrlEntry>;
  force?: boolean;
  now: number;
  requestedAttachmentIds: Set<string>;
  targets: ChatFileAttachment[];
}): ChatFileAttachment[] {
  return targets.filter((attachment) =>
    shouldRequestAttachmentUrl({
      attachment,
      attachmentUrlMap,
      force,
      now,
      requestedAttachmentIds,
    }),
  );
}

function updateRequestedAttachmentIds(
  requestedAttachmentIds: Set<string>,
  attachments: ChatFileAttachment[],
  isPending: boolean,
): void {
  for (const attachment of attachments) {
    if (isPending) {
      requestedAttachmentIds.add(attachment.id);
      continue;
    }
    requestedAttachmentIds.delete(attachment.id);
  }
}

async function fetchAttachmentUrlEntries(
  pending: ChatFileAttachment[],
): Promise<HttpapiAttachmentDownloadUrlEntry[]> {
  const projectConfigId = getCurrProjectConfigId();
  try {
    const res = await callOpenAPI(
      getAttachmentDownloadUrls({
        body: {
          artifactIds: pending.map((attachment) => attachment.id),
          projectConfigId,
        },
      } as Parameters<typeof getAttachmentDownloadUrls>[0]),
    );
    if (res200(res)) {
      return res.data ?? [];
    }
    const detail = getErrorDetail(res.data);
    console.warn(
      "Failed to load attachment URLs",
      detail ?? pending.map((attachment) => attachment.id),
    );
  } catch (error) {
    console.warn("Failed to load attachment URLs", error);
  }
  return [];
}

function normalizeAttachmentUrlEntries(
  entries: HttpapiAttachmentDownloadUrlEntry[],
): Record<string, AttachmentUrlEntry> {
  const nextEntries: Record<string, AttachmentUrlEntry> = {};
  for (const entry of entries) {
    if (
      typeof entry.expiresAt !== "number" ||
      !Number.isFinite(entry.expiresAt)
    ) {
      console.error("Attachment URL missing expiresAt", entry);
      continue;
    }
    nextEntries[entry.artifactId] = {
      url: entry.url,
      expiresAt: entry.expiresAt * 1000,
    };
  }
  return nextEntries;
}

export function useChatMessageAttachmentUrls(
  messages: Array<BaseChatMessageUnion>,
): {
  attachmentUrlMap: Record<string, AttachmentUrlEntry>;
  requestAttachmentUrls: (
    targets: ChatFileAttachment[],
    options?: {
      force?: boolean;
    },
  ) => Promise<Record<string, AttachmentUrlEntry>>;
} {
  const [attachmentUrlMap, setAttachmentUrlMap] = useState<
    Record<string, AttachmentUrlEntry>
  >({});
  const attachmentUrlRequests = useRef<Set<string>>(new Set());
  const allAttachments = useMemo(
    () => collectChatMessageAttachments(messages),
    [messages],
  );
  const requestAttachmentUrls = useCallback(
    async (
      targets: ChatFileAttachment[],
      options: {
        force?: boolean;
      } = {},
    ) => {
      if (targets.length === 0) {
        return {};
      }
      const pending = collectPendingAttachments({
        attachmentUrlMap,
        force: options.force,
        now: Date.now(),
        requestedAttachmentIds: attachmentUrlRequests.current,
        targets,
      });
      if (pending.length === 0) {
        return {};
      }
      updateRequestedAttachmentIds(
        attachmentUrlRequests.current,
        pending,
        true,
      );
      try {
        const nextEntries = normalizeAttachmentUrlEntries(
          await fetchAttachmentUrlEntries(pending),
        );
        if (Object.keys(nextEntries).length > 0) {
          setAttachmentUrlMap((prev) => ({ ...prev, ...nextEntries }));
        }
        return nextEntries;
      } finally {
        updateRequestedAttachmentIds(
          attachmentUrlRequests.current,
          pending,
          false,
        );
      }
    },
    [attachmentUrlMap],
  );
  useEffect(() => {
    if (allAttachments.length === 0) {
      return;
    }
    void requestAttachmentUrls(allAttachments);
  }, [allAttachments, requestAttachmentUrls]);
  return {
    attachmentUrlMap,
    requestAttachmentUrls,
  };
}
