import {
  getAttachmentDownloadUrls,
  type HttpapiAttachmentDownloadUrlEntry,
} from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import { BaseChatMessageUnion, ChatFileAttachment } from "utils/generatedTypes";

const ATTACHMENT_URL_REFRESH_BUFFER_MS = 30_000;

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

export function useChatMessageAttachmentUrls(
  messages: Array<BaseChatMessageUnion>,
): {
  attachmentUrlMap: Record<string, AttachmentUrlEntry>;
  requestAttachmentUrls: (
    targets: ChatFileAttachment[],
    options?: { force?: boolean },
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
      options: { force?: boolean } = {},
    ) => {
      if (targets.length === 0) {
        return {};
      }
      const now = Date.now();
      const pending = targets.filter((attachment) => {
        const entry = attachmentUrlMap[attachment.id];
        if (!options.force && entry && !isAttachmentUrlStale(entry, now)) {
          return false;
        }
        if (
          attachmentUrlRequests.current.has(attachment.id) &&
          !options.force
        ) {
          return false;
        }
        return true;
      });
      if (pending.length === 0) {
        return {};
      }
      for (const attachment of pending) {
        attachmentUrlRequests.current.add(attachment.id);
      }
      const projectConfigId = getCurrProjectConfigId();
      let entries: HttpapiAttachmentDownloadUrlEntry[] = [];
      try {
        const res = await callOpenAPI(
          getAttachmentDownloadUrls({
            body: {
              artifactIds: pending.map((attachment) => attachment.id),
              projectConfigId,
            },
          }),
        );
        if (!res200(res)) {
          const detail = getErrorDetail(res.data);
          console.warn(
            "Failed to load attachment URLs",
            detail ?? pending.map((attachment) => attachment.id),
          );
          return {};
        }
        entries = res.data ?? [];
      } catch (error) {
        console.warn("Failed to load attachment URLs", error);
        return {};
      } finally {
        for (const attachment of pending) {
          attachmentUrlRequests.current.delete(attachment.id);
        }
      }
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
      if (Object.keys(nextEntries).length > 0) {
        setAttachmentUrlMap((prev) => ({ ...prev, ...nextEntries }));
      }
      return nextEntries;
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
