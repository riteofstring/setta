import {
  deleteArtifacts,
  importFilesToArtifacts,
  updateArtifacts,
  uploadBinary,
} from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
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

type ChatAttachmentPolicy = ReturnType<typeof getAttachmentPolicy>;

type AttachmentUiState = {
  attachmentActionsDisabled: boolean;
  attachmentCountLabel: string;
  attachmentInputDisabled: boolean;
  remainingSlots: number | null;
  showAttachmentDisabledMessage: boolean;
  showSharePolicyMessage: boolean;
};

type SuccessfulUpload = {
  file: File;
  ref: FileArtifact["value"];
};

type LocalFileValidationResult = {
  validFiles: File[];
  warnings: string[];
};

const EMPTY_ATTACHMENTS: ChatFileAttachment[] = [];

const DEFAULT_ATTACHMENT_MIME_TYPE = "application/octet-stream";

function resolveRemainingSlots(
  attachmentLimit: number | null,
  attachmentCount: number,
  attachmentsDisabled: boolean,
): number | null {
  if (attachmentsDisabled) {
    return 0;
  }
  if (attachmentLimit === null) {
    return null;
  }
  return Math.max(attachmentLimit - attachmentCount, 0);
}

function resolveAttachmentCountLabel({
  attachmentCount,
  attachmentLimit,
  attachmentsDisabled,
  showSharePolicyMessage,
}: {
  attachmentCount: number;
  attachmentLimit: number | null;
  attachmentsDisabled: boolean;
  showSharePolicyMessage: boolean;
}): string {
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
}

function resolveAttachmentUiState({
  attachmentCount,
  attachmentLimit,
  attachmentsDisabled,
  canEditParams,
  disabled,
  isDeploymentMode,
  isUploading,
}: {
  attachmentCount: number;
  attachmentLimit: number | null;
  attachmentsDisabled: boolean;
  canEditParams: boolean;
  disabled: boolean;
  isDeploymentMode: boolean;
  isUploading: boolean;
}): AttachmentUiState {
  const showSharePolicyMessage = isDeploymentMode && !canEditParams;
  const remainingSlots = resolveRemainingSlots(
    attachmentLimit,
    attachmentCount,
    attachmentsDisabled,
  );
  return {
    attachmentInputDisabled:
      disabled || isUploading || attachmentsDisabled || !canEditParams,
    attachmentActionsDisabled: isUploading || !canEditParams,
    attachmentCountLabel: resolveAttachmentCountLabel({
      attachmentCount,
      attachmentLimit,
      attachmentsDisabled,
      showSharePolicyMessage,
    }),
    remainingSlots,
    showAttachmentDisabledMessage:
      attachmentsDisabled && !showSharePolicyMessage,
    showSharePolicyMessage,
  };
}

function getFileMimeType(file: Pick<File, "type">): string {
  return file.type || DEFAULT_ATTACHMENT_MIME_TYPE;
}

function createChatAttachment(
  file: Pick<File, "name" | "size" | "type">,
  id: string,
): ChatFileAttachment {
  return {
    id,
    name: file.name,
    mimeType: getFileMimeType(file),
    size: file.size,
  };
}

function splitUploadResults(
  files: File[],
  uploadResults: PromiseSettledResult<SuccessfulUpload>[],
): {
  failedUploads: File[];
  successfulUploads: SuccessfulUpload[];
} {
  const failedUploads: File[] = [];
  const successfulUploads: SuccessfulUpload[] = [];
  for (const [index, result] of uploadResults.entries()) {
    const file = files[index];
    if (!file) {
      continue;
    }
    if (result.status === "fulfilled") {
      successfulUploads.push(result.value);
      continue;
    }
    failedUploads.push(file);
  }
  return {
    failedUploads,
    successfulUploads,
  };
}

function buildUploadedAttachments(
  successfulUploads: SuccessfulUpload[],
  isDeploymentMode: boolean,
): {
  artifacts: FileArtifact[];
  attachments: ChatFileAttachment[];
} {
  const artifactBaseFolder = isDeploymentMode ? "artifacts" : undefined;
  const fileIds = successfulUploads.map(({ file }) =>
    createDropzoneFileArtifactId(file.name, artifactBaseFolder),
  );
  return {
    artifacts: successfulUploads.map(({ ref }, index) => ({
      type: ArtifactTypeEnum.File,
      id: fileIds[index],
      value: ref,
    })),
    attachments: successfulUploads.map(({ file }, index) =>
      createChatAttachment(file, fileIds[index]),
    ),
  };
}

function isLocalFileHandlingBlocked({
  canEditParams,
  disabled,
  isUploading,
}: {
  canEditParams: boolean;
  disabled: boolean;
  isUploading: boolean;
}): boolean {
  return disabled || isUploading || !canEditParams;
}

function limitFilesToRemainingSlots(
  files: File[],
  remainingSlots: number | null,
): File[] {
  if (remainingSlots === null) {
    return files;
  }
  return files.slice(0, remainingSlots);
}

