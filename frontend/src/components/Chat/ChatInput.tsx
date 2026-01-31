import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  KeyboardEvent,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  IoAttach,
  IoClose,
  IoFolderOpen,
  IoSend,
  IoStop,
} from "react-icons/io5";
import { openDropzoneFilePickerModal } from "state/actions/modal";
import {
  addTemporaryNotification,
  DEFAULT_TEMP_TIMEOUT,
} from "state/actions/notifications";
import { useShareSession } from "state/definitions";
import {
  CHAT_ATTACHMENT_ALLOWED_MIME_PREFIXES,
  CHAT_ATTACHMENT_MAX_FILE_BYTES,
  CHAT_ATTACHMENT_MAX_FILE_LABEL,
  CHAT_ATTACHMENT_MAX_FILES,
  formatBytes,
  isChatAttachmentMimeAllowed,
  resolveChatAttachmentLimit,
} from "utils/attachments";
import { createDropzoneFileArtifactId } from "utils/dropzone";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_delete_artifacts,
  route_import_files_to_artifacts,
  route_update_artifacts,
} from "utils/generatedEndpoints";
import {
  ArtifactTypeEnum,
  ChatFileAttachment,
  FileArtifact,
  SettaNotificationTypeEnum,
} from "utils/generatedTypes";

type ChatInputProps = {
  placeholderText: string | undefined;
  waitingForResponse: boolean;
  disabled?: boolean;
  submitDisabled?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  onSubmit: (
    message: string,
    attachments: ChatFileAttachment[],
  ) => Promise<boolean | void> | boolean | void;
  onStop?: () => Promise<void> | void;
};

