import {
  callOpenAPI,
  getErrorDetail,
  res200,
  type ResponseDataAndStatus,
} from "@setta/app-subsystem-frontend-sdk";
import {
  downloadBinary,
  getFileBrowserDownloadUrls,
  getFileBrowserFileContent,
  type FilebrowserFileBrowserDownloadUrlEntry,
  type FilebrowserFileContentResponse,
} from "openapi/http";
import { useEffect, useState } from "react";
import { getAttachmentPreviewKind } from "utils/attachmentPreview";
import { isSpreadsheetPath } from "utils/spreadsheet";

const TEXT_PREVIEW_CHAR_LIMIT = 4000;
const TEXT_PREVIEW_MAX_BYTES = 1024 * 1024;

type FileBrowserDownloadURLsRouteResponse = ResponseDataAndStatus<
  Array<FilebrowserFileBrowserDownloadUrlEntry>
>;
type FileBrowserFileContentRouteResponse =
  ResponseDataAndStatus<FilebrowserFileContentResponse>;
type BinaryDownloadRouteResponse = ResponseDataAndStatus<Blob | File>;

export type SelectedPreviewFile = {
  name: string;
  fullPath: string;
};

type FileBrowserPreviewKind =
  | ReturnType<typeof getAttachmentPreviewKind>
  | "spreadsheet";

export type FileBrowserDownloadUrlPreviewKind = Exclude<
  FileBrowserPreviewKind,
  "archive" | "other" | "spreadsheet" | "text"
>;

export type TextPreviewState = {
  text: string;
  truncated: boolean;
  isLoading: boolean;
  error: string | null;
};

function createEmptyTextPreviewState(): TextPreviewState {
  return {
    text: "",
    truncated: false,
    isLoading: false,
    error: null,
  };
}

function createTextPreviewErrorState(error: string): TextPreviewState {
  return {
    text: "",
    truncated: false,
    isLoading: false,
    error,
  };
}

function createLoadingTextPreviewState(): TextPreviewState {
  return {
    text: "",
    truncated: false,
    isLoading: true,
    error: null,
  };
}

export function resolveFileBrowserPreviewKind({
  filePath,
  fileName,
}: {
  filePath: string;
  fileName: string;
}): FileBrowserPreviewKind {
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

export function isFileBrowserDownloadUrlPreviewKind(
  previewKind: FileBrowserPreviewKind | null,
): previewKind is FileBrowserDownloadUrlPreviewKind {
  return (
    previewKind === "audio" ||
    previewKind === "image" ||
    previewKind === "pdf" ||
    previewKind === "video"
  );
}

type DownloadUrlPreviewResult = {
  fileUrl: string | null;
  urlError: string | null;
};

async function loadDownloadUrlPreview(
  selectedFilePath: string,
): Promise<DownloadUrlPreviewResult> {
  try {
    const response = (await callOpenAPI(
      getFileBrowserDownloadUrls({
        body: {
          paths: [selectedFilePath],
        },
      } as Parameters<typeof getFileBrowserDownloadUrls>[0]),
    )) as FileBrowserDownloadURLsRouteResponse;
    if (!res200(response)) {
      return {
        fileUrl: null,
        urlError: getErrorDetail(response.data) ?? "Preview unavailable.",
      };
    }
    const entry = response.data.find(
      (candidate) => candidate.path === selectedFilePath,
    );
    if (!entry) {
      return {
        fileUrl: null,
        urlError: "Preview unavailable.",
      };
    }
    return {
      fileUrl: entry.url,
      urlError: null,
    };
  } catch {
    return {
      fileUrl: null,
      urlError: "Preview unavailable.",
    };
  }
}

async function loadTextPreview(
  selectedFilePath: string,
): Promise<TextPreviewState> {
  try {
    const response = (await callOpenAPI(
      getFileBrowserFileContent({
        body: {
          path: selectedFilePath,
          maxBytes: TEXT_PREVIEW_MAX_BYTES,
        },
      } as Parameters<typeof getFileBrowserFileContent>[0]),
    )) as FileBrowserFileContentRouteResponse;
    if (!res200(response)) {
      return createTextPreviewErrorState(
        getErrorDetail(response.data) ?? "Preview unavailable.",
      );
    }
    const binaryResponse = (await callOpenAPI(
      downloadBinary({
        path: {
          contentId: response.data.contentId,
        },
        parseAs: "blob",
      } as Parameters<typeof downloadBinary>[0]),
    )) as BinaryDownloadRouteResponse;
    if (!res200(binaryResponse) || !binaryResponse.data) {
      return createTextPreviewErrorState(
        getErrorDetail(binaryResponse.data) ?? "Preview unavailable.",
      );
    }
    const text = new TextDecoder().decode(
      await binaryResponse.data.arrayBuffer(),
    );
    const truncated = text.length > TEXT_PREVIEW_CHAR_LIMIT;
    return {
      text: truncated ? text.slice(0, TEXT_PREVIEW_CHAR_LIMIT) : text,
      truncated,
      isLoading: false,
      error: null,
    };
  } catch {
    return createTextPreviewErrorState("Preview unavailable.");
  }
}

export function useFileBrowserPreviewState({
  selectedFilePath,
  previewKind,
}: {
  selectedFilePath: string | null;
  previewKind: FileBrowserPreviewKind | null;
}) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [isUrlLoading, setIsUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [textPreview, setTextPreview] = useState<TextPreviewState>(
    createEmptyTextPreviewState,
  );

  useEffect(() => {
    setFileUrl(null);
    setIsUrlLoading(false);
    setUrlError(null);
    setTextPreview(createEmptyTextPreviewState());
  }, [selectedFilePath]);

  useEffect(() => {
    if (
      !selectedFilePath ||
      !isFileBrowserDownloadUrlPreviewKind(previewKind)
    ) {
      return;
    }
    let cancelled = false;
    setIsUrlLoading(true);
    setUrlError(null);
    void loadDownloadUrlPreview(selectedFilePath).then((result) => {
      if (cancelled) {
        return;
      }
      setFileUrl(result.fileUrl);
      setUrlError(result.urlError);
      setIsUrlLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [previewKind, selectedFilePath]);

  useEffect(() => {
    if (!selectedFilePath || previewKind !== "text") {
      return;
    }
    let cancelled = false;
    setTextPreview(createLoadingTextPreviewState());
    void loadTextPreview(selectedFilePath).then((nextState) => {
      if (cancelled) {
        return;
      }
      setTextPreview(nextState);
    });
    return () => {
      cancelled = true;
    };
  }, [previewKind, selectedFilePath]);

  return {
    fileUrl,
    isUrlLoading,
    textPreview,
    urlError,
  };
}
