import {
  ArtifactTypeEnum,
  DropzoneModeEnum,
  TextParamInputUITypeEnum,
  callOpenAPI,
  createDropzoneFileArtifactId,
  createDropzoneTextAttachmentId,
  deleteArtifacts,
  formatBytes,
  getAttachmentPolicy,
  getCurrentSectionVariantId,
  isAttachmentMimeAllowed,
  parseDropzoneValue,
  res200,
  serializeDropzoneValue,
  setParamEnteredValue,
  type DropzoneStatelessAttachment,
  type DropzoneStoredAttachment,
  updateArtifacts,
  uploadBinary,
} from "@setta/app-subsystem-frontend-sdk";

import React from "react";

import { useAppSubsystemFrontendHost } from "../../appSubsystemFrontendHostContext";

import { useAppConfigs } from "../../appSubsystemProjectState";

import {
  CodeBlock,
  CodeBlockProps,
  ColorPickerInput,
  ColorPickerInputProps,
  ColorPickerInputTheme,
  DisplayAttachment,
  DropdownInput,
  DropdownInputProps,
  DropzoneInputProps,
  DropzoneInputTheme,
  PasswordInput,
  PasswordInputProps,
  RotaryInput,
  RotaryInputProps,
  SliderInput,
  SliderInputProps,
  TextInputCodeMirror,
  TextInputCodeMirrorProps,
  TextParamDateTimeInput,
  TextParamDateTimeInputProps,
  clampNumber,
  createLocalId,
  deleteAttachmentArtifact,
  formatTemporalSummary,
  isHexColor,
  joinClassNames,
  normalizeStringArray,
  notifyHost,
  readFileBuffers,
  resolveColorValue,
  resolveDateInputValue,
  resolveDateTimeLocalValue,
  resolveDropzoneTheme,
  resolveRemainingSlots,
  resolveRows,
  resolveTemporalInputType,
  resolveTextAttachmentName,
  resolveTimeInputValue,
  shouldRenderBlockCode,
  stringifyChildren,
  summarizeRejectedFiles,
} from "./runtimeInputs";

