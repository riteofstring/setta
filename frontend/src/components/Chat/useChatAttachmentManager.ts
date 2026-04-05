import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
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
  NotificationTypeEnum,
} from "utils/generatedTypes";

type UseChatAttachmentManagerArgs = {
  disabled?: boolean;
  initialAttachments?: ChatFileAttachment[];
  preserveInitialArtifacts?: boolean;
};

const EMPTY_ATTACHMENTS: ChatFileAttachment[] = [];

export function useChatAttachmentManager({
  disabled = false,
  initialAttachments = EMPTY_ATTACHMENTS,
  preserveInitialArtifacts = false,
}: UseChatAttachmentManagerArgs) {
  const [attachments, setAttachments] =
    useState<ChatFileAttachment[]>(initialAttachments);
  const initialAttachmentIds = useRef<Set<string>>(
    new Set(initialAttachments.map((attachment) => attachment.id)),
  );
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
  const chatPolicy = useMemo(() => getAttachmentPolicy("chat"), []);
  const attachmentLimit = chatPolicy.maxFiles;
  const attachmentsDisabled = chatPolicy.maxFilesDisabled;
  const attachmentInputDisabled =
    disabled || isUploading || attachmentsDisabled || !canEditParams;
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

  useEffect(() => {
    initialAttachmentIds.current = new Set(
      initialAttachments.map((attachment) => attachment.id),
    );
    setAttachments(initialAttachments);
  }, [initialAttachments]);

  const notifyAttachmentWarning = useCallback((message: string) => {
    addTemporaryNotification(message, NotificationTypeEnum.warning);
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
      if (disabled || isUploading) {
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
      disabled,
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
      if (
        preserveInitialArtifacts &&
        initialAttachmentIds.current.has(attachment.id)
      ) {
        return;
      }
      const res = await route_delete_artifacts({
        artifacts: [{ id: attachment.id, type: ArtifactTypeEnum.File }],
      });
      if (!res200(res)) {
        const detail = getErrorDetail(res.data);
        const message = detail ?? "Failed to delete attachment.";
        notifyAttachmentWarning(message);
      }
    },
    [
      attachmentActionsDisabled,
      notifyAttachmentWarning,
      preserveInitialArtifacts,
    ],
  );

  const handleClearAttachments = useCallback(async () => {
    if (attachmentActionsDisabled) {
      return;
    }
    if (attachments.length === 0) {
      return;
    }
    const attachmentsToDelete = preserveInitialArtifacts
      ? attachments.filter(
          (attachment) => !initialAttachmentIds.current.has(attachment.id),
        )
      : attachments;
    setAttachments([]);
    if (attachmentsToDelete.length === 0) {
      return;
    }
    const res = await route_delete_artifacts({
      artifacts: attachmentsToDelete.map((attachment) => ({
        id: attachment.id,
        type: ArtifactTypeEnum.File,
      })),
    });
    if (!res200(res)) {
      const detail = getErrorDetail(res.data);
      const message = detail ?? "Failed to delete attachments.";
      notifyAttachmentWarning(message);
    }
  }, [
    attachmentActionsDisabled,
    attachments,
    notifyAttachmentWarning,
    preserveInitialArtifacts,
  ]);

  const handlePickFromProject = useCallback(() => {
    if (disabled || isUploading) {
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
    disabled,
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

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  const replaceAttachments = useCallback(
    (nextAttachments: ChatFileAttachment[]) => {
      setAttachments(nextAttachments);
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (warningTimeoutRef.current !== null) {
        window.clearTimeout(warningTimeoutRef.current);
      }
    };
  }, []);

  return {
    attachments,
    attachmentActionsDisabled,
    attachmentCountLabel,
    attachmentInputDisabled,
    attachmentWarning,
    clearAttachments,
    replaceAttachments,
    fileInputRef,
    handleClearAttachments,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFileInputChange,
    handlePickFromProject,
    handleRemoveAttachment,
    isDeploymentMode,
    isDragActive,
    isUploading,
    remainingSlots,
    showAttachmentDisabledMessage,
    showSharePolicyMessage,
  };
}