export const ChatInput = memo(function ChatInput({
  placeholderText,
  waitingForResponse,
  disabled = false,
  submitDisabled = false,
  value,
  onChange,
  onSubmit,
  onStop,
}: ChatInputProps) {
  const [internalValue, setInternalValue] = useState("");
  const [attachments, setAttachments] = useState<ChatFileAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [attachmentWarning, setAttachmentWarning] = useState<string | null>(
    null,
  );
  const dragDepth = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const warningTimeoutRef = useRef<number | null>(null);
  const { isShareMode } = useShareSession((state) => ({
    isShareMode: state.isShareMode,
  }));
  const isControlled = typeof value === "string" && Boolean(onChange);
  const inputValue = isControlled ? value : internalValue;
  const isDisabled = disabled;
  const isSubmitDisabled = submitDisabled || isDisabled || isUploading;
  const { maxFiles: attachmentLimit, disabled: attachmentsDisabled } =
    resolveChatAttachmentLimit(CHAT_ATTACHMENT_MAX_FILES);
  const attachmentInputDisabled =
    isDisabled || isUploading || attachmentsDisabled;
  const remainingSlots = attachmentsDisabled
    ? 0
    : attachmentLimit === null
      ? null
      : Math.max(attachmentLimit - attachments.length, 0);
  const allowedMimeLabel =
    CHAT_ATTACHMENT_ALLOWED_MIME_PREFIXES.length > 0
      ? `Allowed types: ${CHAT_ATTACHMENT_ALLOWED_MIME_PREFIXES.join(", ")}.`
      : "";

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const nextValue = event.target.value;
      if (isControlled) {
        onChange?.(nextValue);
        return;
      }
      setInternalValue(nextValue);
      onChange?.(nextValue);
    },
    [isControlled, onChange],
  );

  const clearInput = useCallback(() => {
    if (isControlled) {
      onChange?.("");
      return;
    }
    setInternalValue("");
    onChange?.("");
  }, [isControlled, onChange]);

  const notifyAttachmentWarning = useCallback((message: string) => {
    addTemporaryNotification(message, SettaNotificationTypeEnum.warning);
    setAttachmentWarning(message);
    if (warningTimeoutRef.current !== null) {
      window.clearTimeout(warningTimeoutRef.current);
    }
    warningTimeoutRef.current = window.setTimeout(() => {
      setAttachmentWarning(null);
      warningTimeoutRef.current = null;
    }, DEFAULT_TEMP_TIMEOUT);
  }, []);

  const readFileAsBase64 = useCallback(async (file: File): Promise<string> => {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") {
          reject(new Error("Unexpected file reader payload."));
          return;
        }
        const commaIndex = result.indexOf(",");
        if (commaIndex >= 0) {
          resolve(result.slice(commaIndex + 1));
          return;
        }
        resolve(result);
      };
      reader.onerror = () => {
        reject(reader.error ?? new Error("Failed to read file."));
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) {
        return;
      }
      setIsUploading(true);
      try {
        const artifactBaseFolder = isShareMode ? "artifacts" : undefined;
        const fileIds = files.map((file) =>
          createDropzoneFileArtifactId(file.name, artifactBaseFolder),
        );
        const base64Payloads = await Promise.all(
          files.map((file) => readFileAsBase64(file)),
        );
        const artifacts: FileArtifact[] = base64Payloads.map(
          (payload, index) => ({
            type: ArtifactTypeEnum.File,
            id: fileIds[index],
            value: payload,
          }),
        );
        const res = await route_update_artifacts({ artifacts });
        if (!res200(res)) {
          const detail = getErrorDetail(res.data);
          const message = detail ?? "Failed to upload attachments.";
          notifyAttachmentWarning(message);
          return;
        }
        const newAttachments: ChatFileAttachment[] = files.map(
          (file, index) => ({
            id: fileIds[index],
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
          }),
        );
        setAttachments((prev) => [...prev, ...newAttachments]);
      } finally {
        setIsUploading(false);
      }
    },
    [isShareMode, notifyAttachmentWarning, readFileAsBase64],
  );

  const handleLocalFiles = useCallback(
    async (files: File[]) => {
      if (isDisabled || isUploading) {
        return;
      }
      if (attachmentsDisabled) {
        notifyAttachmentWarning("Attachments are disabled.");
        return;
      }
      if (files.length === 0) {
        return;
      }
      if (remainingSlots === 0) {
        notifyAttachmentWarning("Maximum attachments reached.");
        return;
      }
      const allowedFiles =
        remainingSlots === null ? files : files.slice(0, remainingSlots);
      const rejectedByType = allowedFiles.filter((file) => {
        const mimeType = file.type || "application/octet-stream";
        return !isChatAttachmentMimeAllowed(mimeType);
      });
      if (rejectedByType.length > 0) {
        notifyAttachmentWarning(
          `Some files were skipped due to type restrictions. ${allowedMimeLabel}`.trim(),
        );
      }
      const typeAllowedFiles = allowedFiles.filter((file) => {
        const mimeType = file.type || "application/octet-stream";
        return isChatAttachmentMimeAllowed(mimeType);
      });
      if (typeAllowedFiles.length === 0) {
        return;
      }
      const oversized = typeAllowedFiles.filter(
        (file) => file.size > CHAT_ATTACHMENT_MAX_FILE_BYTES,
      );
      if (oversized.length > 0) {
        notifyAttachmentWarning(
          `File exceeds ${CHAT_ATTACHMENT_MAX_FILE_LABEL} limit.`,
        );
      }
      const validFiles = typeAllowedFiles.filter(
        (file) => file.size <= CHAT_ATTACHMENT_MAX_FILE_BYTES,
      );
      if (validFiles.length === 0) {
        return;
      }
      await uploadFiles(validFiles);
    },
    [
      allowedMimeLabel,
      attachmentsDisabled,
      isDisabled,
      isUploading,
      notifyAttachmentWarning,
      remainingSlots,
      uploadFiles,
    ],
  );

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files ? Array.from(event.target.files) : [];
      event.target.value = "";
      void handleLocalFiles(files);
    },
    [handleLocalFiles],
  );

  const handleRemoveAttachment = useCallback(
    async (attachment: ChatFileAttachment) => {
      setAttachments((prev) =>
        prev.filter((item) => item.id !== attachment.id),
      );
      const res = await route_delete_artifacts({
        artifacts: [{ id: attachment.id, type: ArtifactTypeEnum.File }],
      });
      if (!res200(res)) {
        const detail = getErrorDetail(res.data);
        const message = detail ?? "Failed to delete attachment.";
        notifyAttachmentWarning(message);
      }
    },
    [notifyAttachmentWarning],
  );

  const handleClearAttachments = useCallback(async () => {
    if (attachments.length === 0) {
      return;
    }
    const artifactIds = attachments.map((attachment) => attachment.id);
    setAttachments([]);
    const res = await route_delete_artifacts({
      artifacts: artifactIds.map((artifactId) => ({
        id: artifactId,
        type: ArtifactTypeEnum.File,
      })),
    });
    if (!res200(res)) {
      const detail = getErrorDetail(res.data);
      const message = detail ?? "Failed to delete attachments.";
      notifyAttachmentWarning(message);
    }
  }, [attachments, notifyAttachmentWarning]);

  const handlePickFromProject = useCallback(() => {
    if (isDisabled || isUploading) {
      return;
    }
    if (attachmentsDisabled) {
      notifyAttachmentWarning("Attachments are disabled.");
      return;
    }
    openDropzoneFilePickerModal({
      title: "Attach files",
      remainingSlots,
      onPickPaths: async (paths: string[]) => {
        if (paths.length === 0) {
          return;
        }
        const res = await route_import_files_to_artifacts({ paths });
        if (!res200(res)) {
          const detail = getErrorDetail(res.data);
          const message = detail ?? "Failed to import attachments.";
          notifyAttachmentWarning(message);
          return;
        }
        const rejected = res.data.filter(
          (item) => !isChatAttachmentMimeAllowed(item.mimeType),
        );
        if (rejected.length > 0) {
          notifyAttachmentWarning(
            `Some files were skipped due to type restrictions. ${allowedMimeLabel}`.trim(),
          );
        }
        const newAttachments: ChatFileAttachment[] = res.data
          .filter((item) => isChatAttachmentMimeAllowed(item.mimeType))
          .map((item) => ({
            id: item.id,
            name: item.name,
            mimeType: item.mimeType,
            size: item.size,
          }));
        if (newAttachments.length === 0) {
          return;
        }
        setAttachments((prev) => [...prev, ...newAttachments]);
      },
    });
  }, [
    allowedMimeLabel,
    attachmentsDisabled,
    isDisabled,
    isUploading,
    notifyAttachmentWarning,
    remainingSlots,
  ]);

  const handleDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (attachmentInputDisabled) {
        return;
      }
      event.preventDefault();
      dragDepth.current += 1;
      setIsDragActive(true);
    },
    [attachmentInputDisabled],
  );

  const handleDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (attachmentInputDisabled) {
        return;
      }
      event.preventDefault();
      dragDepth.current -= 1;
      if (dragDepth.current <= 0) {
        dragDepth.current = 0;
        setIsDragActive(false);
      }
    },
    [attachmentInputDisabled],
  );

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (attachmentInputDisabled) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    [attachmentInputDisabled],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (attachmentInputDisabled) {
        return;
      }
      event.preventDefault();
      dragDepth.current = 0;
      setIsDragActive(false);
      const files = Array.from(event.dataTransfer.files || []);
      void handleLocalFiles(files);
    },
    [attachmentInputDisabled, handleLocalFiles],
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (waitingForResponse) {
        if (onStop) {
          await onStop();
        }
        return;
      }
      if (isSubmitDisabled) {
        return;
      }

      const trimmedInput = inputValue.trim();
      if (trimmedInput.length === 0 && attachments.length === 0) {
        return;
      }

      const submittedValue = inputValue;
      const result = await onSubmit(submittedValue, attachments);
      if (result === true) {
        clearInput();
        setAttachments([]);
      }
    },
    [
      attachments,
      clearInput,
      inputValue,
      isSubmitDisabled,
      onStop,
      onSubmit,
      waitingForResponse,
    ],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (
        event.key !== "Enter" ||
        event.shiftKey ||
        waitingForResponse ||
        isSubmitDisabled
      ) {
        return;
      }
      event.preventDefault();
      const formEvent = new Event("submit", {
        bubbles: true,
        cancelable: true,
      });
      event.currentTarget.form?.dispatchEvent(formEvent);
    },
    [isSubmitDisabled, waitingForResponse],
  );

  const buttonIcon = useMemo(() => {
    if (waitingForResponse) {
      return <IoStop />;
    }
    return <IoSend />;
  }, [waitingForResponse]);

  const buttonClassName = useMemo(() => {
    if (waitingForResponse) {
      return "text-setta-300 dark:text-setta-600";
    }
    if (isSubmitDisabled) {
      return "text-setta-300 dark:text-setta-600";
    }
    return "text-setta-500 hover:text-blue-500 focus:text-blue-500";
  }, [isSubmitDisabled, waitingForResponse]);

  const textAreaClassName = useMemo(() => {
    const base =
      "nodrag prose prose-sm my-2 max-h-48 flex-1 resize-none overflow-y-auto rounded-lg border border-setta-200 bg-transparent px-4 py-2 text-setta-800 outline-none [field-sizing:content] hover:bg-setta-100/50 focus:outline-none focus:outline focus:outline-blue-500 dark:border-setta-700 dark:text-white dark:hover:bg-setta-800 dark:focus:bg-setta-800/50 dark:focus:outline-blue-700";
    const dragClass = isDragActive
      ? "ring-2 ring-blue-400 bg-blue-50/40 dark:bg-blue-900/20"
      : "";
    if (isDisabled) {
      return `${base} ${dragClass} cursor-not-allowed opacity-30`;
    }
    return `${base} ${dragClass} cursor-auto opacity-100`;
  }, [isDisabled, isDragActive]);

  useEffect(() => {
    return () => {
      if (warningTimeoutRef.current !== null) {
        window.clearTimeout(warningTimeoutRef.current);
      }
    };
  }, []);

  return (
    <form onSubmit={handleSubmit} className="flex justify-center">
      <div className="flex w-full max-w-xl gap-2">
        <div
          className="flex min-w-0 flex-1 flex-col"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <textarea
            type="text"
            value={inputValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholderText}
            className={textAreaClassName}
            disabled={isDisabled}
          />
          <div className="flex flex-wrap items-center gap-2 pb-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileInputChange}
              disabled={attachmentInputDisabled}
            />
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-setta-200 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-setta-500 hover:bg-setta-100 dark:border-setta-800 dark:text-setta-300 dark:hover:bg-setta-850"
              onClick={() => fileInputRef.current?.click()}
              disabled={attachmentInputDisabled}
            >
              <IoAttach />
              Attach
            </button>
            {!isShareMode ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-setta-200 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-setta-500 hover:bg-setta-100 dark:border-setta-800 dark:text-setta-300 dark:hover:bg-setta-850"
                onClick={handlePickFromProject}
                disabled={attachmentInputDisabled}
              >
                <IoFolderOpen />
                Project
              </button>
            ) : null}
            {!attachmentsDisabled && remainingSlots !== null ? (
              <span className="text-[10px] uppercase tracking-[0.2em] text-setta-300">
                Slots: {remainingSlots}
              </span>
            ) : null}
            {attachmentsDisabled ? (
              <span className="text-[10px] uppercase tracking-[0.2em] text-setta-300">
                Attachments disabled
              </span>
            ) : null}
            {isUploading ? (
              <span className="text-[10px] uppercase tracking-[0.2em] text-setta-300">
                Uploading...
              </span>
            ) : null}
          </div>
          {attachments.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex items-center gap-2 rounded-md border border-setta-200 bg-white/80 px-2 py-1 text-xs text-setta-700 dark:border-setta-800 dark:bg-setta-900/60 dark:text-setta-200"
                >
                  <span className="max-w-[200px] truncate">
                    {attachment.name}
                  </span>
                  {attachment.size !== null && attachment.size !== undefined ? (
                    <span className="text-[10px] text-setta-400">
                      {formatBytes(attachment.size)}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="rounded-full p-1 text-setta-400 transition-colors hover:text-red-500"
                    onClick={() => handleRemoveAttachment(attachment)}
                    disabled={isUploading}
                  >
                    <IoClose />
                  </button>
                </div>
              ))}
              {attachments.length > 1 ? (
                <button
                  type="button"
                  className="rounded-full border border-setta-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-setta-400 hover:border-setta-400 hover:text-setta-600 dark:border-setta-800 dark:text-setta-500 dark:hover:text-setta-200"
                  onClick={handleClearAttachments}
                  disabled={isUploading}
                >
                  Clear all
                </button>
              ) : null}
            </div>
          ) : null}
          {attachmentWarning ? (
            <div
              className="mb-2 rounded-md border border-amber-200 bg-amber-50/80 px-2 py-1 text-xs text-amber-700 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-200"
              role="alert"
            >
              {attachmentWarning}
            </div>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={isSubmitDisabled}
          className={`mb-5 cursor-pointer self-end px-2 py-0.5 ${buttonClassName} focus:outline-none focus:ring-0 disabled:opacity-40 dark:hover:text-blue-700`}
        >
          {buttonIcon}
        </button>
      </div>
    </form>
  );
});
