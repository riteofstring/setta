import * as Dialog from "@radix-ui/react-dialog";
import {
  MediaCarousel,
  type MediaCarouselItem,
} from "components/Utils/MediaCarousel";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { FiArchive, FiFileText, FiMusic, FiVideo } from "react-icons/fi";
import { IoMdClose } from "react-icons/io";
import { IoImageOutline } from "react-icons/io5";
import {
  getAttachmentPreviewKind,
  isImageAttachment,
  isTextAttachment,
} from "utils/attachmentPreview";
import { formatBytes } from "utils/attachments";
import type { ChatFileAttachment } from "utils/generatedTypes";
import {
  isChatAttachmentUrlStale,
  type ChatAttachmentUrlMap,
  type RequestChatAttachmentUrls,
} from "./chatAttachmentPreviewUrls";

const TEXT_PREVIEW_MAX_BYTES = 256 * 1024;
const TEXT_PREVIEW_CHAR_LIMIT = 4_000;
const PDF_PREVIEW_MAX_BYTES = 10 * 1024 * 1024;

type AttachmentTextPreview = {
  text: string;
  truncated: boolean;
  isLoading: boolean;
  error: string | null;
};

export const ChatImage = memo(function ChatImage({
  url,
  className,
  onError,
}: {
  url: string;
  className?: string;
  onError?: () => void;
}) {
  const baseClassName =
    "max-h-64 w-auto max-w-full rounded-md border border-setta-200/70 bg-white";
  const combinedClassName = className
    ? `${baseClassName} ${className}`
    : baseClassName;
  return (
    <img
      src={url}
      alt="Chat attachment"
      className={combinedClassName}
      loading="lazy"
      onError={onError}
    />
  );
});

function getAttachmentSizeLabel(attachment: ChatFileAttachment): string | null {
  if (attachment.size === null || attachment.size === undefined) {
    return null;
  }
  return formatBytes(attachment.size);
}