export function DropzoneInput({
  configId,
  sectionId,
  paramInfoId,
  value,
  onChange,
  onStatelessDrop,
  placeholder,
  className,
  isDisabled = false,
  mode = DropzoneModeEnum.STATEFUL,
  maxAttachments = null,
  theme,
}: DropzoneInputProps) {
  const frontendHost = useAppSubsystemFrontendHost();
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isDragActive, setIsDragActive] = React.useState(false);
  const [statelessAttachments, setStatelessAttachments] = React.useState<
    DisplayAttachment[]
  >([]);

  const parsedStatefulValue =
    mode === DropzoneModeEnum.STATEFUL ? parseDropzoneValue(value) : null;
  const statefulAttachments = parsedStatefulValue?.attachments ?? [];
  const invalidStatefulValue =
    mode === DropzoneModeEnum.STATEFUL &&
    value.trim().length > 0 &&
    parsedStatefulValue === null;
  const attachmentPolicy = getAttachmentPolicy(
    mode === DropzoneModeEnum.STATELESS
      ? "dropzone_stateless"
      : "dropzone_stateful",
  );
  const displayAttachments =
    mode === DropzoneModeEnum.STATELESS
      ? statelessAttachments
      : statefulAttachments.map((attachment) => ({
          id: attachment.id,
          kind: attachment.kind,
          name: attachment.name,
          size: attachment.kind === "file" ? attachment.size ?? null : null,
          text: attachment.kind === "text" ? attachment.text : undefined,
        }));
  const remainingSlots = resolveRemainingSlots(
    maxAttachments,
    displayAttachments.length,
  );
  const resolvedTheme = resolveDropzoneTheme(theme);
  const sectionVariantId = useAppConfigs((state) => {
    if (!configId || !sectionId) {
      return null;
    }
    const configState = state.configs[configId];
    if (!configState) {
      return null;
    }
    return getCurrentSectionVariantId(configState, sectionId);
  });

  async function commitStatefulValue(
    nextValue: string,
    previousValue: string,
    uploadedArtifactIds: string[] = [],
  ): Promise<boolean> {
    if (!onChange) {
      return false;
    }
    if (!configId || !sectionId || !paramInfoId || !sectionVariantId) {
      onChange(nextValue);
      return true;
    }
    onChange(nextValue, { skipBackendUpdate: true });
    const response = await callOpenAPI(
      setParamEnteredValue({
        body: {
          projectConfigId: configId,
          sectionId,
          sectionVariantId,
          paramInfoId,
          value: nextValue,
        },
      } as Parameters<typeof setParamEnteredValue>[0]),
    );
    if (res200(response)) {
      return true;
    }
    notifyHost(frontendHost.notify, "Failed to update attachments.");
    if (uploadedArtifactIds.length > 0) {
      await callOpenAPI(
        deleteArtifacts({
          body: {
            artifacts: uploadedArtifactIds.map((artifactId) => ({
              id: artifactId,
              type: ArtifactTypeEnum.File,
            })),
          },
        } as Parameters<typeof deleteArtifacts>[0]),
      );
    }
    onChange(previousValue, { skipBackendUpdate: true });
    return false;
  }

  async function handleStatefulFiles(files: File[]): Promise<void> {
    if (!onChange) {
      return;
    }
    const uploads = await Promise.allSettled(
      files.map(async (file) => {
        const response = await callOpenAPI(
          uploadBinary({
            body: {
              durable: false,
              file,
            },
          } as Parameters<typeof uploadBinary>[0]),
        );
        if (!res200(response) || !response.data) {
          throw new Error(`Upload failed for ${file.name}`);
        }
        return { file, ref: response.data };
      }),
    );
    const successfulUploads = uploads.flatMap((result) => {
      if (result.status === "fulfilled") {
        return [result.value];
      }
      return [];
    });
    const failedFiles = uploads.flatMap((result, index) => {
      if (result.status === "rejected") {
        return [files[index]];
      }
      return [];
    });
    if (failedFiles.length > 0) {
      notifyHost(
        frontendHost.notify,
        `Failed to upload some files. ${summarizeRejectedFiles(
          failedFiles,
          "Skipped",
        )}`,
      );
    }
    if (successfulUploads.length === 0) {
      return;
    }
    const artifactIds = successfulUploads.map(({ file }) =>
      createDropzoneFileArtifactId(file.name),
    );
    const artifacts = successfulUploads.map(({ ref }, index) => ({
      type: ArtifactTypeEnum.File,
      id: artifactIds[index],
      value: ref,
    }));
    const artifactResponse = await callOpenAPI(
      updateArtifacts({
        body: {
          artifacts,
          uploadScope: "generic",
        },
      } as Parameters<typeof updateArtifacts>[0]),
    );
    if (!res200(artifactResponse)) {
      notifyHost(
        frontendHost.notify,
        "Failed to register uploaded attachments.",
      );
      return;
    }
    const nextAttachments: DropzoneStoredAttachment[] = [
      ...statefulAttachments,
      ...successfulUploads.map(({ file }, index) => ({
        kind: "file" as const,
        id: artifactIds[index],
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
      })),
    ];
    await commitStatefulValue(
      serializeDropzoneValue(nextAttachments),
      value,
      artifactIds,
    );
  }

  async function handleStatelessFiles(files: File[]): Promise<void> {
    const successfulReads = await readFileBuffers(files);
    const failedCount = files.length - successfulReads.length;
    if (failedCount > 0) {
      notifyHost(frontendHost.notify, "Failed to read some dropped files.");
    }
    if (successfulReads.length === 0) {
      return;
    }
    const allowedReads: Array<(typeof successfulReads)[number]> = [];
    let runningTotal = 0;
    for (const read of successfulReads) {
      const nextTotal = runningTotal + read.buffer.byteLength;
      if (
        attachmentPolicy.maxTotalBytes !== null &&
        nextTotal > attachmentPolicy.maxTotalBytes
      ) {
        notifyHost(
          frontendHost.notify,
          `Skipped some files to stay under ${attachmentPolicy.maxTotalLabel}.`,
        );
        continue;
      }
      runningTotal = nextTotal;
      allowedReads.push(read);
    }
    if (allowedReads.length === 0) {
      return;
    }
    const attachments: DropzoneStatelessAttachment[] = allowedReads.map(
      ({ buffer, contentId, file }) => ({
        kind: "file",
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        contentId,
        byteLength: buffer.byteLength,
        binaryPayload: buffer,
      }),
    );
    setStatelessAttachments((previous) =>
      normalizeStringArray(
        [
          ...previous,
          ...allowedReads.map(({ file }) => ({
            id: null,
            kind: "file" as const,
            name: file.name,
            size: file.size,
          })),
        ],
        maxAttachments,
      ),
    );
    onStatelessDrop?.(attachments);
  }

  async function handleTextDrop(text: string): Promise<void> {
    const normalizedText = text.trim();
    if (normalizedText.length === 0) {
      return;
    }
    if (mode === DropzoneModeEnum.STATELESS) {
      const attachment: DropzoneStatelessAttachment = {
        kind: "text",
        name: resolveTextAttachmentName(normalizedText),
        text: normalizedText,
      };
      setStatelessAttachments((previous) =>
        normalizeStringArray(
          [
            ...previous,
            {
              id: null,
              kind: "text",
              name: attachment.name,
              size: null,
              text: attachment.text,
            },
          ],
          maxAttachments,
        ),
      );
      onStatelessDrop?.([attachment]);
      return;
    }
    if (!onChange) {
      return;
    }
    const nextAttachments: DropzoneStoredAttachment[] = [
      ...statefulAttachments,
      {
        kind: "text",
        id: createDropzoneTextAttachmentId(),
        name: resolveTextAttachmentName(normalizedText),
        text: normalizedText,
      },
    ];
    await commitStatefulValue(serializeDropzoneValue(nextAttachments), value);
  }

  async function handleFiles(files: File[]): Promise<void> {
    if (isDisabled || isUploading) {
      return;
    }
    if (invalidStatefulValue) {
      notifyHost(
        frontendHost.notify,
        "Dropzone value is invalid JSON. Clear it before adding attachments.",
      );
      return;
    }
    const limitedFiles =
      remainingSlots === null ? files : files.slice(0, remainingSlots);
    const oversizedFiles = limitedFiles.filter(
      (file) => file.size > attachmentPolicy.maxFileBytes,
    );
    if (oversizedFiles.length > 0) {
      notifyHost(
        frontendHost.notify,
        `Skipped oversized files over ${attachmentPolicy.maxFileLabel}.`,
      );
    }
    const allowedBySize = limitedFiles.filter(
      (file) => file.size <= attachmentPolicy.maxFileBytes,
    );
    const disallowedMimeFiles = allowedBySize.filter(
      (file) => !isAttachmentMimeAllowed(file.type || "", attachmentPolicy),
    );
    if (disallowedMimeFiles.length > 0 && attachmentPolicy.allowedMimeLabel) {
      notifyHost(frontendHost.notify, attachmentPolicy.allowedMimeLabel);
    }
    const allowedFiles = allowedBySize.filter((file) =>
      isAttachmentMimeAllowed(file.type || "", attachmentPolicy),
    );
    if (allowedFiles.length === 0) {
      return;
    }
    setIsUploading(true);
    try {
      if (mode === DropzoneModeEnum.STATELESS) {
        await handleStatelessFiles(allowedFiles);
      } else {
        await handleStatefulFiles(allowedFiles);
      }
    } finally {
      setIsUploading(false);
    }
  }

  async function removeAttachment(
    attachment: DisplayAttachment,
  ): Promise<void> {
    if (mode === DropzoneModeEnum.STATELESS) {
      setStatelessAttachments((previous) =>
        previous.filter((item) => item.name !== attachment.name),
      );
      return;
    }
    const nextAttachments = statefulAttachments.filter(
      (item) => item.id !== attachment.id,
    );
    const committed = await commitStatefulValue(
      serializeDropzoneValue(nextAttachments),
      value,
    );
    if (committed && attachment.kind === "file" && attachment.id) {
      await deleteAttachmentArtifact(attachment.id, frontendHost.notify);
    }
  }

  return (
    <div className={joinClassNames([className, "flex flex-col gap-3"])}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = event.target.files
            ? Array.from(event.target.files)
            : [];
          event.target.value = "";
          void handleFiles(files);
        }}
      />
      <div
        className={joinClassNames([
          resolvedTheme.wrapperBaseClassName,
          isDragActive && resolvedTheme.dragActiveClassName,
        ])}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragActive(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (event.currentTarget === event.target) {
            setIsDragActive(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragActive(false);
          const files = Array.from(event.dataTransfer.files ?? []);
          if (files.length > 0) {
            void handleFiles(files);
            return;
          }
          const droppedText =
            event.dataTransfer.getData("text/plain") ||
            event.dataTransfer.getData("text");
          if (droppedText.trim().length > 0) {
            void handleTextDrop(droppedText);
          }
        }}
      >
        <div className="flex flex-col items-center gap-2">
          <span>{placeholder ?? "Drop files or text here."}</span>
          <div className={resolvedTheme.controlsRowClassName}>
            <button
              type="button"
              className={resolvedTheme.controlButtonClassName}
              disabled={isDisabled || isUploading || remainingSlots === 0}
              onClick={() => fileInputRef.current?.click()}
            >
              Choose Files
            </button>
            {isUploading ? (
              <span className={resolvedTheme.uploadingTextClassName}>
                Uploading...
              </span>
            ) : null}
          </div>
        </div>
      </div>
      {invalidStatefulValue ? (
        <div className="text-[11px] text-[color:var(--app-muted)]">
          Existing attachment data is invalid. Clear the param value before
          uploading more files.
        </div>
      ) : null}
      {displayAttachments.length > 0 ? (
        <div className={resolvedTheme.attachmentsContainerClassName}>
          {displayAttachments.map((attachment) => (
            <div
              key={attachment.id ?? `${attachment.kind}:${attachment.name}`}
              className="flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{attachment.name}</div>
                {attachment.size !== null ? (
                  <div className={resolvedTheme.attachmentSizeTextClassName}>
                    {formatBytes(attachment.size)}
                  </div>
                ) : null}
                {attachment.text ? (
                  <div className="line-clamp-2 text-[10px] text-[color:var(--app-muted)]">
                    {attachment.text}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className={resolvedTheme.deleteButtonClassName}
                onClick={() => {
                  void removeAttachment(attachment);
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
