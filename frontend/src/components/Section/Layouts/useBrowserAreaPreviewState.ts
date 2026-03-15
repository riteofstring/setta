import _ from "lodash";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import { route_get_file_browser_download_urls } from "utils/generatedEndpoints";
import {
  BrowserAreaViewMode,
  BrowserAreaViewModeEnum,
  FolderContentItem,
} from "utils/generatedTypes";
import {
  type FileTextPreview,
  type FileUrlEntry,
  FILE_URL_REQUEST_CHUNK_SIZE,
  getBrowserPreviewKind,
  isFileUrlStale,
  TEXT_PREVIEW_CHAR_LIMIT,
  TEXT_PREVIEW_MAX_BYTES,
} from "./browserAreaPreviewModel";

export function useBrowserAreaPreviewState({
  filteredVisibleItems,
  viewMode,
}: {
  filteredVisibleItems: Array<FolderContentItem>;
  viewMode: BrowserAreaViewMode;
}) {
  const [fileUrlMap, setFileUrlMap] = useState<Record<string, FileUrlEntry>>(
    {},
  );
  const fileUrlMapRef = useRef<Record<string, FileUrlEntry>>({});
  const fileUrlRequests = useRef<Set<string>>(new Set());
  const fileUrlPromiseResolvers = useRef<
    Map<string, (entry: FileUrlEntry | null) => void>
  >(new Map());
  const fileUrlPromises = useRef<Map<string, Promise<FileUrlEntry | null>>>(
    new Map(),
  );
  const [selectedCarouselId, setSelectedCarouselId] = useState<string | null>(
    null,
  );
  const [textPreviewMap, setTextPreviewMap] = useState<
    Record<string, FileTextPreview>
  >({});
  const selectedCarouselItem = useMemo(() => {
    if (!selectedCarouselId) {
      return null;
    }
    return (
      filteredVisibleItems.find(
        (item) => item.fullPath === selectedCarouselId,
      ) ?? null
    );
  }, [filteredVisibleItems, selectedCarouselId]);

  useEffect(() => {
    fileUrlMapRef.current = fileUrlMap;
  }, [fileUrlMap]);

  const ensureFileUrlPromise = useCallback((path: string) => {
    const existing = fileUrlPromises.current.get(path);
    if (existing) {
      return existing;
    }
    let resolvePromise: (entry: FileUrlEntry | null) => void = () => undefined;
    const promise = new Promise<FileUrlEntry | null>((resolve) => {
      resolvePromise = resolve;
    });
    fileUrlPromises.current.set(path, promise);
    fileUrlPromiseResolvers.current.set(path, resolvePromise);
    return promise;
  }, []);

  const settleFileUrlPromises = useCallback(
    (paths: string[], entries: Record<string, FileUrlEntry>) => {
      for (const path of paths) {
        const resolver = fileUrlPromiseResolvers.current.get(path);
        if (!resolver) {
          continue;
        }
        resolver(entries[path] ?? null);
        fileUrlPromiseResolvers.current.delete(path);
        fileUrlPromises.current.delete(path);
      }
    },
    [],
  );

  const requestFileUrls = useCallback(
    async (paths: string[], options: { force?: boolean } = {}) => {
      if (paths.length === 0) {
        return {};
      }
      const now = Date.now();
      const currentMap = fileUrlMapRef.current;
      const pending = paths.filter((path) => {
        const entry = currentMap[path];
        if (!options.force && entry && !isFileUrlStale(entry, now)) {
          return false;
        }
        if (fileUrlRequests.current.has(path)) {
          return false;
        }
        return true;
      });
      if (pending.length === 0) {
        return {};
      }
      for (const path of pending) {
        fileUrlRequests.current.add(path);
        ensureFileUrlPromise(path);
      }
      const aggregated: Record<string, FileUrlEntry> = {};
      const chunks = _.chunk(pending, FILE_URL_REQUEST_CHUNK_SIZE);
      for (const chunk of chunks) {
        const res = await route_get_file_browser_download_urls({
          paths: chunk,
        });
        for (const path of chunk) {
          fileUrlRequests.current.delete(path);
        }
        if (!res200(res)) {
          const detail = getErrorDetail(res.data);
          console.warn("Failed to load file preview URLs", detail ?? chunk);
          settleFileUrlPromises(chunk, {});
          continue;
        }
        const nextEntries: Record<string, FileUrlEntry> = {};
        for (const entry of res.data) {
          nextEntries[entry.path] = {
            url: entry.url,
            expiresAt: entry.expiresAt,
          };
        }
        Object.assign(aggregated, nextEntries);
        settleFileUrlPromises(chunk, nextEntries);
      }
      if (Object.keys(aggregated).length > 0) {
        setFileUrlMap((prev) => ({ ...prev, ...aggregated }));
      }
      return aggregated;
    },
    [ensureFileUrlPromise, settleFileUrlPromises],
  );

  const getFileUrlEntry = useCallback(
    async (path: string, options: { force?: boolean } = {}) => {
      const now = Date.now();
      const existing = fileUrlMapRef.current[path];
      if (!options.force && existing && !isFileUrlStale(existing, now)) {
        return existing;
      }
      const pendingPromise = fileUrlPromises.current.get(path);
      if (pendingPromise) {
        const resolved = await pendingPromise;
        if (resolved && !isFileUrlStale(resolved, Date.now())) {
          return resolved;
        }
      }
      const refreshed = await requestFileUrls([path], { force: true });
      return refreshed[path] ?? fileUrlMapRef.current[path] ?? null;
    },
    [requestFileUrls],
  );

  const requestTextPreview = useCallback(
    async (item: FolderContentItem) => {
      if (item.size && item.size > TEXT_PREVIEW_MAX_BYTES) {
        setTextPreviewMap((prev) => ({
          ...prev,
          [item.fullPath]: {
            text: "",
            truncated: false,
            isLoading: false,
            error: "Preview disabled for large files.",
          },
        }));
        return;
      }
      const existing = textPreviewMap[item.fullPath];
      if (existing && (existing.isLoading || existing.text || existing.error)) {
        return;
      }
      setTextPreviewMap((prev) => ({
        ...prev,
        [item.fullPath]: {
          text: "",
          truncated: false,
          isLoading: true,
          error: null,
        },
      }));
      const entry = await getFileUrlEntry(item.fullPath, { force: true });
      if (!entry?.url) {
        setTextPreviewMap((prev) => ({
          ...prev,
          [item.fullPath]: {
            text: "",
            truncated: false,
            isLoading: false,
            error: "Preview unavailable.",
          },
        }));
        return;
      }
      let response: Response;
      try {
        response = await fetch(entry.url);
      } catch {
        setTextPreviewMap((prev) => ({
          ...prev,
          [item.fullPath]: {
            text: "",
            truncated: false,
            isLoading: false,
            error: "Preview unavailable.",
          },
        }));
        return;
      }
      if (!response.ok) {
        setTextPreviewMap((prev) => ({
          ...prev,
          [item.fullPath]: {
            text: "",
            truncated: false,
            isLoading: false,
            error: "Preview unavailable.",
          },
        }));
        return;
      }
      const text = await response.text();
      const truncated = text.length > TEXT_PREVIEW_CHAR_LIMIT;
      const previewText = truncated
        ? text.slice(0, TEXT_PREVIEW_CHAR_LIMIT)
        : text;
      setTextPreviewMap((prev) => ({
        ...prev,
        [item.fullPath]: {
          text: previewText,
          truncated,
          isLoading: false,
          error: null,
        },
      }));
    },
    [getFileUrlEntry, textPreviewMap],
  );

  useEffect(() => {
    if (viewMode !== BrowserAreaViewModeEnum.carousel) {
      setSelectedCarouselId(null);
      return;
    }
    if (filteredVisibleItems.length === 0) {
      setSelectedCarouselId(null);
      return;
    }
    if (
      selectedCarouselId &&
      filteredVisibleItems.some((item) => item.fullPath === selectedCarouselId)
    ) {
      return;
    }
    const preferred =
      filteredVisibleItems.find(
        (item) => getBrowserPreviewKind(item) === "image",
      ) ?? filteredVisibleItems[0];
    if (preferred) {
      setSelectedCarouselId(preferred.fullPath);
    }
  }, [filteredVisibleItems, selectedCarouselId, viewMode]);

  useEffect(() => {
    if (viewMode === BrowserAreaViewModeEnum.list) {
      return;
    }
    const imagePaths = filteredVisibleItems
      .filter((item) => item.type.toLowerCase() === "file")
      .filter((item) => getBrowserPreviewKind(item) === "image")
      .map((item) => item.fullPath);
    if (imagePaths.length === 0) {
      return;
    }
    void requestFileUrls(imagePaths);
  }, [filteredVisibleItems, requestFileUrls, viewMode]);

  useEffect(() => {
    if (viewMode !== BrowserAreaViewModeEnum.carousel) {
      return;
    }
    if (!selectedCarouselItem) {
      return;
    }
    if (getBrowserPreviewKind(selectedCarouselItem) !== "text") {
      return;
    }
    void requestTextPreview(selectedCarouselItem);
  }, [requestTextPreview, selectedCarouselItem, viewMode]);

  return {
    fileUrlMap,
    getFileUrlEntry,
    selectedCarouselId,
    setSelectedCarouselId,
    textPreviewMap,
  };
}
