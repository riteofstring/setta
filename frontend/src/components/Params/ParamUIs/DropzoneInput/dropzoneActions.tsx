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

import { updateArtifacts, uploadBinary } from "openapi/http";

import { type Dispatch, type SetStateAction } from "react";

import { addTemporaryNotification } from "state/actions/notifications";

import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "utils/constants";

import {
  ArtifactTypeEnum,
  DropzoneModeEnum,
  FileArtifact,
  NotificationTypeEnum,
  type ContentRef,
} from "utils/generatedTypes";

import type { ParamValueChange } from "../ConfiguredParamInputs";

import { commitStatefulValueUpdate } from "./dropzoneInput";

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

export type DropzoneInputProps = {
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

export type DropzoneStatelessDisplayAttachment =
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

export type DropzoneDisplayAttachment = {
  key: string;
  name: string;
  kind: DropzoneStatelessDisplayAttachment["kind"];
  size: number | null;
  id: string | null;
};

export type DropzoneClassNames = {
  wrapper: string;
  controlsRow: string;
  controlButton: string;
  uploadingText: string;
  attachmentsContainer: string;
  attachmentSizeText: string;
  deleteButton: string;
};

type DropzoneAttachmentPolicy = ReturnType<typeof getAttachmentPolicy>;

export type DropzoneCommitContext = {
  onChange?: ParamValueChange;
  sectionId?: string;
  paramInfoId?: string;
  sectionVariantId: string;
};

export type DropzoneActionContext = {
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

export function resolveDropzonePolicy(mode: DropzoneModeEnum) {
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

export function resolveAttachmentLimit(
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

export function resolveStatelessDisplayLimit(
  attachmentLimit: number | null,
): number {
  return attachmentLimit ?? DROPZONE_STATELESS_DISPLAY_LIMIT;
}

export function getCurrentAttachmentCount(
  mode: DropzoneModeEnum,
  statefulAttachments: DropzoneStoredAttachment[],
): number {
  return mode === DropzoneModeEnum.STATELESS ? 0 : statefulAttachments.length;
}

export function getRemainingSlots(
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

export function hasRemainingAttachmentCapacity(
  remainingSlots: number | null,
): boolean {
  return remainingSlots === null || remainingSlots > 0;
}

export function canUseServerFilePicker(
  isDeploymentMode: boolean,
  mode: DropzoneModeEnum,
): boolean {
  return !isDeploymentMode && mode === DropzoneModeEnum.STATEFUL;
}

export function resolveDisplayAttachments(
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

export function resolveDropzoneLabel(
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
  return `${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} section-value ${baseClassName} ${dragActiveClassName} ${disabledClassName} ${className ?? ""}`.trim();
}

export function resolveDropzoneClassNames(
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

export function hasInvalidStatefulDropzoneValue(
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

export function canStartDropzoneAction(
  isDisabled: boolean,
  isUploading: boolean,
): boolean {
  return !isDisabled && !isUploading;
}

export function ensureValidStatefulValue(
  mode: DropzoneModeEnum,
  hasInvalidStatefulValue: boolean,
): boolean {
  if (mode !== DropzoneModeEnum.STATEFUL || !hasInvalidStatefulValue) {
    return true;
  }
  notifyInvalidStatefulValue();
  return false;
}

export function limitItemsToRemainingSlots<T>(
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

export async function handleLocalFilesAction(
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

export async function handleTextDropAction(
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
