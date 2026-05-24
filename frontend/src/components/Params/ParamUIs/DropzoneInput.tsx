import {
  callOpenAPI,
  createDropzoneFileArtifactId,
  createDropzoneTextAttachmentId,
  createNewId,
  formatBytes,
  getAttachmentPolicy,
  getErrorDetail,
  isAttachmentMimeAllowed,
  parseDropzoneValue,
  res200,
  serializeDropzoneValue,
  type DropzoneStatelessAttachment,
  type DropzoneStoredAttachment,
  type ResponseDataAndStatus,
} from "@setta/app-subsystem-frontend-sdk";
import {
  deleteArtifacts,
  importFilesToArtifacts,
  setParamEnteredValue,
  updateArtifacts,
  updateParamImplConfig,
  uploadBinary,
} from "openapi/http";
import {
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type DragEvent,
  type RefObject,
  type SetStateAction,
} from "react";
import { FiUploadCloud } from "react-icons/fi";
import { openDropzoneFilePickerModal } from "state/actions/modal";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
  getCurrSectionVariantId,
  setCurrEffectiveCodeObjImplValue,
} from "state/actions/sectionInfos";
import { useProjectState, useShareSession } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  DropzoneConfigForFrontend,
  useParamCodeObjUIConfig,
} from "state/hooks/uiTypes";
import { SETTA_PREVENT_SECTION_ACTIVE_CSS } from "utils/constants";
import {
  ArtifactTypeEnum,
  CodeObjTypeEnum,
  DropzoneModeEnum,
  DropzoneParamCodeObjImpl,
  FileArtifact,
  NotificationTypeEnum,
  type ContentRef,
} from "utils/generatedTypes";
import type { ParamValueChange } from "./ConfiguredParamInputs";
type DropzoneInputTheme = {
  wrapperBaseClassName?: string;
  dragActiveClassName?: string;
  controlsRowClassName?: string;
  controlButtonClassName?: string;
  uploadingTextClassName?: string;
  attachmentsContainerClassName?: string;
  attachmentSizeTextClassName?: string;
  deleteButtonClassName?: string;
};
type DropzoneInputProps = {
  sectionId?: string;
  paramInfoId?: string;
  value: string;
  onChange?: ParamValueChange;
  onStatelessDrop?: (attachments: DropzoneStatelessAttachment[]) => void;
  placeholder?: string;
  className?: string;
  isDisabled?: boolean;
  mode?: DropzoneModeEnum;
  maxAttachments?: number | null;
  theme?: DropzoneInputTheme;
};
type DropzoneStatelessDisplayAttachment =
  | {
      kind: "file";
      name: string;
      size: number;
    }
  | {
      kind: "text";
      name: string;
      text: string;
    };
type DropzoneDisplayAttachment = {
  key: string;
  name: string;
  kind: DropzoneStatelessDisplayAttachment["kind"];
  size: number | null;
  id: string | null;
};
type DropzoneClassNames = {
  wrapper: string;
  controlsRow: string;
  controlButton: string;
  uploadingText: string;
  attachmentsContainer: string;
  attachmentSizeText: string;
  deleteButton: string;
};
type DropzoneAttachmentPolicy = ReturnType<typeof getAttachmentPolicy>;
type DropzoneCommitContext = {
  onChange?: ParamValueChange;
  sectionId?: string;
  paramInfoId?: string;
  sectionVariantId: string;
};
type DropzoneActionContext = {
  isDisabled: boolean;
  isUploading: boolean;
  mode: DropzoneModeEnum;
  hasInvalidStatefulValue: boolean;
  remainingSlots: number | null;
  value: string;
  statefulAttachments: DropzoneStoredAttachment[];
  dropzonePolicy: DropzoneAttachmentPolicy;
  statelessDisplayLimit: number;
  isDeploymentMode: boolean;
  onChange?: ParamValueChange;
  onStatelessDrop?: (attachments: DropzoneStatelessAttachment[]) => void;
  commitContext: DropzoneCommitContext;
  setIsUploading: Dispatch<SetStateAction<boolean>>;
  setStatelessAttachments: Dispatch<
    SetStateAction<DropzoneStatelessDisplayAttachment[]>
  >;
};
type DropzoneFileReadResult = {
  file: File;
  buffer: ArrayBuffer;
  contentId: string;
};
type DropzoneUploadedFile = {
  file: File;
  ref: FileArtifact["value"];
};
const DROPZONE_STATEFUL_POLICY = getAttachmentPolicy("dropzone_stateful");
const DROPZONE_STATELESS_POLICY = getAttachmentPolicy("dropzone_stateless");
const DROPZONE_STATELESS_DISPLAY_LIMIT = 5;
const DEFAULT_DROPZONE_WRAPPER_CLASS_NAME =
  "flex h-full w-full flex-1 items-center justify-center gap-2 rounded-xl border-4 border-dashed border-setta-300 bg-setta-50/70 px-4 py-3 text-center text-xs font-bold uppercase tracking-widest text-setta-500/80 dark:border-setta-700 dark:bg-setta-900/50 dark:text-setta-500";
const DEFAULT_DROPZONE_DRAG_ACTIVE_CLASS_NAME =
  "border-emerald-500 bg-emerald-200/80 text-emerald-900 ring-4 ring-emerald-400/60 shadow-[0_0_0_6px_rgba(16,185,129,0.15)] dark:border-emerald-300 dark:bg-emerald-500/30 dark:text-emerald-100 dark:ring-emerald-300/60 dark:shadow-[0_0_0_6px_rgba(16,185,129,0.25)]";
const DEFAULT_DROPZONE_CONTROLS_ROW_CLASS_NAME =
  "flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-setta-400";
const DEFAULT_DROPZONE_CONTROL_BUTTON_CLASS_NAME =
  "rounded-full border border-setta-200 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-setta-400 hover:border-setta-400 hover:text-setta-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-setta-800 dark:text-setta-500 dark:hover:border-setta-600 dark:hover:text-setta-300";
