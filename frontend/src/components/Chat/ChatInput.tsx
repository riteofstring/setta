import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
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
  IoAdd,
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
import { useShareCapabilities } from "state/hooks/share";
import {
  getAttachmentPolicy,
  isAttachmentMimeAllowed,
} from "utils/attachmentPolicy";
import { formatBytes } from "utils/attachments";
import {
  CHAT_SUPPORTED_IMAGE_LABEL,
  isChatImageAttachmentSupported,
  isChatImageFileSupported,
} from "utils/chatAttachmentSupport";
import { createDropzoneFileArtifactId } from "utils/dropzone";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_binary_upload,
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
  const { isDeploymentMode } = useShareSession((state) => ({
    isDeploymentMode: state.isDeploymentMode,
  }));
  const { canEditParams } = useShareCapabilities();
  const isControlled = typeof value === "string" && Boolean(onChange);
  const inputValue = isControlled ? value : internalValue;
  const isDisabled = disabled;
  const isSubmitDisabled = submitDisabled || isDisabled || isUploading;
  const chatPolicy = useMemo(() => getAttachmentPolicy("chat"), []);
  const attachmentLimit = chatPolicy.maxFiles;
  const attachmentsDisabled = chatPolicy.maxFilesDisabled;
  const attachmentInputDisabled =
    isDisabled || isUploading || attachmentsDisabled || !canEditParams;
  const attachmentActionsDisabled = isUploading || !canEditParams;
  const remainingSlots = attachmentsDisabled
    ? 0
    : attachmentLimit === null
      ? null
      : Math.max(attachmentLimit - attachments.length, 0);
  const allowedMimeLabel = chatPolicy.allowedMimeLabel;
  const showSharePolicyMessage = isDeploymentMode && !canEditParams;
  const showAttachmentDisabledMessage =
    attachmentsDisabled && !showSharePolicyMessage;
  const attachmentCount = attachments.length;
  const attachmentCountLabel = useMemo(() => {
    if (attachmentsDisabled) {
      return "Attachments disabled";
    }
    if (showSharePolicyMessage) {
      return "Attachments blocked";
    }
    if (attachmentLimit === null) {
      return `Attachments ${attachmentCount}`;
    }
    return `Attachments ${attachmentCount}/${attachmentLimit}`;
  }, [
    attachmentCount,
    attachmentLimit,
    attachmentsDisabled,
    showSharePolicyMessage,
  ]);

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

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) {
        return;
      }
      setIsUploading(true);
      try {
        const uploadResults = await Promise.allSettled(
          files.map(async (file) => {
            const form = new FormData();
            form.append("file", file, file.name);
            form.append("durable", "false");
            const res = await route_binary_upload(form);
            if (!res200(res)) {
              throw new Error("Upload failed");
            }
            return { file, ref: res.data };
          }),
        );
        const successfulUploads: Array<{
          file: File;
          ref: FileArtifact["value"];
        }> = [];
        const failedUploads: File[] = [];
        uploadResults.forEach((result, index) => {
          const file = files[index];
          if (!file) {
            return;
          }
          if (result.status === "fulfilled") {
            successfulUploads.push(result.value);
          } else {
            failedUploads.push(file);
          }
        });
        if (failedUploads.length > 0) {
          notifyAttachmentWarning("Failed to upload attachments.");
        }
        if (successfulUploads.length === 0) {
          return;
        }
        const artifactBaseFolder = isDeploymentMode ? "artifacts" : undefined;
        const fileIds = successfulUploads.map(({ file }) =>
          createDropzoneFileArtifactId(file.name, artifactBaseFolder),
        );
        const artifacts: FileArtifact[] = successfulUploads.map(
          ({ ref }, index) => ({
            type: ArtifactTypeEnum.File,
            id: fileIds[index],
            value: ref,
          }),
        );
        const res = await route_update_artifacts({
          artifacts,
          uploadScope: "chat",
        });
        if (!res200(res)) {
          const detail = getErrorDetail(res.data);
          const message = detail ?? "Failed to upload attachments.";
          notifyAttachmentWarning(message);
          return;
        }
        const newAttachments: ChatFileAttachment[] = successfulUploads.map(
          ({ file }, index) => ({
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
    [isDeploymentMode, notifyAttachmentWarning],
  );

  const handleLocalFiles = useCallback(
    async (files: File[]) => {
      if (isDisabled || isUploading) {
        return;
      }
      if (!canEditParams) {
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
        return !isAttachmentMimeAllowed(mimeType, chatPolicy);
      });
      if (rejectedByType.length > 0) {
        notifyAttachmentWarning(
          `Some files were skipped due to type restrictions. ${allowedMimeLabel}`.trim(),
        );
      }
      const typeAllowedFiles = allowedFiles.filter((file) => {
        const mimeType = file.type || "application/octet-stream";
        return isAttachmentMimeAllowed(mimeType, chatPolicy);
      });
      if (typeAllowedFiles.length === 0) {
        return;
      }
      const unsupportedImages = typeAllowedFiles.filter(
        (file) => !isChatImageFileSupported(file),
      );
      if (unsupportedImages.length > 0) {
        notifyAttachmentWarning(
          `Some images were skipped. ${CHAT_SUPPORTED_IMAGE_LABEL}`.trim(),
        );
      }
      const imageAllowedFiles = typeAllowedFiles.filter((file) =>
        isChatImageFileSupported(file),
      );
      if (imageAllowedFiles.length === 0) {
        return;
      }
      const oversized = imageAllowedFiles.filter(
        (file) => file.size > chatPolicy.maxFileBytes,
      );
      if (oversized.length > 0) {
        notifyAttachmentWarning(
          `File exceeds ${chatPolicy.maxFileLabel} limit.`,
        );
      }
      const validFiles = imageAllowedFiles.filter(
        (file) => file.size <= chatPolicy.maxFileBytes,
      );
      if (validFiles.length === 0) {
        return;
      }
      await uploadFiles(validFiles);
    },
    [
      allowedMimeLabel,
      attachmentsDisabled,
      canEditParams,
      chatPolicy,
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
      if (attachmentActionsDisabled) {
        return;
      }
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
    [attachmentActionsDisabled, notifyAttachmentWarning],
  );

  const handleClearAttachments = useCallback(async () => {
    if (attachmentActionsDisabled) {
      return;
    }
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
  }, [attachmentActionsDisabled, attachments, notifyAttachmentWarning]);

  const handlePickFromProject = useCallback(() => {
    if (isDisabled || isUploading) {
      return;
    }
    if (!canEditParams) {
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
        const res = await route_import_files_to_artifacts({
          paths,
          uploadScope: "chat",
        });
        if (!res200(res)) {
          const detail = getErrorDetail(res.data);
          const message = detail ?? "Failed to import attachments.";
          notifyAttachmentWarning(message);
          return;
        }
        const newAttachments: ChatFileAttachment[] = res.data.map((item) => ({
          id: item.id,
          name: item.name,
          mimeType: item.mimeType,
          size: item.size,
        }));
        if (newAttachments.length === 0) {
          return;
        }
        const unsupported = newAttachments.filter(
          (attachment) => !isChatImageAttachmentSupported(attachment),
        );
        const supported = newAttachments.filter((attachment) =>
          isChatImageAttachmentSupported(attachment),
        );
        if (unsupported.length > 0) {
          notifyAttachmentWarning(
            `Some images were skipped. ${CHAT_SUPPORTED_IMAGE_LABEL}`.trim(),
          );
          const deleteRes = await route_delete_artifacts({
            artifacts: unsupported.map((attachment) => ({
              id: attachment.id,
              type: ArtifactTypeEnum.File,
            })),
          });
          if (!res200(deleteRes)) {
            const detail = getErrorDetail(deleteRes.data);
            const message = detail ?? "Failed to delete skipped attachments.";
            notifyAttachmentWarning(message);
          }
        }
        if (supported.length === 0) {
          return;
        }
        setAttachments((prev) => [...prev, ...supported]);
      },
    });
  }, [
    attachmentsDisabled,
    canEditParams,
    isDisabled,
    isUploading,
    notifyAttachmentWarning,
    remainingSlots,
  ]);

  const handleDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (attachmentInputDisabled) {
        return;
      }
      dragDepth.current += 1;
      setIsDragActive(true);
    },
    [attachmentInputDisabled],
  );

  const handleDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (attachmentInputDisabled) {
        return;
      }
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
      event.preventDefault();
      if (attachmentInputDisabled) {
        return;
      }
      event.dataTransfer.dropEffect = "copy";
    },
    [attachmentInputDisabled],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (attachmentInputDisabled) {
        return;
      }
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
      "nodrag text-sm leading-5 max-h-48 w-full max-w-none flex-1 resize-none overflow-y-auto rounded-lg border border-setta-200 bg-transparent py-2 pl-10 pr-10 text-setta-800 outline-none [field-sizing:content] hover:bg-setta-100/50 focus:outline-none focus:outline focus:outline-blue-500 dark:border-setta-700 dark:text-white dark:hover:bg-setta-800 dark:focus:bg-setta-800/50 dark:focus:outline-blue-700";
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
      <div className="flex w-full gap-2">
        <div
          className="flex min-w-0 flex-1 flex-col"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div className="relative my-1 w-full">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileInputChange}
              disabled={attachmentInputDisabled}
            />
            <DropdownMenu.Root modal={false}>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  aria-label="Attachment options"
                  className={`absolute left-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-md text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-200 ${
                    attachmentInputDisabled
                      ? "cursor-not-allowed opacity-40 hover:bg-transparent"
                      : "cursor-pointer"
                  }`}
                  disabled={attachmentInputDisabled}
                >
                  <IoAdd />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="start"
                  sideOffset={8}
                  className="z-30 flex min-w-[170px] flex-col gap-1 rounded-lg border border-setta-200 bg-white p-2 text-xs font-semibold text-setta-600 shadow-xl dark:border-setta-700/70 dark:bg-setta-900 dark:text-setta-200"
                >
                  <DropdownMenu.Label className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-setta-400 dark:text-setta-500">
                    {attachmentCountLabel}
                  </DropdownMenu.Label>
                  <DropdownMenu.Separator className="my-1 h-px bg-setta-100 dark:bg-setta-700/60" />
                  <DropdownMenu.Item
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-setta-100 hover:text-setta-900 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 dark:hover:bg-setta-800 dark:hover:text-white"
                    onSelect={() => fileInputRef.current?.click()}
                    disabled={attachmentInputDisabled}
                  >
                    <IoAttach />
                    Attach
                  </DropdownMenu.Item>
                  {!isDeploymentMode ? (
                    <DropdownMenu.Item
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-setta-100 hover:text-setta-900 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 dark:hover:bg-setta-800 dark:hover:text-white"
                      onSelect={handlePickFromProject}
                      disabled={attachmentInputDisabled}
                    >
                      <IoFolderOpen />
                      Project
                    </DropdownMenu.Item>
                  ) : null}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <textarea
              type="text"
              value={inputValue}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholderText}
              className={textAreaClassName}
              disabled={isDisabled}
            />
            <button
              type="submit"
              disabled={isSubmitDisabled}
              className={`absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-md text-base transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${buttonClassName} disabled:opacity-40`}
            >
              {buttonIcon}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 pb-1">
            {showSharePolicyMessage ? (
              <span className="text-[10px] uppercase tracking-[0.2em] text-setta-300">
                Attachments blocked by share policy
              </span>
            ) : null}
            {showAttachmentDisabledMessage ? (
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
            <div className="mb-1 flex flex-wrap gap-2">
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
                    disabled={attachmentActionsDisabled}
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
                  disabled={attachmentActionsDisabled}
                >
                  Clear all
                </button>
              ) : null}
            </div>
          ) : null}
          {attachmentWarning ? (
            <div
              className="mb-1 rounded-md border border-amber-200 bg-amber-50/80 px-2 py-1 text-xs text-amber-700 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-200"
              role="alert"
            >
              {attachmentWarning}
            </div>
          ) : null}
        </div>
      </div>
    </form>
  );
});