function AttachmentPreviewDialog({
  open,
  onOpenChange,
  attachments,
  selectedAttachmentId,
  onSelectAttachmentId,
  attachmentUrlMap,
  requestAttachmentUrls,
  onImageError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attachments: ChatFileAttachment[];
  selectedAttachmentId: string | null;
  onSelectAttachmentId: (id: string) => void;
  attachmentUrlMap: ChatAttachmentUrlMap;
  requestAttachmentUrls: RequestChatAttachmentUrls;
  onImageError: (attachment: ChatFileAttachment) => void;
}) {
  const selectedIndex = useMemo(() => {
    if (attachments.length === 0) {
      return -1;
    }
    if (!selectedAttachmentId) {
      return 0;
    }
    const index = attachments.findIndex(
      (attachment) => attachment.id === selectedAttachmentId,
    );
    return index >= 0 ? index : 0;
  }, [attachments, selectedAttachmentId]);
  const selectedAttachment =
    selectedIndex >= 0 ? attachments[selectedIndex] : null;
  const [textPreviewMap, setTextPreviewMap] = useState<
    Record<string, AttachmentTextPreview>
  >({});

  useEffect(() => {
    if (!open || attachments.length === 0) {
      return;
    }
    void requestAttachmentUrls(attachments);
  }, [open, attachments, requestAttachmentUrls]);

  const requestTextPreview = useCallback(
    async (attachment: ChatFileAttachment) => {
      if (!isTextAttachment(attachment)) {
        return;
      }
      const existing = textPreviewMap[attachment.id];
      if (existing) {
        return;
      }
      if (
        attachment.size !== null &&
        attachment.size !== undefined &&
        attachment.size > TEXT_PREVIEW_MAX_BYTES
      ) {
        setTextPreviewMap((prev) => ({
          ...prev,
          [attachment.id]: {
            text: "",
            truncated: true,
            isLoading: false,
            error: "Preview disabled for large files.",
          },
        }));
        return;
      }
      let entry = attachmentUrlMap[attachment.id];
      if (!entry || isChatAttachmentUrlStale(entry, Date.now())) {
        const refreshed = await requestAttachmentUrls([attachment], {
          force: true,
        });
        entry = refreshed[attachment.id] ?? attachmentUrlMap[attachment.id];
      }
      if (!entry) {
        setTextPreviewMap((prev) => ({
          ...prev,
          [attachment.id]: {
            text: "",
            truncated: false,
            isLoading: false,
            error: "Preview unavailable.",
          },
        }));
        return;
      }
      setTextPreviewMap((prev) => ({
        ...prev,
        [attachment.id]: {
          text: "",
          truncated: false,
          isLoading: true,
          error: null,
        },
      }));
      let response: Response;
      try {
        response = await fetch(entry.url);
      } catch {
        setTextPreviewMap((prev) => ({
          ...prev,
          [attachment.id]: {
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
          [attachment.id]: {
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
        [attachment.id]: {
          text: previewText,
          truncated,
          isLoading: false,
          error: null,
        },
      }));
    },
    [attachmentUrlMap, requestAttachmentUrls, textPreviewMap],
  );

  useEffect(() => {
    if (!open || !selectedAttachment) {
      return;
    }
    void requestTextPreview(selectedAttachment);
  }, [open, requestTextPreview, selectedAttachment]);

  const carouselItems = useMemo<Array<MediaCarouselItem<ChatFileAttachment>>>(
    () =>
      attachments.map((attachment) => {
        const attachmentUrl = attachmentUrlMap[attachment.id]?.url ?? null;
        const previewKind = getAttachmentPreviewKind(attachment);
        const shouldShowThumbnail = previewKind === "image";
        return {
          id: attachment.id,
          label: attachment.name,
          thumbnailUrl: shouldShowThumbnail ? attachmentUrl : null,
          imageUrl: shouldShowThumbnail ? attachmentUrl : null,
          data: attachment,
        };
      }),
    [attachments, attachmentUrlMap],
  );

  const renderFileCard = useCallback(
    (attachment: ChatFileAttachment, icon: ReactNode, description?: string) => {
      const sizeLabel = getAttachmentSizeLabel(attachment);
      return (
        <div className="flex flex-col items-center gap-2 text-sm text-setta-500 dark:text-setta-300">
          <div className="text-setta-400 dark:text-setta-500">{icon}</div>
          <span className="max-w-[70%] truncate text-center text-setta-700 dark:text-setta-200">
            {attachment.name}
          </span>
          {description ? (
            <span className="text-xs text-setta-400 dark:text-setta-500">
              {description}
            </span>
          ) : null}
          {sizeLabel ? (
            <span className="text-xs text-setta-400 dark:text-setta-500">
              {sizeLabel}
            </span>
          ) : null}
        </div>
      );
    },
    [],
  );

  const renderAttachmentPreview = useCallback(
    (item: MediaCarouselItem<ChatFileAttachment>) => {
      const attachment = item.data;
      if (!attachment) {
        return (
          <div className="flex flex-col items-center gap-2 text-sm text-setta-400 dark:text-setta-500">
            <IoImageOutline size={40} />
            <span>Loading preview...</span>
          </div>
        );
      }
      const previewKind = getAttachmentPreviewKind(attachment);
      const attachmentUrl = attachmentUrlMap[attachment.id]?.url ?? "";
      if (previewKind === "image") {
        if (!attachmentUrl) {
          return (
            <div className="flex flex-col items-center gap-2 text-sm text-setta-400 dark:text-setta-500">
              <IoImageOutline size={40} />
              <span>Loading preview...</span>
            </div>
          );
        }
        return (
          <div className="relative h-full w-full">
            <img
              src={attachmentUrl}
              alt={attachment.name}
              className="h-full w-full object-contain"
              loading="lazy"
              onError={() => onImageError(attachment)}
            />
          </div>
        );
      }
      if (previewKind === "text") {
        const preview = textPreviewMap[attachment.id];
        if (!preview || preview.isLoading) {
          return (
            <div className="flex flex-col items-center gap-2 text-sm text-setta-400 dark:text-setta-500">
              <FiFileText size={40} />
              <span>Loading preview...</span>
            </div>
          );
        }
        if (preview.error) {
          return (
            <div className="flex flex-col items-center gap-2 text-sm text-setta-500 dark:text-setta-300">
              <FiFileText size={40} />
              <span className="max-w-[70%] text-center text-setta-700 dark:text-setta-200">
                {preview.error}
              </span>
            </div>
          );
        }
        return (
          <div className="flex h-full w-full flex-col gap-2">
            <div className="h-full w-full overflow-hidden rounded-md border border-setta-200/60 bg-white/70 dark:border-setta-700 dark:bg-setta-900/60">
              <pre className="h-full w-full overflow-auto p-4 text-xs leading-relaxed text-setta-700 dark:text-setta-200">
                {preview.text || ""}
              </pre>
            </div>
            {preview.truncated ? (
              <div className="text-[11px] text-setta-400">
                Preview truncated.
              </div>
            ) : null}
          </div>
        );
      }
      if (previewKind === "pdf") {
        if (
          attachment.size !== null &&
          attachment.size !== undefined &&
          attachment.size > PDF_PREVIEW_MAX_BYTES
        ) {
          return renderFileCard(
            attachment,
            <FiFileText size={40} />,
            "Preview disabled for large PDFs.",
          );
        }
        if (!attachmentUrl) {
          return renderFileCard(
            attachment,
            <FiFileText size={40} />,
            "Preview unavailable.",
          );
        }
        return (
          <div className="relative h-full w-full overflow-hidden rounded-md">
            <iframe
              src={attachmentUrl}
              title={attachment.name}
              className="h-full w-full"
            />
          </div>
        );
      }
      if (previewKind === "audio") {
        if (!attachmentUrl) {
          return renderFileCard(
            attachment,
            <FiMusic size={40} />,
            "Preview unavailable.",
          );
        }
        return (
          <div className="flex h-full w-full items-center justify-center">
            <audio controls preload="metadata" className="w-full max-w-[720px]">
              <source src={attachmentUrl} />
            </audio>
          </div>
        );
      }
      if (previewKind === "video") {
        if (!attachmentUrl) {
          return renderFileCard(
            attachment,
            <FiVideo size={40} />,
            "Preview unavailable.",
          );
        }
        return (
          <div className="relative h-full w-full">
            <video controls preload="metadata" className="h-full w-full">
              <source src={attachmentUrl} />
            </video>
          </div>
        );
      }
      if (previewKind === "archive") {
        return renderFileCard(
          attachment,
          <FiArchive size={40} />,
          "Archive preview not available.",
        );
      }
      return renderFileCard(
        attachment,
        <FiFileText size={40} />,
        "Preview not available.",
      );
    },
    [attachmentUrlMap, onImageError, renderFileCard, textPreviewMap],
  );

  if (!open || attachments.length === 0 || !selectedAttachment) {
    return null;
  }

  const sizeLabel = getAttachmentSizeLabel(selectedAttachment);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 animate-[overlayShow_150ms_cubic-bezier(0.16,_1,_0.3,_1)] bg-[rgba(0,0,0,0.5)] backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex h-[80vh] min-h-0 w-[95vw] max-w-[1100px] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-hidden rounded-lg bg-white px-6 pb-5 pt-4 shadow-xl dark:border dark:border-setta-600 dark:bg-setta-800">
          <div className="flex items-center justify-between gap-3">
            <Dialog.Title className="text-xs font-bold uppercase tracking-[0.2em] text-setta-400">
              Attachment preview
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-setta-400 transition hover:bg-setta-200 hover:text-setta-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:hover:bg-setta-900 dark:hover:text-setta-200"
              >
                <IoMdClose size={18} />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex items-center justify-between text-[11px] text-setta-400">
              <div className="max-w-[70%] truncate">
                {selectedAttachment.name}
              </div>
              <div className="shrink-0">
                {selectedIndex + 1} / {attachments.length}
              </div>
            </div>

            <MediaCarousel
              items={carouselItems}
              selectedId={selectedAttachmentId}
              onSelect={onSelectAttachmentId}
              renderPreview={renderAttachmentPreview}
              showThumbnailLabels
              showNavButtons={attachments.length > 1}
              containerClassName="gap-4"
              previewClassName="border border-setta-200/60 bg-setta-50 dark:border-setta-700 dark:bg-setta-860/80"
              thumbnailRowClassName="rounded-lg border border-setta-200/60 bg-setta-50/70 px-3 py-3 dark:border-setta-700 dark:bg-setta-900/50"
              thumbnailClassName="border-setta-300/70 bg-white/70 dark:border-setta-700 dark:bg-setta-800/70"
              selectedThumbnailClassName="border-blue-500 shadow-md"
              footer={
                <div className="flex items-center justify-between text-[11px] text-setta-400">
                  <div className="truncate">
                    {selectedAttachment.mimeType ?? "Unknown type"}
                  </div>
                  {sizeLabel ? <span>{sizeLabel}</span> : null}
                </div>
              }
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export const ChatAttachmentList = memo(function ChatAttachmentList({
  attachments,
  isUser,
  attachmentUrlMap,
  requestAttachmentUrls,
  renderAttachmentName,
}: {
  attachments: ChatFileAttachment[];
  isUser: boolean;
  attachmentUrlMap: ChatAttachmentUrlMap;
  requestAttachmentUrls: RequestChatAttachmentUrls;
  renderAttachmentName?: (name: string) => ReactNode;
}) {
  const hasAttachments = attachments.length > 0;
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewAttachmentId, setPreviewAttachmentId] = useState<string | null>(
    null,
  );
  const pillClassName = isUser
    ? "border-white/40 bg-white/10 text-white"
    : "border-setta-200 bg-white text-setta-700 dark:border-setta-800 dark:bg-setta-900/60 dark:text-setta-200";
  const detailClassName = isUser ? "text-white/70" : "text-setta-400";
  const renderAttachmentNameContent = useCallback(
    (name: string) =>
      renderAttachmentName ? renderAttachmentName(name) : name,
    [renderAttachmentName],
  );
  const handleImageError = useCallback(
    (attachment: ChatFileAttachment) => {
      void requestAttachmentUrls([attachment], { force: true });
    },
    [requestAttachmentUrls],
  );
  const handlePreviewOpen = useCallback((attachment: ChatFileAttachment) => {
    setPreviewAttachmentId(attachment.id);
    setPreviewOpen(true);
  }, []);

  useEffect(() => {
    const staleImages = attachments.filter((attachment) => {
      if (!isImageAttachment(attachment)) {
        return false;
      }
      const entry = attachmentUrlMap[attachment.id];
      if (!entry) {
        return false;
      }
      return isChatAttachmentUrlStale(entry, Date.now());
    });
    if (staleImages.length > 0) {
      void requestAttachmentUrls(staleImages);
    }
  }, [attachments, attachmentUrlMap, requestAttachmentUrls]);

  useEffect(() => {
    if (!previewOpen || attachments.length === 0) {
      return;
    }
    if (
      previewAttachmentId &&
      attachments.some((attachment) => attachment.id === previewAttachmentId)
    ) {
      return;
    }
    setPreviewAttachmentId(attachments[0]?.id ?? null);
  }, [attachments, previewAttachmentId, previewOpen]);

  if (!hasAttachments) {
    return null;
  }

  return (
    <>
      <AttachmentPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        attachments={attachments}
        selectedAttachmentId={previewAttachmentId}
        onSelectAttachmentId={setPreviewAttachmentId}
        attachmentUrlMap={attachmentUrlMap}
        requestAttachmentUrls={requestAttachmentUrls}
        onImageError={handleImageError}
      />
      <div className="flex flex-wrap gap-2">
        {attachments.map((attachment) => {
          const isImage = isImageAttachment(attachment);
          const entry = attachmentUrlMap[attachment.id];
          const url = entry ? entry.url : "";
          const sizeLabel = getAttachmentSizeLabel(attachment);
          if (isImage && url) {
            return (
              <div key={attachment.id} className="flex w-24 flex-col gap-1">
                <button
                  type="button"
                  onClick={() => handlePreviewOpen(attachment)}
                  className="inline-flex h-16 w-16 cursor-pointer items-center justify-center rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                >
                  <ChatImage
                    url={url}
                    onError={() => handleImageError(attachment)}
                    className={`h-16 w-16 cursor-pointer object-cover ${
                      isUser ? "border-white/40 bg-white/10" : ""
                    }`}
                  />
                </button>
                <div
                  className={`flex w-full flex-col gap-0.5 text-[10px] ${detailClassName}`}
                >
                  <span className="truncate">
                    {renderAttachmentNameContent(attachment.name)}
                  </span>
                  {sizeLabel ? (
                    <span className="opacity-70">{sizeLabel}</span>
                  ) : null}
                </div>
              </div>
            );
          }
          return (
            <div
              key={attachment.id}
              role="button"
              tabIndex={0}
              onClick={() => handlePreviewOpen(attachment)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handlePreviewOpen(attachment);
                }
              }}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1 text-xs ${pillClassName}`}
            >
              <span className="max-w-[220px] truncate">
                {renderAttachmentNameContent(attachment.name)}
              </span>
              {sizeLabel ? (
                <span className={`shrink-0 text-[10px] ${detailClassName}`}>
                  {sizeLabel}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
});