const DEFAULT_DROPZONE_UPLOADING_TEXT_CLASS_NAME =
  "text-[10px] font-semibold uppercase tracking-widest text-setta-300";
const DEFAULT_DROPZONE_ATTACHMENTS_CONTAINER_CLASS_NAME =
  "flex flex-col gap-2 rounded-lg border border-setta-200/70 bg-white/60 p-2 text-[11px] text-setta-600 dark:border-setta-800 dark:bg-setta-900/40 dark:text-setta-400";
const DEFAULT_DROPZONE_ATTACHMENT_SIZE_TEXT_CLASS_NAME =
  "text-[10px] uppercase tracking-wide text-setta-400";
const DEFAULT_DROPZONE_DELETE_BUTTON_CLASS_NAME =
  "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-setta-400 hover:bg-setta-100 hover:text-setta-600 dark:hover:bg-setta-850 dark:hover:text-setta-200";
type BinaryUploadRouteResponse = ResponseDataAndStatus<ContentRef>;
function resolveDropzonePolicy(mode: DropzoneModeEnum) {
  if (mode === DropzoneModeEnum.STATELESS) {
    return DROPZONE_STATELESS_POLICY;
  }
  return DROPZONE_STATEFUL_POLICY;
}
function notifyOversizedFiles(files: File[], limitLabel: string): void {
  if (files.length === 0) {
    return;
  }
  const names = files.slice(0, 3).map((file) => file.name);
  let message = "";
  if (files.length === 1) {
    message = `File "${names[0]}" exceeds the ${limitLabel} limit.`;
  } else {
    const suffix =
      files.length > names.length
        ? ` +${files.length - names.length} more`
        : "";
    message = `Skipped ${files.length} files over ${limitLabel}: ${names.join(", ")}${suffix}.`;
  }
  addTemporaryNotification(message, NotificationTypeEnum.warning);
}
function notifyReadFailures(files: File[]): void {
  if (files.length === 0) {
    return;
  }
  const names = files.slice(0, 3).map((file) => file.name);
  const suffix =
    files.length > names.length ? ` +${files.length - names.length} more` : "";
  const noun = files.length === 1 ? "file" : "files";
  const message = `Failed to read ${files.length} ${noun}: ${names.join(", ")}${suffix}.`;
  addTemporaryNotification(message, NotificationTypeEnum.warning);
}
function notifyUploadFailures(files: File[]): void {
  if (files.length === 0) {
    return;
  }
  const names = files.slice(0, 3).map((file) => file.name);
  const suffix =
    files.length > names.length ? ` +${files.length - names.length} more` : "";
  const noun = files.length === 1 ? "file" : "files";
  const message = `Failed to upload ${files.length} ${noun}: ${names.join(", ")}${suffix}.`;
  addTemporaryNotification(message, NotificationTypeEnum.warning);
}
function notifyStatelessPayloadLimit(files: File[], limitLabel: string): void {
  if (files.length === 0) {
    return;
  }
  const names = files.slice(0, 3).map((file) => file.name);
  if (files.length === 1) {
    const message = `File "${names[0]}" would exceed the ${limitLabel} total payload limit.`;
    addTemporaryNotification(message, NotificationTypeEnum.warning);
    return;
  }
  const suffix =
    files.length > names.length ? ` +${files.length - names.length} more` : "";
  const message = `Skipped ${files.length} files to stay under ${limitLabel} total payload: ${names.join(", ")}${suffix}.`;
  addTemporaryNotification(message, NotificationTypeEnum.warning);
}
function notifyStatelessTextPayloadLimit(limitLabel: string): void {
  const message = `Dropped text exceeds the ${limitLabel} total payload limit.`;
  addTemporaryNotification(message, NotificationTypeEnum.warning);
}
function notifyDisallowedMime(files: File[], allowedLabel: string): void {
  if (files.length === 0) {
    return;
  }
  const prefix =
    files.length === 1
      ? "A file was skipped due to type restrictions."
      : "Some files were skipped due to type restrictions.";
  const message = `${prefix} ${allowedLabel}`.trim();
  addTemporaryNotification(message, NotificationTypeEnum.warning);
}
function notifyInvalidStatefulValue(): void {
  const message =
    "Dropzone value is not valid JSON. Clear it before adding attachments.";
  addTemporaryNotification(message, NotificationTypeEnum.warning);
}
function splitFilesBySize(
  files: File[],
  maxBytes: number,
): {
  accepted: File[];
  rejected: File[];
} {
  const accepted: File[] = [];
  const rejected: File[] = [];
  for (const file of files) {
    if (file.size > maxBytes) {
      rejected.push(file);
      continue;
    }
    accepted.push(file);
  }
  return { accepted, rejected };
}
function getUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}
function resolveAttachmentLimit(
  maxAttachments: number | null | undefined,
): number | null {
  if (maxAttachments === null || maxAttachments === undefined) {
    return null;
  }
  if (Number.isNaN(maxAttachments)) {
    return null;
  }
  const limit = Math.floor(maxAttachments);
  return limit < 1 ? null : limit;
}
function resolveStatelessDisplayLimit(attachmentLimit: number | null): number {
  return attachmentLimit ?? DROPZONE_STATELESS_DISPLAY_LIMIT;
}
function getCurrentAttachmentCount(
  mode: DropzoneModeEnum,
  statefulAttachments: DropzoneStoredAttachment[],
): number {
  return mode === DropzoneModeEnum.STATELESS ? 0 : statefulAttachments.length;
}
function getRemainingSlots(
  attachmentLimit: number | null,
  currentCount: number,
): number | null {
  if (attachmentLimit === null) {
    return null;
  }
  if (attachmentLimit <= currentCount) {
    return 0;
  }
  return attachmentLimit - currentCount;
}
function hasRemainingAttachmentCapacity(
  remainingSlots: number | null,
): boolean {
  return remainingSlots === null || remainingSlots > 0;
}
function canUseServerFilePicker(
  isDeploymentMode: boolean,
  mode: DropzoneModeEnum,
): boolean {
  return !isDeploymentMode && mode === DropzoneModeEnum.STATEFUL;
}
function resolveDisplayAttachments(
  mode: DropzoneModeEnum,
  statelessAttachments: DropzoneStatelessDisplayAttachment[],
  statefulAttachments: DropzoneStoredAttachment[],
): DropzoneDisplayAttachment[] {
  if (mode === DropzoneModeEnum.STATELESS) {
    return statelessAttachments.map((attachment, index) => ({
      key: `${attachment.kind}-${index}`,
      name: attachment.name,
      kind: attachment.kind,
      size: attachment.kind === "file" ? attachment.size : null,
      id: null,
    }));
  }
  return statefulAttachments.map((attachment, index) => ({
    key:
      attachment.kind === "file" ? attachment.id : `${attachment.id}-${index}`,
    name: attachment.name,
    kind: attachment.kind,
    size: attachment.kind === "file" ? attachment.size ?? null : null,
    id: attachment.id,
  }));
}
function appendLimitedStatelessAttachments(
  previous: DropzoneStatelessDisplayAttachment[],
  incoming: DropzoneStatelessDisplayAttachment[],
  limit: number,
): DropzoneStatelessDisplayAttachment[] {
  const next = [...previous, ...incoming];
  return next.length <= limit ? next : next.slice(-limit);
}
function splitFilesByTotalBytes(
  files: File[],
  maxBytes: number,
): {
  accepted: File[];
  rejected: File[];
} {
  const accepted: File[] = [];
  const rejected: File[] = [];
  let totalBytes = 0;
  for (const file of files) {
    if (totalBytes + file.size > maxBytes) {
      rejected.push(file);
      continue;
    }
    totalBytes += file.size;
    accepted.push(file);
  }
  return { accepted, rejected };
}
function resolveDropzoneLabel(
  placeholder: string,
  attachments: DropzoneDisplayAttachment[],
  mode: DropzoneModeEnum,
): string {
  if (attachments.length === 0) {
    return placeholder;
  }
  const suffix = attachments.length === 1 ? "" : "s";
  if (mode === DropzoneModeEnum.STATELESS) {
    return `Recent drop${suffix}`;
  }
  return `${attachments.length} attachment${suffix}`;
}
function resolveThemedClassName(
  value: string | undefined,
  fallback: string,
): string {
  return value ?? fallback;
}
function resolveDropzoneWrapperClassName(
  theme: DropzoneInputTheme | undefined,
  isDragActive: boolean,
  isDisabled: boolean,
  className: string | undefined,
): string {
  const disabledClassName = isDisabled ? "opacity-60" : "";
  const baseClassName = resolveThemedClassName(
    theme?.wrapperBaseClassName,
    DEFAULT_DROPZONE_WRAPPER_CLASS_NAME,
  );
  const dragActiveClassName = isDragActive
    ? resolveThemedClassName(
        theme?.dragActiveClassName,
        DEFAULT_DROPZONE_DRAG_ACTIVE_CLASS_NAME,
      )
    : "";
  return `${SETTA_PREVENT_SECTION_ACTIVE_CSS} section-value ${baseClassName} ${dragActiveClassName} ${disabledClassName} ${className ?? ""}`.trim();
}
function resolveDropzoneClassNames(
  theme: DropzoneInputTheme | undefined,
  isDragActive: boolean,
  isDisabled: boolean,
  className: string | undefined,
): DropzoneClassNames {
  return {
    wrapper: resolveDropzoneWrapperClassName(
      theme,
      isDragActive,
      isDisabled,
      className,
    ),
    controlsRow: resolveThemedClassName(
      theme?.controlsRowClassName,
      DEFAULT_DROPZONE_CONTROLS_ROW_CLASS_NAME,
    ),
    controlButton: resolveThemedClassName(
      theme?.controlButtonClassName,
      DEFAULT_DROPZONE_CONTROL_BUTTON_CLASS_NAME,
    ),
    uploadingText: resolveThemedClassName(
      theme?.uploadingTextClassName,
      DEFAULT_DROPZONE_UPLOADING_TEXT_CLASS_NAME,
    ),
    attachmentsContainer: resolveThemedClassName(
      theme?.attachmentsContainerClassName,
      DEFAULT_DROPZONE_ATTACHMENTS_CONTAINER_CLASS_NAME,
    ),
    attachmentSizeText: resolveThemedClassName(
      theme?.attachmentSizeTextClassName,
      DEFAULT_DROPZONE_ATTACHMENT_SIZE_TEXT_CLASS_NAME,
    ),
    deleteButton: resolveThemedClassName(
      theme?.deleteButtonClassName,
      DEFAULT_DROPZONE_DELETE_BUTTON_CLASS_NAME,
    ),
  };
}
function hasInvalidStatefulDropzoneValue(
  mode: DropzoneModeEnum,
  value: string,
  parsedStatefulValue: ReturnType<typeof parseDropzoneValue>,
): boolean {
  return (
    mode === DropzoneModeEnum.STATEFUL &&
    value.trim() !== "" &&
    parsedStatefulValue === null
  );
}
function canStartDropzoneAction(
  isDisabled: boolean,
  isUploading: boolean,
): boolean {
  return !isDisabled && !isUploading;
}
function ensureValidStatefulValue(
  mode: DropzoneModeEnum,
  hasInvalidStatefulValue: boolean,
): boolean {
  if (mode !== DropzoneModeEnum.STATEFUL || !hasInvalidStatefulValue) {
    return true;
  }
  notifyInvalidStatefulValue();
  return false;
}
function limitItemsToRemainingSlots<T>(
  items: T[],
  remainingSlots: number | null,
): T[] {
  return remainingSlots === null ? items : items.slice(0, remainingSlots);
}
function splitFilesByMimePolicy(
  files: File[],
  policy: DropzoneAttachmentPolicy,
): {
  accepted: File[];
  rejected: File[];
} {
  const accepted: File[] = [];
  const rejected: File[] = [];
  for (const file of files) {
    const mimeType = file.type || "application/octet-stream";
    if (!isAttachmentMimeAllowed(mimeType, policy)) {
      rejected.push(file);
      continue;
    }
    accepted.push(file);
  }
  return { accepted, rejected };
}
function enforceStatelessPayloadLimit(
  files: File[],
  policy: DropzoneAttachmentPolicy,
): File[] {
  const maxTotalBytes = policy.maxTotalBytes;
  if (maxTotalBytes === null) {
    return files;
  }
  const maxTotalLabel = policy.maxTotalLabel ?? formatBytes(maxTotalBytes);
  const { accepted, rejected } = splitFilesByTotalBytes(files, maxTotalBytes);
  if (rejected.length > 0) {
    notifyStatelessPayloadLimit(rejected, maxTotalLabel);
  }
  return accepted;
}
function resolveAllowedLocalFiles(
  files: File[],
  remainingSlots: number | null,
  policy: DropzoneAttachmentPolicy,
  mode: DropzoneModeEnum,
): File[] {
  const { accepted, rejected } = splitFilesBySize(files, policy.maxFileBytes);
  if (rejected.length > 0) {
    notifyOversizedFiles(rejected, policy.maxFileLabel);
  }
  const slottedFiles = limitItemsToRemainingSlots(accepted, remainingSlots);
  if (slottedFiles.length === 0) {
    return [];
  }
  const { accepted: allowedFiles, rejected: rejectedByType } =
    splitFilesByMimePolicy(slottedFiles, policy);
  if (rejectedByType.length > 0) {
    notifyDisallowedMime(rejectedByType, policy.allowedMimeLabel);
  }
  if (mode !== DropzoneModeEnum.STATELESS) {
    return allowedFiles;
  }
  return enforceStatelessPayloadLimit(allowedFiles, policy);
}
async function partitionSettledFileResults<T>(
  files: File[],
  loader: (file: File) => Promise<T>,
): Promise<{
  successful: Array<{
    file: File;
    value: T;
  }>;
  failedFiles: File[];
}> {
  const results = await Promise.allSettled(files.map((file) => loader(file)));
  const successful: Array<{ file: File; value: T }> = [];
  const failedFiles: File[] = [];
  results.forEach((result, index) => {
    const file = files[index];
    if (!file) {
      return;
    }
    if (result.status === "fulfilled") {
      successful.push({ file, value: result.value });
      return;
    }
    failedFiles.push(file);
  });
  return { successful, failedFiles };
}
async function readStatelessLocalFiles(files: File[]): Promise<{
  successful: DropzoneFileReadResult[];
  failedFiles: File[];
}> {
  const { successful, failedFiles } = await partitionSettledFileResults(
    files,
    async (file) => ({
      buffer: await file.arrayBuffer(),
      contentId: createNewId(),
    }),
  );
  return {
    successful: successful.map(({ file, value }) => ({
      file,
      buffer: value.buffer,
      contentId: value.contentId,
    })),
    failedFiles,
  };
}
function buildStatelessFileAttachments(successful: DropzoneFileReadResult[]): {
  attachments: DropzoneStatelessAttachment[];
  displayAttachments: DropzoneStatelessDisplayAttachment[];
} {
  return {
    attachments: successful.map(({ file, buffer, contentId }) => ({
      kind: "file",
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      contentId,
      byteLength: buffer.byteLength,
      binaryPayload: buffer,
    })),
    displayAttachments: successful.map(({ file }) => ({
      kind: "file",
      name: file.name,
      size: file.size,
    })),
  };
}
async function uploadLocalFilesToContentRefs(files: File[]): Promise<{
  successfulUploads: DropzoneUploadedFile[];
  failedUploads: File[];
}> {
  const { successful, failedFiles } = await partitionSettledFileResults(
    files,
    async (file) => {
      const res = (await callOpenAPI(
        uploadBinary({
          body: {
            durable: false,
            file,
          },
        } as Parameters<typeof uploadBinary>[0]),
      )) as BinaryUploadRouteResponse;
      if (!res200(res) || !res.data) {
        throw new Error("Upload failed");
      }
      return res.data;
    },
  );
  return {
    successfulUploads: successful.map(({ file, value }) => ({
      file,
      ref: value,
    })),
    failedUploads: failedFiles,
  };
}
function buildStatefulUploadPayload(
  successfulUploads: DropzoneUploadedFile[],
  isDeploymentMode: boolean,
): {
  artifacts: FileArtifact[];
  fileIds: string[];
  newAttachments: DropzoneStoredAttachment[];
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
    fileIds,
    newAttachments: successfulUploads.map(({ file }, index) => ({
      kind: "file",
      id: fileIds[index],
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    })),
  };
}
async function persistStatelessLocalFiles(
  context: DropzoneActionContext,
  allowedFiles: File[],
): Promise<void> {
  const { successful, failedFiles } =
    await readStatelessLocalFiles(allowedFiles);
  if (failedFiles.length > 0) {
    notifyReadFailures(failedFiles);
  }
  if (successful.length === 0) {
    return;
  }
  const { attachments, displayAttachments } =
    buildStatelessFileAttachments(successful);
  context.setStatelessAttachments((previous) =>
    appendLimitedStatelessAttachments(
      previous,
      displayAttachments,
      context.statelessDisplayLimit,
    ),
  );
  context.onStatelessDrop?.(attachments);
}
async function persistStatefulLocalFiles(
  context: DropzoneActionContext,
  allowedFiles: File[],
): Promise<void> {
  if (!context.onChange) {
    return;
  }
  const { successfulUploads, failedUploads } =
    await uploadLocalFilesToContentRefs(allowedFiles);
  if (failedUploads.length > 0) {
    notifyUploadFailures(failedUploads);
  }
  if (successfulUploads.length === 0) {
    return;
  }
  const { artifacts, fileIds, newAttachments } = buildStatefulUploadPayload(
    successfulUploads,
    context.isDeploymentMode,
  );
  const res = await callOpenAPI(
    updateArtifacts({
      body: {
        artifacts,
        uploadScope: "generic",
      },
    } as Parameters<typeof updateArtifacts>[0]),
  );
  if (!res200(res)) {
    const detail = getErrorDetail(res.data);
    const message = detail ?? "Failed to upload attachments.";
    addTemporaryNotification(message, NotificationTypeEnum.warning);
    return;
  }
  const updatedValue = serializeDropzoneValue([
    ...context.statefulAttachments,
    ...newAttachments,
  ]);
  await commitStatefulValueUpdate(
    context.commitContext,
    updatedValue,
    context.value,
    fileIds,
  );
}
async function handleLocalFilesAction(
  context: DropzoneActionContext,
  files: File[],
): Promise<void> {
  if (!canStartDropzoneAction(context.isDisabled, context.isUploading)) {
    return;
  }
  if (files.length === 0) {
    return;
  }
  if (
    !ensureValidStatefulValue(context.mode, context.hasInvalidStatefulValue)
  ) {
    return;
  }
  if (context.remainingSlots === 0) {
    return;
  }
  const allowedFiles = resolveAllowedLocalFiles(
    files,
    context.remainingSlots,
    context.dropzonePolicy,
    context.mode,
  );
  if (allowedFiles.length === 0) {
    return;
  }
  context.setIsUploading(true);
  try {
    if (context.mode === DropzoneModeEnum.STATELESS) {
      await persistStatelessLocalFiles(context, allowedFiles);
      return;
    }
    await persistStatefulLocalFiles(context, allowedFiles);
  } finally {
    context.setIsUploading(false);
  }
}
function statelessTextFitsPayloadLimit(
  text: string,
  policy: DropzoneAttachmentPolicy,
): boolean {
  const maxTotalBytes = policy.maxTotalBytes;
  if (maxTotalBytes === null) {
    return true;
  }
  if (getUtf8ByteLength(text) <= maxTotalBytes) {
    return true;
  }
  const maxTotalLabel = policy.maxTotalLabel ?? formatBytes(maxTotalBytes);
  notifyStatelessTextPayloadLimit(maxTotalLabel);
  return false;
}
function appendStatelessTextAttachment(
  text: string,
  statelessDisplayLimit: number,
  setStatelessAttachments: DropzoneActionContext["setStatelessAttachments"],
  onStatelessDrop?: DropzoneActionContext["onStatelessDrop"],
): void {
  const attachment: DropzoneStatelessAttachment = {
    kind: "text",
    name: "Dropped text",
    text,
  };
  const displayAttachment: DropzoneStatelessDisplayAttachment = {
    kind: "text",
    name: "Dropped text",
    text,
  };
  setStatelessAttachments((previous) =>
    appendLimitedStatelessAttachments(
      previous,
      [displayAttachment],
      statelessDisplayLimit,
    ),
  );
  onStatelessDrop?.([attachment]);
}
async function handleTextDropAction(
  context: DropzoneActionContext,
  text: string,
): Promise<void> {
  if (!canStartDropzoneAction(context.isDisabled, context.isUploading)) {
    return;
  }
  if (
    !ensureValidStatefulValue(context.mode, context.hasInvalidStatefulValue)
  ) {
    return;
  }
  if (context.remainingSlots === 0) {
    return;
  }
  if (context.mode === DropzoneModeEnum.STATELESS) {
    if (!statelessTextFitsPayloadLimit(text, context.dropzonePolicy)) {
      return;
    }
    appendStatelessTextAttachment(
      text,
      context.statelessDisplayLimit,
      context.setStatelessAttachments,
      context.onStatelessDrop,
    );
    return;
  }
  if (!context.onChange) {
    return;
  }
  const attachment: DropzoneStoredAttachment = {
    kind: "text",
    id: createDropzoneTextAttachmentId(),
    name: "Dropped text",
    text,
  };
  const updatedValue = serializeDropzoneValue([
    ...context.statefulAttachments,
    attachment,
  ]);
  await commitStatefulValueUpdate(
    context.commitContext,
    updatedValue,
    context.value,
    [],
  );
}
async function handleServerFilePathsAction(
  context: DropzoneActionContext,
  paths: string[],
): Promise<void> {
  if (!canStartDropzoneAction(context.isDisabled, context.isUploading)) {
    return;
  }
  if (context.mode === DropzoneModeEnum.STATELESS) {
    return;
  }
  if (
    !ensureValidStatefulValue(context.mode, context.hasInvalidStatefulValue)
  ) {
    return;
  }
  if (!context.onChange || context.remainingSlots === 0) {
    return;
  }
  const allowedPaths = limitItemsToRemainingSlots(
    paths,
    context.remainingSlots,
  );
  if (allowedPaths.length === 0) {
    return;
  }
  context.setIsUploading(true);
  try {
    const res = await callOpenAPI(
      importFilesToArtifacts({
        body: {
          paths: allowedPaths,
          uploadScope: "generic",
        },
      } as Parameters<typeof importFilesToArtifacts>[0]),
    );
    if (!res200(res)) {
      const detail = getErrorDetail(res.data);
      const message =
        detail ?? "Failed to import server files into attachments.";
      addTemporaryNotification(message, NotificationTypeEnum.warning);
      return;
    }
    const newAttachments: DropzoneStoredAttachment[] = res.data.map((item) => ({
      kind: "file",
      id: item.id,
      name: item.name,
      mimeType: item.mimeType,
      size: item.size,
    }));
    const updatedValue = serializeDropzoneValue([
      ...context.statefulAttachments,
      ...newAttachments,
    ]);
    const artifactIds = newAttachments
      .map((attachment) => attachment.id)
      .filter((id): id is string => id !== null);
    await commitStatefulValueUpdate(
      context.commitContext,
      updatedValue,
      context.value,
      artifactIds,
    );
  } finally {
    context.setIsUploading(false);
  }
}
async function deleteFileAttachment(artifactId: string): Promise<boolean> {
  const res = await callOpenAPI(
    deleteArtifacts({
      body: {
        artifacts: [
          {
            id: artifactId,
            type: ArtifactTypeEnum.File,
          },
        ],
      },
    } as Parameters<typeof deleteArtifacts>[0]),
  );
  if (!res200(res)) {
    const detail = getErrorDetail(res.data);
    const message = detail ?? "Failed to delete attachment.";
    addTemporaryNotification(message, NotificationTypeEnum.warning);
    return false;
  }
  return true;
}
async function handleDeleteStatefulAttachmentAction(
  commitContext: DropzoneCommitContext,
  statefulAttachments: DropzoneStoredAttachment[],
  value: string,
  attachmentId: string,
  attachmentKind: DropzoneStoredAttachment["kind"],
): Promise<void> {
  const nextAttachments = statefulAttachments.filter(
    (item) => item.id !== attachmentId,
  );
  const updatedValue = serializeDropzoneValue(nextAttachments);
  const committed = await commitStatefulValueUpdate(
    commitContext,
    updatedValue,
    value,
    [],
  );
  if (!committed || attachmentKind !== "file") {
    return;
  }
  await deleteFileAttachment(attachmentId);
}
type DropzoneUiHandlers = {
  handleLocalFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  openLocalFilePicker: () => void;
  openServerFilePicker: () => void;
  handleDrop: (event: DragEvent<HTMLDivElement>) => Promise<void>;
  handleDragOver: (event: DragEvent<HTMLDivElement>) => void;
  handleDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  handleDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  handleDeleteAttachment: (
    attachmentId: string,
    attachmentKind: DropzoneStoredAttachment["kind"],
  ) => Promise<void>;
};
type CreateDropzoneUiHandlersArgs = {
  actionContext: DropzoneActionContext;
  canAttachMore: boolean;
  canUseServerPicker: boolean;
  remainingSlots: number | null;
  isDragActive: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  dragDepth: RefObject<number>;
  setIsDragActive: Dispatch<SetStateAction<boolean>>;
  statefulAttachments: DropzoneStoredAttachment[];
  value: string;
};
function resolveDroppedText(event: DragEvent<HTMLDivElement>): string {
  const text = event.dataTransfer.getData("text/plain");
  return text || event.dataTransfer.getData("text");
}
function createDropzoneUiHandlers({
  actionContext,
  canAttachMore,
  canUseServerPicker,
  remainingSlots,
  isDragActive,
  fileInputRef,
  dragDepth,
  setIsDragActive,
  statefulAttachments,
  value,
}: CreateDropzoneUiHandlersArgs): DropzoneUiHandlers {
  return {
    handleLocalFileInputChange(event) {
      const files = event.target.files ? Array.from(event.target.files) : [];
      event.target.value = "";
      void handleLocalFilesAction(actionContext, files);
    },
    openLocalFilePicker() {
      if (
        !canStartDropzoneAction(
          actionContext.isDisabled,
          actionContext.isUploading,
        )
      ) {
        return;
      }
      if (!canAttachMore) {
        return;
      }
      fileInputRef.current?.click();
    },
    openServerFilePicker() {
      if (!canUseServerPicker) {
        return;
      }
      if (
        !canStartDropzoneAction(
          actionContext.isDisabled,
          actionContext.isUploading,
        )
      ) {
        return;
      }
      if (!canAttachMore) {
        return;
      }
      openDropzoneFilePickerModal({
        title: "Attach Server File",
        remainingSlots,
        onPickPaths: (paths) => {
          void handleServerFilePathsAction(actionContext, paths);
        },
      });
    },
    async handleDrop(event) {
      event.preventDefault();
      dragDepth.current = 0;
      setIsDragActive(false);
      if (
        !canStartDropzoneAction(
          actionContext.isDisabled,
          actionContext.isUploading,
        )
      ) {
        return;
      }
      const files = Array.from(event.dataTransfer.files);
      if (files.length > 0) {
        await handleLocalFilesAction(actionContext, files);
        return;
      }
      const droppedText = resolveDroppedText(event);
      if (droppedText) {
        await handleTextDropAction(actionContext, droppedText);
      }
    },
    handleDragOver(event) {
      event.preventDefault();
      if (actionContext.isDisabled || isDragActive) {
        return;
      }
      setIsDragActive(true);
    },
    handleDragEnter(event) {
      event.preventDefault();
      if (actionContext.isDisabled) {
        return;
      }
      dragDepth.current += 1;
      setIsDragActive(true);
    },
    handleDragLeave(event) {
      event.preventDefault();
      if (actionContext.isDisabled) {
        return;
      }
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) {
        setIsDragActive(false);
      }
    },
    async handleDeleteAttachment(attachmentId, attachmentKind) {
      await handleDeleteStatefulAttachmentAction(
        actionContext.commitContext,
        statefulAttachments,
        value,
        attachmentId,
        attachmentKind,
      );
    },
  };
}
function DropzoneAttachmentList({
  attachments,
  classNames,
  mode,
  isDisabled,
  onDeleteAttachment,
}: {
  attachments: DropzoneDisplayAttachment[];
  classNames: DropzoneClassNames;
  mode: DropzoneModeEnum;
  isDisabled: boolean;
  onDeleteAttachment: DropzoneUiHandlers["handleDeleteAttachment"];
}) {
  if (attachments.length === 0) {
    return null;
  }
  return (
    <div className={classNames.attachmentsContainer}>
      {attachments.map((attachment) => (
        <div
          key={attachment.key}
          className="flex items-center justify-between gap-2"
        >
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-semibold">{attachment.name}</span>
            {attachment.size !== null && attachment.size !== undefined && (
              <span className={classNames.attachmentSizeText}>
                {formatBytes(attachment.size)}
              </span>
            )}
          </div>
          {mode !== DropzoneModeEnum.STATELESS && (
            <button
              type="button"
              className={classNames.deleteButton}
              onClick={() => {
                if (isDisabled || !attachment.id) {
                  return;
                }
                void onDeleteAttachment(attachment.id, attachment.kind);
              }}
              disabled={isDisabled}
            >
              Delete
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
async function commitStatefulValueUpdate(
  context: DropzoneCommitContext,
  updatedValue: string,
  previousValue: string,
  artifactIds: string[],
): Promise<boolean> {
  if (!context.onChange) {
    return false;
  }
  if (!context.sectionId || !context.paramInfoId) {
    context.onChange(updatedValue);
    return true;
  }
  context.onChange(updatedValue, { skipBackendUpdate: true });
  const res = await callOpenAPI(
    setParamEnteredValue({
      body: {
        projectConfigId: getCurrProjectConfigId(),
        sectionId: context.sectionId,
        sectionVariantId: context.sectionVariantId,
        paramInfoId: context.paramInfoId,
        value: updatedValue,
        frontendOpId: null,
      },
    } as Parameters<typeof setParamEnteredValue>[0]),
  );
  if (res200(res)) {
    return true;
  }
  const detail = getErrorDetail(res.data);
  const message = detail ?? "Failed to update attachments.";
  addTemporaryNotification(message, NotificationTypeEnum.warning);
  if (artifactIds.length > 0) {
    const deleteRes = await callOpenAPI(
      deleteArtifacts({
        body: {
          artifacts: artifactIds.map((artifactId) => ({
            id: artifactId,
            type: ArtifactTypeEnum.File,
          })),
        },
      } as Parameters<typeof deleteArtifacts>[0]),
    );
    if (!res200(deleteRes)) {
      const deleteDetail = getErrorDetail(deleteRes.data);
      const deleteMessage =
        deleteDetail ?? "Failed to clean up uploaded attachments.";
      addTemporaryNotification(deleteMessage, NotificationTypeEnum.warning);
    }
  }
  context.onChange(previousValue, { skipBackendUpdate: true });
  return false;
}
export function DropzoneInputConfigForParam({
  sectionId,
  paramInfoId,
}: {
  sectionId: string;
  paramInfoId: string;
}) {
  const { canEditStructure } = useShareCapabilities();
  const config = useParamCodeObjUIConfig(
    sectionId,
    paramInfoId,
    CodeObjTypeEnum.DropzoneParam,
  );
  function onChange(newConfig: DropzoneConfigForFrontend) {
    if (!canEditStructure) {
      return;
    }
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveCodeObjImplValue<DropzoneParamCodeObjImpl>(
          state,
          sectionId,
          paramInfoId,
          newConfig,
        );
      },
      send: (frontendOpId) =>
        callOpenAPI(
          updateParamImplConfig({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              sectionId,
              paramInfoId,
              newConfig,
              frontendOpId,
            },
          } as Parameters<typeof updateParamImplConfig>[0]),
        ),
    });
  }
  return (
    <DropzoneInputConfig
      config={config}
      onChange={onChange}
      isDisabled={!canEditStructure}
    />
  );
}
function DropzoneInputConfig({
  config,
  onChange,
  isDisabled,
}: {
  config: DropzoneConfigForFrontend;
  onChange: (nextConfig: DropzoneConfigForFrontend) => void;
  isDisabled: boolean;
}) {
  function applyConfigUpdate(update: Partial<DropzoneConfigForFrontend>): void {
    onChange({ ...config, ...update });
  }
  const mode = config.mode ?? DropzoneModeEnum.STATEFUL;
  const placeholderValue = config.placeholder ?? "";
  let maxAttachments = "";
  if (
    config.maxAttachments !== null &&
    config.maxAttachments !== undefined &&
    config.maxAttachments > 0
  ) {
    maxAttachments = config.maxAttachments;
  }
  function handleModeChange(event: ChangeEvent<HTMLSelectElement>) {
    applyConfigUpdate({ mode: event.target.value as DropzoneModeEnum });
  }
  function handleMaxAttachmentsChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    if (raw.trim() === "") {
      applyConfigUpdate({ maxAttachments: null });
      return;
    }
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      applyConfigUpdate({ maxAttachments: null });
      return;
    }
    applyConfigUpdate({ maxAttachments: parsed });
  }
  function handlePlaceholderChange(event: ChangeEvent<HTMLInputElement>) {
    applyConfigUpdate({ placeholder: event.target.value });
  }
  return (
    <div className="flex flex-col gap-3 text-xs text-setta-600 dark:text-setta-300">
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.2em] text-setta-400">
          Placeholder
        </span>
        <input
          type="text"
          className="h-8 rounded-lg border border-setta-200 bg-white px-2 text-xs font-semibold text-setta-700 dark:border-setta-800 dark:bg-setta-900 dark:text-setta-200"
          value={placeholderValue}
          onChange={handlePlaceholderChange}
          placeholder="Drop a file here"
          disabled={isDisabled}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.2em] text-setta-400">
          Mode
        </span>
        <select
          className="h-8 rounded-lg border border-setta-200 bg-white px-2 text-xs font-semibold text-setta-700 dark:border-setta-800 dark:bg-setta-900 dark:text-setta-200"
          value={mode}
          onChange={handleModeChange}
          disabled={isDisabled}
        >
          <option value={DropzoneModeEnum.STATEFUL}>
            Stateful (persisted)
          </option>
          <option value={DropzoneModeEnum.STATELESS}>
            Stateless (event-only)
          </option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.2em] text-setta-400">
          Max attachments
        </span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            className="h-8 flex-1 rounded-lg border border-setta-200 bg-white px-2 text-xs font-semibold text-setta-700 dark:border-setta-800 dark:bg-setta-900 dark:text-setta-200"
            placeholder="No limit"
            value={maxAttachments}
            onChange={handleMaxAttachmentsChange}
            disabled={isDisabled}
          />
          <button
            type="button"
            className="h-8 rounded-lg border border-setta-200 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-setta-500 hover:bg-setta-100 dark:border-setta-800 dark:text-setta-400 dark:hover:bg-setta-850"
            onClick={() => applyConfigUpdate({ maxAttachments: null })}
            disabled={isDisabled}
          >
            No limit
          </button>
        </div>
      </label>
    </div>
  );
}
type DropzoneInputViewProps = {
  fileInputRef: RefObject<HTMLInputElement | null>;
  classNames: DropzoneClassNames;
  uiHandlers: DropzoneUiHandlers;
  isDisabled: boolean;
  isUploading: boolean;
  canAttachMore: boolean;
  canUseServerPicker: boolean;
  label: string;
  displayAttachments: DropzoneDisplayAttachment[];
  mode: DropzoneModeEnum;
};
function useDropzoneInputController({
  sectionId,
  paramInfoId,
  value,
  onChange,
  onStatelessDrop,
  placeholder = "Drop a file here",
  className,
  isDisabled = false,
  mode = DropzoneModeEnum.STATEFUL,
  maxAttachments = null,
  theme,
}: DropzoneInputProps): DropzoneInputViewProps {
  const [statelessAttachments, setStatelessAttachments] = useState<
    DropzoneStatelessDisplayAttachment[]
  >([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const dragDepth = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { isDeploymentMode } = useShareSession((state) => ({
    isDeploymentMode: state.isDeploymentMode,
  }));
  const sectionVariantId = useProjectState((state) =>
    sectionId ? getCurrSectionVariantId(state, sectionId) : "",
  );
  const dropzonePolicy = resolveDropzonePolicy(mode);
  const parsedStatefulValue = parseDropzoneValue(value);
  const hasInvalidStatefulValue = hasInvalidStatefulDropzoneValue(
    mode,
    value,
    parsedStatefulValue,
  );
  const statefulAttachments: DropzoneStoredAttachment[] =
    parsedStatefulValue?.attachments ?? [];
  const attachmentLimit = resolveAttachmentLimit(maxAttachments);
  const statelessDisplayLimit = resolveStatelessDisplayLimit(attachmentLimit);
  const displayAttachments = resolveDisplayAttachments(
    mode,
    statelessAttachments,
    statefulAttachments,
  );
  const currentCount = getCurrentAttachmentCount(mode, statefulAttachments);
  const remainingSlots = getRemainingSlots(attachmentLimit, currentCount);
  const canAttachMore = hasRemainingAttachmentCapacity(remainingSlots);
  const canUseServerPicker = canUseServerFilePicker(isDeploymentMode, mode);
  const commitContext: DropzoneCommitContext = {
    onChange,
    sectionId,
    paramInfoId,
    sectionVariantId,
  };
  const actionContext: DropzoneActionContext = {
    isDisabled,
    isUploading,
    mode,
    hasInvalidStatefulValue,
    remainingSlots,
    value,
    statefulAttachments,
    dropzonePolicy,
    statelessDisplayLimit,
    isDeploymentMode,
    onChange,
    onStatelessDrop,
    commitContext,
    setIsUploading,
    setStatelessAttachments,
  };
  const uiHandlers = createDropzoneUiHandlers({
    actionContext,
    canAttachMore,
    canUseServerPicker,
    remainingSlots,
    isDragActive,
    fileInputRef,
    dragDepth,
    setIsDragActive,
    statefulAttachments,
    value,
  });
  const label = resolveDropzoneLabel(placeholder, displayAttachments, mode);
  const classNames = resolveDropzoneClassNames(
    theme,
    isDragActive,
    isDisabled,
    className,
  );
  return {
    fileInputRef,
    classNames,
    uiHandlers,
    isDisabled,
    isUploading,
    canAttachMore,
    canUseServerPicker,
    label,
    displayAttachments,
    mode,
  };
}
function DropzoneInputView({
  fileInputRef,
  classNames,
  uiHandlers,
  isDisabled,
  isUploading,
  canAttachMore,
  canUseServerPicker,
  label,
  displayAttachments,
  mode,
}: DropzoneInputViewProps) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        onChange={uiHandlers.handleLocalFileInputChange}
        disabled={isDisabled || isUploading || !canAttachMore}
      />
      <div
        className={classNames.wrapper}
        onDrop={uiHandlers.handleDrop}
        onDragOver={uiHandlers.handleDragOver}
        onDragEnter={uiHandlers.handleDragEnter}
        onDragLeave={uiHandlers.handleDragLeave}
        aria-disabled={isDisabled}
      >
        <FiUploadCloud className="text-base" />
        <span className="break-all">{label}</span>
      </div>
      <div className={classNames.controlsRow}>
        <button
          type="button"
          className={classNames.controlButton}
          onClick={uiHandlers.openLocalFilePicker}
          disabled={isDisabled || isUploading || !canAttachMore}
        >
          Local file...
        </button>
        {canUseServerPicker && (
          <button
            type="button"
            className={classNames.controlButton}
            onClick={uiHandlers.openServerFilePicker}
            disabled={isDisabled || isUploading || !canAttachMore}
          >
            Server file...
          </button>
        )}
        {isUploading && (
          <span className={classNames.uploadingText}>Uploading...</span>
        )}
      </div>
      <DropzoneAttachmentList
        attachments={displayAttachments}
        classNames={classNames}
        mode={mode}
        isDisabled={isDisabled}
        onDeleteAttachment={uiHandlers.handleDeleteAttachment}
      />
    </div>
  );
}
export function DropzoneInput(props: DropzoneInputProps) {
  const viewProps = useDropzoneInputController(props);
  return <DropzoneInputView {...viewProps} />;
}
