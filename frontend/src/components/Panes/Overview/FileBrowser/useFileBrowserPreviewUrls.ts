import {
  callOpenAPI,
  getErrorDetail,
  res200,
  type ResponseDataAndStatus,
} from "@setta/app-subsystem-frontend-sdk";
import {
  getFileBrowserDownloadUrls,
  type FilebrowserFileBrowserDownloadUrlEntry,
} from "openapi/http";
import { useCallback, useRef, useState } from "react";
import { getAttachmentPreviewKind } from "utils/attachmentPreview";
import {
  FILE_URL_REFRESH_BUFFER_MS,
  type FileUrlEntry,
  type FlattenedNode,
} from "./fileBrowserPaneShared";
import { useSyncedRef } from "./useSyncedRef";

type FileBrowserDownloadURLsRouteResponse = ResponseDataAndStatus<
  Array<FilebrowserFileBrowserDownloadUrlEntry>
>;

export function collectVisibleImagePreviewPaths(args: {
  displayedItems: FlattenedNode[];
  startIndex: number;
  stopIndex: number;
}): string[] {
  if (args.displayedItems.length === 0) {
    return [];
  }
  const start = Math.max(0, args.startIndex);
  const stop = Math.min(args.displayedItems.length - 1, args.stopIndex);
  if (start > stop) {
    return [];
  }
  const needed: string[] = [];
  for (let index = start; index <= stop; index += 1) {
    const entry = args.displayedItems[index];
    if (!entry || entry.type === "folder") {
      continue;
    }
    if (
      getAttachmentPreviewKind({
        id: entry.fullPath,
        name: entry.name,
        mimeType: null,
        size: null,
      }) === "image"
    ) {
      needed.push(entry.fullPath);
    }
  }
  return needed;
}

export function useFileBrowserPreviewUrls() {
  const [fileUrlMap, setFileUrlMap] = useState<Record<string, FileUrlEntry>>(
    {},
  );
  const fileUrlMapRef = useSyncedRef(fileUrlMap);
  const fileUrlRequests = useRef<Set<string>>(new Set());

  const requestFileUrls = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) {
        return;
      }
      const now = Date.now();
      const pending = paths.filter((path) => {
        const existing = fileUrlMapRef.current[path];
        if (
          existing &&
          existing.expiresAt * 1000 - FILE_URL_REFRESH_BUFFER_MS > now
        ) {
          return false;
        }
        return !fileUrlRequests.current.has(path);
      });
      if (pending.length === 0) {
        return;
      }
      for (const path of pending) {
        fileUrlRequests.current.add(path);
      }
      const res = (await callOpenAPI(
        getFileBrowserDownloadUrls({
          body: { paths: pending },
        } as Parameters<typeof getFileBrowserDownloadUrls>[0]),
      )) as FileBrowserDownloadURLsRouteResponse;
      for (const path of pending) {
        fileUrlRequests.current.delete(path);
      }
      if (!res200(res)) {
        console.warn(
          "Failed to load file preview URLs",
          getErrorDetail(res.data) ?? pending,
        );
        return;
      }
      setFileUrlMap((prev) => ({
        ...prev,
        ...Object.fromEntries(
          res.data.map((entry) => [
            entry.path,
            { url: entry.url, expiresAt: entry.expiresAt },
          ]),
        ),
      }));
    },
    [fileUrlMapRef, fileUrlRequests],
  );

  return { fileUrlMap, requestFileUrls };
}