export function validateChatUploadFiles({
  allowedMimeLabel,
  chatPolicy,
  files,
  remainingSlots,
}: {
  allowedMimeLabel: string;
  chatPolicy: ChatAttachmentPolicy;
  files: File[];
  remainingSlots: number | null;
}): LocalFileValidationResult {
  const validFiles: File[] = [];
  let rejectedBySize = false;
  let rejectedByType = false;
  let rejectedByUnsupportedImage = false;
  for (const file of limitFilesToRemainingSlots(files, remainingSlots)) {
    const mimeType = getFileMimeType(file);
    if (!isAttachmentMimeAllowed(mimeType, chatPolicy)) {
      rejectedByType = true;
      continue;
    }
    if (!isChatImageFileSupported(file)) {
      rejectedByUnsupportedImage = true;
      continue;
    }
    if (file.size > chatPolicy.maxFileBytes) {
      rejectedBySize = true;
      continue;
    }
    validFiles.push(file);
  }
  const warnings: string[] = [];
  if (rejectedByType) {
    warnings.push(
      `Some files were skipped due to type restrictions. ${allowedMimeLabel}`.trim(),
    );
  }
  if (rejectedByUnsupportedImage) {
    warnings.push(
      `Some images were skipped. ${CHAT_SUPPORTED_IMAGE_LABEL}`.trim(),
    );
  }
  if (rejectedBySize) {
    warnings.push(`File exceeds ${chatPolicy.maxFileLabel} limit.`);
  }
  return {
    validFiles,
    warnings,
  };
}

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
  const allowedMimeLabel = chatPolicy.allowedMimeLabel;
  const attachmentCount = attachments.length;
  const {
    attachmentActionsDisabled,
    attachmentCountLabel,
    attachmentInputDisabled,
    remainingSlots,
    showAttachmentDisabledMessage,
    showSharePolicyMessage,
  } = useMemo(() => {
    return resolveAttachmentUiState({
      attachmentCount,
      attachmentLimit,
      attachmentsDisabled,
      canEditParams,
      disabled,
      isDeploymentMode,
      isUploading,
    });
  }, [
    attachmentCount,
    attachmentLimit,
    attachmentsDisabled,
    canEditParams,
    disabled,
    isDeploymentMode,
    isUploading,
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
            const res = await callOpenAPI(
              uploadBinary({
                body: {
                  durable: false,
                  file,
                },
              } as Parameters<typeof uploadBinary>[0]),
            );
            if (!res200(res) || !res.data) {
              throw new Error("Upload failed");
            }
            return { file, ref: res.data };
          }),
        );
        const { failedUploads, successfulUploads } = splitUploadResults(
          files,
          uploadResults,
        );
        if (failedUploads.length > 0) {
          notifyAttachmentWarning("Failed to upload attachments.");
        }
        if (successfulUploads.length === 0) {
          return;
        }
        const { artifacts, attachments: newAttachments } =
          buildUploadedAttachments(successfulUploads, isDeploymentMode);
        const res = await callOpenAPI(
          updateArtifacts({
            body: {
              artifacts,
              uploadScope: "chat",
            },
          } as Parameters<typeof updateArtifacts>[0]),
        );
        if (!res200(res)) {
          const detail = getErrorDetail(res.data);
          const message = detail ?? "Failed to upload attachments.";
          notifyAttachmentWarning(message);
          return;
        }
        setAttachments((prev) => [...prev, ...newAttachments]);
      } finally {
        setIsUploading(false);
      }
    },
    [isDeploymentMode, notifyAttachmentWarning],
  );
  const handleLocalFiles = useCallback(
    async (files: File[]) => {
      if (
        isLocalFileHandlingBlocked({ canEditParams, disabled, isUploading })
      ) {
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
      const { validFiles, warnings } = validateChatUploadFiles({
        allowedMimeLabel,
        chatPolicy,
        files,
        remainingSlots,
      });
      for (const warning of warnings) {
        notifyAttachmentWarning(warning);
      }
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
      const res = await callOpenAPI(
        deleteArtifacts({
          body: {
            artifacts: [{ id: attachment.id, type: ArtifactTypeEnum.File }],
          },
        } as Parameters<typeof deleteArtifacts>[0]),
      );
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
    const res = await callOpenAPI(
      deleteArtifacts({
        body: {
          artifacts: attachmentsToDelete.map((attachment) => ({
            id: attachment.id,
            type: ArtifactTypeEnum.File,
          })),
        },
      } as Parameters<typeof deleteArtifacts>[0]),
    );
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
        const res = await callOpenAPI(
          importFilesToArtifacts({
            body: {
              paths,
              uploadScope: "chat",
            },
          } as Parameters<typeof importFilesToArtifacts>[0]),
        );
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
          const deleteRes = await callOpenAPI(
            deleteArtifacts({
              body: {
                artifacts: unsupported.map((attachment) => ({
                  id: attachment.id,
                  type: ArtifactTypeEnum.File,
                })),
              },
            } as Parameters<typeof deleteArtifacts>[0]),
          );
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
