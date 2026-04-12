import { Suspense, lazy, type ReactNode } from "react";
import { FiArchive, FiFileText, FiMusic } from "react-icons/fi";
import { IoImageOutline, IoVideocam } from "react-icons/io5";
import type { FileNode } from "./FileBrowserPane";
import {
  isFileBrowserDownloadUrlPreviewKind,
  isFileBrowserPreviewRequestStale,
  resolveFileBrowserPreviewKind,
  useFileBrowserPreviewState,
  type FileBrowserDownloadUrlPreviewKind,
  type SelectedPreviewFile,
  type TextPreviewState,
} from "./fileBrowserUniversalPreviewState";

const LazyFileBrowserSpreadsheetEditor = lazy(async () => {
  const module = await import("./FileBrowserSpreadsheetEditor");
  return { default: module.FileBrowserSpreadsheetEditor };
});

const DASHED_EMPTY_STATE_CLASSNAME =
  "flex h-full min-h-0 items-center justify-center rounded-lg border border-dashed border-setta-300 bg-white/60 px-4 text-center text-xs text-setta-500 dark:border-setta-700 dark:bg-setta-950/40 dark:text-setta-400";
const PANEL_CLASSNAME =
  "rounded-lg border border-setta-200 bg-white/70 dark:border-setta-800 dark:bg-setta-950/50";
const CENTERED_PANEL_CLASSNAME = `flex h-full min-h-0 items-center justify-center ${PANEL_CLASSNAME}`;
const MESSAGE_PANEL_CLASSNAME = `flex h-full min-h-0 flex-col items-center justify-center gap-2 ${PANEL_CLASSNAME} px-4 text-center text-xs text-setta-500 dark:text-setta-400`;

const urlPreviewErrorIcons: Record<
  FileBrowserDownloadUrlPreviewKind,
  ReactNode
> = {
  audio: <FiMusic size={22} />,
  image: <IoImageOutline size={22} />,
  pdf: <FiFileText size={22} />,
  video: <IoVideocam size={22} />,
};

const unavailablePreviewByKind = {
  archive: {
    icon: <FiArchive size={22} />,
    message: "Archive preview not available.",
  },
  other: {
    icon: <FiFileText size={22} />,
    message: "Preview not available.",
  },
} satisfies Record<"archive" | "other", { icon: ReactNode; message: string }>;

function createSelectedPreviewFile(
  selectedNode: Extract<FileNode, { type: "file" }>,
): SelectedPreviewFile {
  return {
    name: selectedNode.name,
    fullPath: selectedNode.fullPath,
  };
}

function PreviewPlaceholder({ message }: { message: string }) {
  return <div className={DASHED_EMPTY_STATE_CLASSNAME}>{message}</div>;
}

function LoadingPreview({ message }: { message: string }) {
  return (
    <div
      className={`${CENTERED_PANEL_CLASSNAME} text-xs text-setta-500 dark:text-setta-400`}
    >
      {message}
    </div>
  );
}

function UnavailablePreview({
  icon,
  message,
}: {
  icon: ReactNode;
  message: string;
}) {
  return (
    <div className={MESSAGE_PANEL_CLASSNAME}>
      {icon}
      <span>{message}</span>
    </div>
  );
}

function SpreadsheetPreview({
  selectedFile,
}: {
  selectedFile: SelectedPreviewFile;
}) {
  return (
    <div
      data-testid="file-browser-universal-preview"
      className="h-full min-h-0"
    >
      <Suspense fallback={<LoadingPreview message="Loading spreadsheet..." />}>
        <LazyFileBrowserSpreadsheetEditor selectedFile={selectedFile} />
      </Suspense>
    </div>
  );
}

