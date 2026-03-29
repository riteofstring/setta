import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { FiArchive, FiFileText, FiMusic } from "react-icons/fi";
import { IoImageOutline, IoVideocam } from "react-icons/io5";
import { getAttachmentPreviewKind } from "utils/attachmentPreview";
import {
  getErrorDetail,
  res200,
  type ResponseDataAndStatus,
} from "utils/endpointUtils";
import {
  route_binary_download,
  route_get_file_browser_download_urls,
  route_get_file_browser_file_content,
} from "utils/generatedEndpoints";
import {
  BinaryDownloadResponse,
  FileBrowserFileContentResponse,
  GetFileBrowserDownloadURLsResponse,
} from "utils/generatedTypes";
import { isSpreadsheetPath } from "utils/spreadsheet";
import type { FileNode } from "./FileBrowserPane";

const LazyFileBrowserSpreadsheetEditor = lazy(async () => {
  const module = await import("./FileBrowserSpreadsheetEditor");
  return { default: module.FileBrowserSpreadsheetEditor };
});

const TEXT_PREVIEW_CHAR_LIMIT = 4_000;
const TEXT_PREVIEW_MAX_BYTES = 1024 * 1024;

type FileBrowserDownloadURLsRouteResponse =
  ResponseDataAndStatus<GetFileBrowserDownloadURLsResponse>;
type FileBrowserFileContentRouteResponse =
  ResponseDataAndStatus<FileBrowserFileContentResponse>;
type BinaryDownloadRouteResponse =
  ResponseDataAndStatus<BinaryDownloadResponse>;

export function resolveFileBrowserPreviewKind({
  filePath,
  fileName,
}: {
  filePath: string;
  fileName: string;
}): ReturnType<typeof getAttachmentPreviewKind> | "spreadsheet" {
  if (isSpreadsheetPath(filePath)) {
    return "spreadsheet";
  }
  return getAttachmentPreviewKind({
    id: filePath,
    name: fileName,
    mimeType: null,
    size: null,
  });
}

export function isFileBrowserPreviewRequestStale(args: {
  activeRequestId: number;
  requestId: number;
  currentSelectedPath: string | null;
  requestedPath: string;
}): boolean {
  return (
    args.activeRequestId !== args.requestId ||
    args.currentSelectedPath !== args.requestedPath
  );
}

