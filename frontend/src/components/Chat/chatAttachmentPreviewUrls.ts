import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import { route_get_attachment_download_urls } from "utils/generatedEndpoints";
import type {
  BaseChatMessageUnion,
  ChatFileAttachment,
} from "utils/generatedTypes";

const ATTACHMENT_URL_REFRESH_BUFFER_MS = 30_000;

export type ChatAttachmentUrlEntry = {
  url: string;
  expiresAt: number;
};

export type ChatAttachmentUrlMap = Record<string, ChatAttachmentUrlEntry>;

export type RequestChatAttachmentUrls = (
  targets: ChatFileAttachment[],
  options?: { force?: boolean },
) => Promise<ChatAttachmentUrlMap>;

type AttachmentUrlResponseEntry = {
  artifactId: string;
  url: string;
  expiresAt: number;
};

export function isChatAttachmentUrlStale(
  entry: ChatAttachmentUrlEntry,
  now: number,
): boolean {
  return entry.expiresAt <= now + ATTACHMENT_URL_REFRESH_BUFFER_MS;
}

export function collectChatMessageAttachments(
  messages: Array<BaseChatMessageUnion>,
): ChatFileAttachment[] {
  const map = new Map<string, ChatFileAttachment>();
  for (const message of messages) {
    const attachments =
      "attachments" in message && Array.isArray(message.attachments)
        ? message.attachments
        : [];
    for (const attachment of attachments) {
      if (!map.has(attachment.id)) {
        map.set(attachment.id, attachment);
      }
    }
  }
  return Array.from(map.values());
}

export function useChatAttachmentPreviewUrls(
  messages: Array<BaseChatMessageUnion>,
): {
  attachmentUrlMap: ChatAttachmentUrlMap;
  requestAttachmentUrls: RequestChatAttachmentUrls;
} {
  const [attachmentUrlMap, setAttachmentUrlMap] =
    useState<ChatAttachmentUrlMap>({});
  const attachmentUrlMapRef = useRef<ChatAttachmentUrlMap>({});
  const attachmentUrlRequests = useRef<Set<string>>(new Set());
  const allAttachments = useMemo(
    () => collectChatMessageAttachments(messages),
    [messages],
  );

  useEffect(() => {
    attachmentUrlMapRef.current = attachmentUrlMap;
  }, [attachmentUrlMap]);

  const requestAttachmentUrls = useCallback<RequestChatAttachmentUrls>(
    async (targets, options = {}) => {
      if (targets.length === 0) {
        return {};
      }
      const now = Date.now();
      const currentAttachmentUrls = attachmentUrlMapRef.current;
      const pending = targets.filter((attachment) => {
        const entry = currentAttachmentUrls[attachment.id];
        if (!options.force && entry && !isChatAttachmentUrlStale(entry, now)) {
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
      let entries: AttachmentUrlResponseEntry[] = [];
      try {
        const res = await route_get_attachment_download_urls({
          artifactIds: pending.map((attachment) => attachment.id),
          projectConfigId,
        });
        if (!res200(res)) {
          const detail = getErrorDetail(res.data);
          console.warn(
            "Failed to load attachment URLs",
            detail ?? pending.map((attachment) => attachment.id),
          );
          return {};
        }
        entries = res.data;
      } catch (error) {
        console.warn("Failed to load attachment URLs", error);
        return {};
      } finally {
        for (const attachment of pending) {
          attachmentUrlRequests.current.delete(attachment.id);
        }
      }

      const nextEntries: ChatAttachmentUrlMap = {};
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
        setAttachmentUrlMap((prev) => {
          const mergedEntries = { ...prev, ...nextEntries };
          attachmentUrlMapRef.current = mergedEntries;
          return mergedEntries;
        });
      }

      return nextEntries;
    },
    [],
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