function TextFilePreview({
  selectedFile,
  textPreview,
}: {
  selectedFile: SelectedPreviewFile;
  textPreview: TextPreviewState;
}) {
  if (textPreview.isLoading) {
    return <LoadingPreview message="Loading preview…" />;
  }
  if (textPreview.error) {
    return (
      <UnavailablePreview
        icon={<FiFileText size={22} />}
        message={textPreview.error}
      />
    );
  }
  return (
    <div
      data-testid="file-browser-universal-preview-text"
      className={`flex h-full min-h-0 flex-col ${PANEL_CLASSNAME}`}
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

function DownloadUrlPreviewContent({
  previewKind,
  fileUrl,
  selectedFileName,
}: {
  previewKind: FileBrowserDownloadUrlPreviewKind;
  fileUrl: string;
  selectedFileName: string;
}) {
  if (previewKind === "image") {
    return (
      <div
        data-testid="file-browser-universal-preview-image"
        className={`h-full min-h-0 overflow-hidden ${PANEL_CLASSNAME}`}
      >
        <img
          src={fileUrl}
          alt={selectedFileName}
          className="h-full w-full object-contain"
        />
      </div>
    );
  }
  if (previewKind === "pdf") {
    return (
      <div
        data-testid="file-browser-universal-preview-pdf"
        className={`h-full min-h-0 overflow-hidden ${PANEL_CLASSNAME}`}
      >
        <iframe
          src={fileUrl}
          title={selectedFileName}
          className="h-full w-full"
        />
      </div>
    );
  }
  if (previewKind === "audio") {
    return (
      <div
        data-testid="file-browser-universal-preview-audio"
        className={`flex h-full min-h-0 items-center justify-center px-3 ${PANEL_CLASSNAME}`}
      >
        <audio controls preload="metadata" className="w-full">
          <source src={fileUrl} />
        </audio>
      </div>
    );
  }
  return (
    <div
      data-testid="file-browser-universal-preview-video"
      className={`h-full min-h-0 overflow-hidden ${PANEL_CLASSNAME}`}
    >
      <video controls preload="metadata" className="h-full w-full">
        <source src={fileUrl} />
      </video>
    </div>
  );
}

function resolveNonDownloadPreview(args: {
  previewKind: ReturnType<typeof resolveFileBrowserPreviewKind>;
  selectedFile: SelectedPreviewFile;
  textPreview: TextPreviewState;
}): JSX.Element | null {
  if (args.previewKind === "spreadsheet") {
    return <SpreadsheetPreview selectedFile={args.selectedFile} />;
  }
  if (args.previewKind === "text") {
    return (
      <TextFilePreview
        selectedFile={args.selectedFile}
        textPreview={args.textPreview}
      />
    );
  }
  if (args.previewKind === "archive" || args.previewKind === "other") {
    const preview = unavailablePreviewByKind[args.previewKind];
    return <UnavailablePreview icon={preview.icon} message={preview.message} />;
  }
  return null;
}

function DownloadUrlPreviewState(args: {
  fileUrl: string | null;
  isUrlLoading: boolean;
  previewKind: FileBrowserDownloadUrlPreviewKind;
  selectedFileName: string;
  urlError: string | null;
}) {
  if (args.isUrlLoading) {
    return <LoadingPreview message="Loading preview…" />;
  }
  if (args.urlError || !args.fileUrl) {
    return (
      <UnavailablePreview
        icon={urlPreviewErrorIcons[args.previewKind]}
        message={args.urlError ?? "Preview unavailable."}
      />
    );
  }
  return (
    <DownloadUrlPreviewContent
      previewKind={args.previewKind}
      fileUrl={args.fileUrl}
      selectedFileName={args.selectedFileName}
    />
  );
}

function SelectedFilePreview({
  selectedFile,
}: {
  selectedFile: SelectedPreviewFile;
}) {
  const previewKind = resolveFileBrowserPreviewKind({
    filePath: selectedFile.fullPath,
    fileName: selectedFile.name,
  });
  const { fileUrl, isUrlLoading, textPreview, urlError } =
    useFileBrowserPreviewState({
      selectedFilePath: selectedFile.fullPath,
      previewKind,
    });
  const nonDownloadPreview = resolveNonDownloadPreview({
    previewKind,
    selectedFile,
    textPreview,
  });

  if (nonDownloadPreview) {
    return nonDownloadPreview;
  }
  if (!isFileBrowserDownloadUrlPreviewKind(previewKind)) {
    return <PreviewPlaceholder message="Preview unavailable." />;
  }
  return (
    <DownloadUrlPreviewState
      fileUrl={fileUrl}
      isUrlLoading={isUrlLoading}
      previewKind={previewKind}
      selectedFileName={selectedFile.name}
      urlError={urlError}
    />
  );
}

export function FileBrowserUniversalPreview({
  selectedNode,
}: {
  selectedNode: FileNode | null;
}) {
  if (!selectedNode) {
    return <PreviewPlaceholder message="Select a file to preview." />;
  }
  if (selectedNode.type === "folder") {
    return (
      <PreviewPlaceholder message="Folder selected. Choose a file to preview." />
    );
  }
  return (
    <SelectedFilePreview
      selectedFile={createSelectedPreviewFile(selectedNode)}
    />
  );
}

export { isFileBrowserPreviewRequestStale, resolveFileBrowserPreviewKind };