export function FileBrowserUniversalPreview({
  selectedNode,
}: {
  selectedNode: FileNode | null;
}) {
  const selectedFilePath =
    selectedNode && selectedNode.type === "file" ? selectedNode.fullPath : null;
  const selectedFileName =
    selectedNode && selectedNode.type === "file" ? selectedNode.name : null;
  const selectedFile =
    selectedFilePath && selectedFileName
      ? {
          name: selectedFileName,
          fullPath: selectedFilePath,
        }
      : null;
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [isUrlLoading, setIsUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [textPreview, setTextPreview] = useState<{
    text: string;
    truncated: boolean;
    isLoading: boolean;
    error: string | null;
  }>({
    text: "",
    truncated: false,
    isLoading: false,
    error: null,
  });
  const selectedFilePathRef = useRef<string | null>(selectedFilePath);
  const textPreviewRequestIdRef = useRef(0);

  const previewKind = useMemo(() => {
    if (!selectedFilePath || !selectedFileName) {
      return null;
    }
    return resolveFileBrowserPreviewKind({
      filePath: selectedFilePath,
      fileName: selectedFileName,
    });
  }, [selectedFileName, selectedFilePath]);

  useEffect(() => {
    selectedFilePathRef.current = selectedFilePath;
  }, [selectedFilePath]);

  useEffect(() => {
    setFileUrl(null);
    setIsUrlLoading(false);
    setUrlError(null);
    setTextPreview({
      text: "",
      truncated: false,
      isLoading: false,
      error: null,
    });
  }, [selectedFilePath]);

  useEffect(() => {
    if (!selectedFilePath) {
      return;
    }
    if (
      previewKind !== "image" &&
      previewKind !== "pdf" &&
      previewKind !== "audio" &&
      previewKind !== "video"
    ) {
      return;
    }
    let isMounted = true;
    setIsUrlLoading(true);
    setUrlError(null);
    const loadUrl = async () => {
      try {
        const response: FileBrowserDownloadURLsRouteResponse =
          await route_get_file_browser_download_urls({
            paths: [selectedFilePath],
          });
        if (!isMounted) {
          return;
        }
        if (!res200(response)) {
          setUrlError(getErrorDetail(response.data) ?? "Preview unavailable.");
          setIsUrlLoading(false);
          return;
        }
        const entry = response.data.find((x) => x.path === selectedFilePath);
        if (!entry) {
          setUrlError("Preview unavailable.");
          setIsUrlLoading(false);
          return;
        }
        setFileUrl(entry.url);
        setIsUrlLoading(false);
      } catch {
        if (!isMounted) {
          return;
        }
        setUrlError("Preview unavailable.");
        setIsUrlLoading(false);
      }
    };
    void loadUrl();
    return () => {
      isMounted = false;
    };
  }, [previewKind, selectedFilePath]);

  useEffect(() => {
    if (!selectedFilePath || previewKind !== "text") {
      return;
    }
    const requestId = textPreviewRequestIdRef.current + 1;
    textPreviewRequestIdRef.current = requestId;
    const requestedPath = selectedFilePath;
    const isStaleRequest = () =>
      isFileBrowserPreviewRequestStale({
        activeRequestId: textPreviewRequestIdRef.current,
        requestId,
        currentSelectedPath: selectedFilePathRef.current,
        requestedPath,
      });
    let isMounted = true;
    setTextPreview({
      text: "",
      truncated: false,
      isLoading: true,
      error: null,
    });
    const loadText = async () => {
      try {
        const response: FileBrowserFileContentRouteResponse =
          await route_get_file_browser_file_content({
            path: selectedFilePath,
            maxBytes: TEXT_PREVIEW_MAX_BYTES,
          });
        if (!isMounted || isStaleRequest()) {
          return;
        }
        if (!res200(response)) {
          setTextPreview({
            text: "",
            truncated: false,
            isLoading: false,
            error: getErrorDetail(response.data) ?? "Preview unavailable.",
          });
          return;
        }
        const binaryResponse: BinaryDownloadRouteResponse =
          await route_binary_download({
            contentId: response.data.contentId,
          });
        if (!isMounted || isStaleRequest()) {
          return;
        }
        if (!res200(binaryResponse) || !binaryResponse.data) {
          setTextPreview({
            text: "",
            truncated: false,
            isLoading: false,
            error:
              getErrorDetail(binaryResponse.data) ?? "Preview unavailable.",
          });
          return;
        }
        const text = new TextDecoder().decode(binaryResponse.data);
        const truncated = text.length > TEXT_PREVIEW_CHAR_LIMIT;
        if (!isMounted || isStaleRequest()) {
          return;
        }
        setTextPreview({
          text: truncated ? text.slice(0, TEXT_PREVIEW_CHAR_LIMIT) : text,
          truncated,
          isLoading: false,
          error: null,
        });
      } catch {
        if (!isMounted || isStaleRequest()) {
          return;
        }
        setTextPreview({
          text: "",
          truncated: false,
          isLoading: false,
          error: "Preview unavailable.",
        });
      }
    };
    void loadText();
    return () => {
      isMounted = false;
    };
  }, [previewKind, selectedFilePath]);

  if (!selectedNode) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center rounded-lg border border-dashed border-setta-300 bg-white/60 px-4 text-center text-xs text-setta-500 dark:border-setta-700 dark:bg-setta-950/40 dark:text-setta-400">
        Select a file to preview.
      </div>
    );
  }

  if (selectedNode.type === "folder") {
    return (
      <div className="flex h-full min-h-0 items-center justify-center rounded-lg border border-dashed border-setta-300 bg-white/60 px-4 text-center text-xs text-setta-500 dark:border-setta-700 dark:bg-setta-950/40 dark:text-setta-400">
        Folder selected. Choose a file to preview.
      </div>
    );
  }

  if (!selectedFile || !previewKind) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center rounded-lg border border-dashed border-setta-300 bg-white/60 px-4 text-center text-xs text-setta-500 dark:border-setta-700 dark:bg-setta-950/40 dark:text-setta-400">
        Preview unavailable.
      </div>
    );
  }

  if (previewKind === "spreadsheet") {
    return (
      <div
        data-testid="file-browser-universal-preview"
        className="h-full min-h-0"
      >
        <Suspense
          fallback={
            <div className="flex h-full min-h-0 items-center justify-center rounded-lg border border-setta-200 bg-white/70 text-xs text-setta-500 dark:border-setta-800 dark:bg-setta-950/50 dark:text-setta-400">
              Loading spreadsheet...
            </div>
          }
        >
          <LazyFileBrowserSpreadsheetEditor selectedFile={selectedFile} />
        </Suspense>
      </div>
    );
  }

  if (previewKind === "text") {
    if (textPreview.isLoading) {
      return (
        <div className="flex h-full min-h-0 items-center justify-center rounded-lg border border-setta-200 bg-white/70 text-xs text-setta-500 dark:border-setta-800 dark:bg-setta-950/50 dark:text-setta-400">
          Loading preview…
        </div>
      );
    }
    if (textPreview.error) {
      return (
        <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 rounded-lg border border-setta-200 bg-white/70 px-4 text-center text-xs text-setta-500 dark:border-setta-800 dark:bg-setta-950/50 dark:text-setta-400">
          <FiFileText size={22} />
          <span>{textPreview.error}</span>
        </div>
      );
    }
    return (
      <div
        data-testid="file-browser-universal-preview-text"
        className="flex h-full min-h-0 flex-col rounded-lg border border-setta-200 bg-white/70 dark:border-setta-800 dark:bg-setta-950/50"
      >
        <div className="border-b border-setta-200 px-3 py-2 text-xs font-semibold text-setta-700 dark:border-setta-800 dark:text-setta-200">
          {selectedFile.name}
        </div>
        <pre className="min-h-0 flex-1 overflow-auto p-3 text-xs leading-relaxed text-setta-700 dark:text-setta-200">
          {textPreview.text}
        </pre>
        {textPreview.truncated ? (
          <div className="border-t border-setta-200 px-3 py-1 text-[11px] text-setta-500 dark:border-setta-800 dark:text-setta-400">
            Preview truncated.
          </div>
        ) : null}
      </div>
    );
  }

  if (previewKind === "archive") {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 rounded-lg border border-setta-200 bg-white/70 px-4 text-center text-xs text-setta-500 dark:border-setta-800 dark:bg-setta-950/50 dark:text-setta-400">
        <FiArchive size={22} />
        <span>Archive preview not available.</span>
      </div>
    );
  }

  if (previewKind === "other") {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 rounded-lg border border-setta-200 bg-white/70 px-4 text-center text-xs text-setta-500 dark:border-setta-800 dark:bg-setta-950/50 dark:text-setta-400">
        <FiFileText size={22} />
        <span>Preview not available.</span>
      </div>
    );
  }

  if (isUrlLoading) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center rounded-lg border border-setta-200 bg-white/70 text-xs text-setta-500 dark:border-setta-800 dark:bg-setta-950/50 dark:text-setta-400">
        Loading preview…
      </div>
    );
  }

  if (urlError || !fileUrl) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 rounded-lg border border-setta-200 bg-white/70 px-4 text-center text-xs text-setta-500 dark:border-setta-800 dark:bg-setta-950/50 dark:text-setta-400">
        {previewKind === "image" && <IoImageOutline size={22} />}
        {previewKind === "audio" && <FiMusic size={22} />}
        {previewKind === "video" && <IoVideocam size={22} />}
        {previewKind === "pdf" && <FiFileText size={22} />}
        <span>{urlError ?? "Preview unavailable."}</span>
      </div>
    );
  }

  if (previewKind === "image") {
    return (
      <div
        data-testid="file-browser-universal-preview-image"
        className="h-full min-h-0 overflow-hidden rounded-lg border border-setta-200 bg-white/70 dark:border-setta-800 dark:bg-setta-950/50"
      >
        <img
          src={fileUrl}
          alt={selectedFile.name}
          className="h-full w-full object-contain"
        />
      </div>
    );
  }

  if (previewKind === "pdf") {
    return (
      <div
        data-testid="file-browser-universal-preview-pdf"
        className="h-full min-h-0 overflow-hidden rounded-lg border border-setta-200 bg-white/70 dark:border-setta-800 dark:bg-setta-950/50"
      >
        <iframe
          src={fileUrl}
          title={selectedFile.name}
          className="h-full w-full"
        />
      </div>
    );
  }

  if (previewKind === "audio") {
    return (
      <div
        data-testid="file-browser-universal-preview-audio"
        className="flex h-full min-h-0 items-center justify-center rounded-lg border border-setta-200 bg-white/70 px-3 dark:border-setta-800 dark:bg-setta-950/50"
      >
        <audio controls preload="metadata" className="w-full">
          <source src={fileUrl} />
        </audio>
      </div>
    );
  }

  if (previewKind === "video") {
    return (
      <div
        data-testid="file-browser-universal-preview-video"
        className="h-full min-h-0 overflow-hidden rounded-lg border border-setta-200 bg-white/70 dark:border-setta-800 dark:bg-setta-950/50"
      >
        <video controls preload="metadata" className="h-full w-full">
          <source src={fileUrl} />
        </video>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 items-center justify-center rounded-lg border border-dashed border-setta-300 bg-white/60 px-4 text-center text-xs text-setta-500 dark:border-setta-700 dark:bg-setta-950/40 dark:text-setta-400">
      Preview unavailable.
    </div>
  );
}
