import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { FiUploadCloud } from "react-icons/fi";
import { openDropzoneFilePickerModal } from "state/actions/modal";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
  setCurrEffectiveCodeObjImplValue,
} from "state/actions/sectionInfos";
import { useShareSession } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  DropzoneConfigForFrontend,
  useParamCodeObjUIConfig,
} from "state/hooks/uiTypes";
import { SETTA_PREVENT_SECTION_ACTIVE_CSS } from "utils/constants";
import {
  createDropzoneFileArtifactId,
  createDropzoneTextAttachmentId,
  parseDropzoneValue,
  serializeDropzoneValue,
  type DropzoneStatelessAttachment,
  type DropzoneStoredAttachment,
} from "utils/dropzone";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_delete_artifacts,
  route_import_files_to_artifacts,
  route_set_param_entered_value,
  route_update_artifacts,
  route_update_param_impl_config,
} from "utils/generatedEndpoints";
import {
  ArtifactTypeEnum,
  CodeObjTypeEnum,
  DropzoneModeEnum,
  FileArtifact,
  SettaNotificationTypeEnum,
} from "utils/generatedTypes";
import type { ParamValueChange } from "./ConfiguredParamInputs";

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

function formatBytes(bytes: number): string {
  const megaBytes = bytes / (1024 * 1024);
  if (megaBytes >= 1) {
    const rounded = Math.round(megaBytes * 10) / 10;
    return `${rounded} MB`;
  }
  const kiloBytes = bytes / 1024;
  const rounded = Math.round(kiloBytes * 10) / 10;
  return `${rounded} KB`;
}

const DROPZONE_MAX_FILE_BYTES_STATEFUL = 25 * 1024 * 1024;
const DROPZONE_MAX_FILE_BYTES_STATELESS = 5 * 1024 * 1024;
const DROPZONE_MAX_STATELESS_PAYLOAD_BYTES = 16 * 1024 * 1024;
const DROPZONE_MAX_FILE_LABEL_STATEFUL = formatBytes(
  DROPZONE_MAX_FILE_BYTES_STATEFUL,
);
const DROPZONE_MAX_FILE_LABEL_STATELESS = formatBytes(
  DROPZONE_MAX_FILE_BYTES_STATELESS,
);
const DROPZONE_MAX_STATELESS_PAYLOAD_LABEL = formatBytes(
  DROPZONE_MAX_STATELESS_PAYLOAD_BYTES,
);
const DROPZONE_STATELESS_DISPLAY_LIMIT = 5;

function getMaxFileLimit(mode: DropzoneModeEnum): {
  maxBytes: number;
  label: string;
} {
  if (mode === DropzoneModeEnum.STATELESS) {
    return {
      maxBytes: DROPZONE_MAX_FILE_BYTES_STATELESS,
      label: DROPZONE_MAX_FILE_LABEL_STATELESS,
    };
  }
  return {
    maxBytes: DROPZONE_MAX_FILE_BYTES_STATEFUL,
    label: DROPZONE_MAX_FILE_LABEL_STATEFUL,
  };
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
    message = `Skipped ${files.length} files over ${limitLabel}: ${names.join(
      ", ",
    )}${suffix}.`;
  }
  addTemporaryNotification(message, SettaNotificationTypeEnum.warning);
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
  addTemporaryNotification(message, SettaNotificationTypeEnum.warning);
}

function notifyStatelessPayloadLimit(files: File[], limitLabel: string): void {
  if (files.length === 0) {
    return;
  }
  const names = files.slice(0, 3).map((file) => file.name);
  if (files.length === 1) {
    const message = `File "${names[0]}" would exceed the ${limitLabel} total payload limit.`;
    addTemporaryNotification(message, SettaNotificationTypeEnum.warning);
    return;
  }
  const suffix =
    files.length > names.length ? ` +${files.length - names.length} more` : "";
  const message = `Skipped ${files.length} files to stay under ${limitLabel} total payload: ${names.join(
    ", ",
  )}${suffix}.`;
  addTemporaryNotification(message, SettaNotificationTypeEnum.warning);
}

function notifyStatelessTextPayloadLimit(limitLabel: string): void {
  const message = `Dropped text exceeds the ${limitLabel} total payload limit.`;
  addTemporaryNotification(message, SettaNotificationTypeEnum.warning);
}

function notifyInvalidStatefulValue(): void {
  const message =
    "Dropzone value is not valid JSON. Clear it before adding attachments.";
  addTemporaryNotification(message, SettaNotificationTypeEnum.warning);
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

function estimateBase64Bytes(bytes: number): number {
  return Math.ceil(bytes / 3) * 4;
}

function splitFilesByTotalBase64Size(
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
    const estimatedBytes = estimateBase64Bytes(file.size);
    if (totalBytes + estimatedBytes > maxBytes) {
      rejected.push(file);
      continue;
    }
    totalBytes += estimatedBytes;
    accepted.push(file);
  }
  return { accepted, rejected };
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
        setCurrEffectiveCodeObjImplValue<"DropzoneParamCodeObj">(
          state,
          sectionId,
          paramInfoId,
          newConfig,
        );
      },
      send: (frontendOpId) =>
        route_update_param_impl_config({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          paramInfoId,
          newConfig,
          frontendOpId,
        }),
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

export function DropzoneInput({
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
}: DropzoneInputProps) {
  const [statelessAttachments, setStatelessAttachments] = useState<
    DropzoneStatelessDisplayAttachment[]
  >([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const dragDepth = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { isShareMode } = useShareSession((state) => ({
    isShareMode: state.isShareMode,
  }));

  const parsedStatefulValue = useMemo(() => {
    return parseDropzoneValue(value);
  }, [value]);
  const hasInvalidStatefulValue =
    mode === DropzoneModeEnum.STATEFUL &&
    value.trim() !== "" &&
    parsedStatefulValue === null;

  const statefulAttachments: DropzoneStoredAttachment[] =
    parsedStatefulValue?.attachments ?? [];

  const attachmentLimit = useMemo(() => {
    if (maxAttachments === null || maxAttachments === undefined) {
      return null;
    }
    if (Number.isNaN(maxAttachments)) {
      return null;
    }
    const limit = Math.floor(maxAttachments);
    if (limit < 1) {
      return null;
    }
    return limit;
  }, [maxAttachments]);
  const statelessDisplayLimit = useMemo(() => {
    if (attachmentLimit !== null) {
      return attachmentLimit;
    }
    return DROPZONE_STATELESS_DISPLAY_LIMIT;
  }, [attachmentLimit]);

  const displayAttachments = useMemo(() => {
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
        attachment.kind === "file"
          ? attachment.id
          : `${attachment.id}-${index}`,
      name: attachment.name,
      kind: attachment.kind,
      size: attachment.kind === "file" ? attachment.size ?? null : null,
      id: attachment.id,
    }));
  }, [mode, statelessAttachments, statefulAttachments]);

  function getRemainingSlots(currentCount: number): number | null {
    if (attachmentLimit === null) {
      return null;
    }
    if (attachmentLimit <= currentCount) {
      return 0;
    }
    return attachmentLimit - currentCount;
  }

  function getCurrentCount(): number {
    if (mode === DropzoneModeEnum.STATELESS) {
      return 0;
    }
    return statefulAttachments.length;
  }

  const remainingSlots = getRemainingSlots(getCurrentCount());
  const canAttachMore = remainingSlots === null || remainingSlots > 0;
  const canUseServerPicker = !isShareMode && mode === DropzoneModeEnum.STATEFUL;

  async function commitStatefulValue(
    updatedValue: string,
    previousValue: string,
    artifactIds: string[],
  ): Promise<boolean> {
    if (!onChange) {
      return false;
    }
    if (!sectionId || !paramInfoId) {
      onChange(updatedValue);
      return true;
    }
    onChange(updatedValue, { skipBackendUpdate: true });
    const res = await route_set_param_entered_value({
      projectConfigId: getCurrProjectConfigId(),
      sectionId,
      paramInfoId,
      value: updatedValue,
      frontendOpId: null,
    });
    if (res200(res)) {
      return true;
    }
    const detail = getErrorDetail(res.data);
    const message = detail ?? "Failed to update attachments.";
    addTemporaryNotification(message, SettaNotificationTypeEnum.warning);
    if (artifactIds.length > 0) {
      const deleteRes = await route_delete_artifacts({
        artifacts: artifactIds.map((artifactId) => ({
          id: artifactId,
          type: ArtifactTypeEnum.File,
        })),
      });
      if (!res200(deleteRes)) {
        const deleteDetail = getErrorDetail(deleteRes.data);
        const deleteMessage =
          deleteDetail ?? "Failed to clean up uploaded attachments.";
        addTemporaryNotification(
          deleteMessage,
          SettaNotificationTypeEnum.warning,
        );
      }
    }
    onChange(previousValue, { skipBackendUpdate: true });
    return false;
  }

  async function readFileAsBase64(file: File): Promise<string> {
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
  }

  async function handleLocalFiles(files: File[]) {
    if (isDisabled || isUploading) {
      return;
    }
    if (files.length === 0) {
      return;
    }
    if (mode === DropzoneModeEnum.STATEFUL && hasInvalidStatefulValue) {
      notifyInvalidStatefulValue();
      return;
    }
    const currentCount = getCurrentCount();
    const slots = getRemainingSlots(currentCount);
    if (slots === 0) {
      return;
    }
    const maxLimit = getMaxFileLimit(mode);
    const { accepted, rejected } = splitFilesBySize(files, maxLimit.maxBytes);
    if (rejected.length > 0) {
      notifyOversizedFiles(rejected, maxLimit.label);
    }
    let allowedFiles = slots === null ? accepted : accepted.slice(0, slots);
    if (allowedFiles.length === 0) {
      return;
    }
    if (mode === DropzoneModeEnum.STATELESS) {
      const { accepted: sizeAccepted, rejected: sizeRejected } =
        splitFilesByTotalBase64Size(
          allowedFiles,
          DROPZONE_MAX_STATELESS_PAYLOAD_BYTES,
        );
      if (sizeRejected.length > 0) {
        notifyStatelessPayloadLimit(
          sizeRejected,
          DROPZONE_MAX_STATELESS_PAYLOAD_LABEL,
        );
      }
      allowedFiles = sizeAccepted;
      if (allowedFiles.length === 0) {
        return;
      }
    }
    const previousValue = value;
    setIsUploading(true);
    try {
      const results = await Promise.allSettled(
        allowedFiles.map((file) => readFileAsBase64(file)),
      );
      const successfulFiles: File[] = [];
      const base64Payloads: string[] = [];
      const failedFiles: File[] = [];
      results.forEach((result, index) => {
        const file = allowedFiles[index];
        if (!file) {
          return;
        }
        if (result.status === "fulfilled") {
          successfulFiles.push(file);
          base64Payloads.push(result.value);
        } else {
          failedFiles.push(file);
        }
      });
      if (failedFiles.length > 0) {
        notifyReadFailures(failedFiles);
      }
      if (successfulFiles.length === 0) {
        return;
      }
      if (mode === DropzoneModeEnum.STATELESS) {
        const attachments: DropzoneStatelessAttachment[] = successfulFiles.map(
          (file, index) => ({
            kind: "file",
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
            base64: base64Payloads[index],
          }),
        );
        const displayAttachments: DropzoneStatelessDisplayAttachment[] =
          successfulFiles.map((file) => ({
            kind: "file",
            name: file.name,
            size: file.size,
          }));
        setStatelessAttachments((prev) => {
          const next = [...prev, ...displayAttachments];
          if (next.length <= statelessDisplayLimit) {
            return next;
          }
          return next.slice(-statelessDisplayLimit);
        });
        onStatelessDrop?.(attachments);
        return;
      }
      if (!onChange) {
        return;
      }
      const artifactBaseFolder = isShareMode ? "artifacts" : undefined;
      const fileIds = successfulFiles.map((file) =>
        createDropzoneFileArtifactId(file.name, artifactBaseFolder),
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
        addTemporaryNotification(message, SettaNotificationTypeEnum.warning);
        return;
      }
      const newAttachments: DropzoneStoredAttachment[] = successfulFiles.map(
        (file, index) => ({
          kind: "file",
          id: fileIds[index],
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
        }),
      );
      const updatedValue = serializeDropzoneValue([
        ...statefulAttachments,
        ...newAttachments,
      ]);
      await commitStatefulValue(updatedValue, previousValue, fileIds);
    } finally {
      setIsUploading(false);
    }
  }

  async function handleTextDrop(text: string) {
    if (isDisabled || isUploading) {
      return;
    }
    if (mode === DropzoneModeEnum.STATEFUL && hasInvalidStatefulValue) {
      notifyInvalidStatefulValue();
      return;
    }
    const currentCount = getCurrentCount();
    const slots = getRemainingSlots(currentCount);
    if (slots === 0) {
      return;
    }
    if (mode === DropzoneModeEnum.STATELESS) {
      const textBytes = getUtf8ByteLength(text);
      if (textBytes > DROPZONE_MAX_STATELESS_PAYLOAD_BYTES) {
        notifyStatelessTextPayloadLimit(DROPZONE_MAX_STATELESS_PAYLOAD_LABEL);
        return;
      }
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
      setStatelessAttachments((prev) => {
        const next = [...prev, displayAttachment];
        if (next.length <= statelessDisplayLimit) {
          return next;
        }
        return next.slice(-statelessDisplayLimit);
      });
      onStatelessDrop?.([attachment]);
      return;
    }
    if (!onChange) {
      return;
    }
    const attachment: DropzoneStoredAttachment = {
      kind: "text",
      id: createDropzoneTextAttachmentId(),
      name: "Dropped text",
      text,
    };
    const updatedValue = serializeDropzoneValue([
      ...statefulAttachments,
      attachment,
    ]);
    const previousValue = value;
    await commitStatefulValue(updatedValue, previousValue, []);
  }

  async function handleServerFilePaths(paths: string[]) {
    if (isDisabled || isUploading) {
      return;
    }
    if (mode === DropzoneModeEnum.STATELESS) {
      return;
    }
    if (hasInvalidStatefulValue) {
      notifyInvalidStatefulValue();
      return;
    }
    if (!onChange) {
      return;
    }
    const currentCount = getCurrentCount();
    const slots = getRemainingSlots(currentCount);
    if (slots === 0) {
      return;
    }
    const allowedPaths = slots === null ? paths : paths.slice(0, slots);
    if (allowedPaths.length === 0) {
      return;
    }
    const previousValue = value;
    setIsUploading(true);
    try {
      const res = await route_import_files_to_artifacts({
        paths: allowedPaths,
      });
      if (!res200(res)) {
        const detail = getErrorDetail(res.data);
        const message =
          detail ?? "Failed to import server files into attachments.";
        addTemporaryNotification(message, SettaNotificationTypeEnum.warning);
        return;
      }
      const newAttachments: DropzoneStoredAttachment[] = res.data.map(
        (item) => ({
          kind: "file",
          id: item.id,
          name: item.name,
          mimeType: item.mimeType,
          size: item.size,
        }),
      );
      const updatedValue = serializeDropzoneValue([
        ...statefulAttachments,
        ...newAttachments,
      ]);
      const artifactIds = newAttachments
        .map((attachment) => attachment.id)
        .filter((id): id is string => id !== null);
      await commitStatefulValue(updatedValue, previousValue, artifactIds);
    } finally {
      setIsUploading(false);
    }
  }

  async function deleteFileAttachment(artifactId: string): Promise<boolean> {
    const res = await route_delete_artifacts({
      artifacts: [
        {
          id: artifactId,
          type: ArtifactTypeEnum.File,
        },
      ],
    });
    if (!res200(res)) {
      const detail = getErrorDetail(res.data);
      const message = detail ?? "Failed to delete attachment.";
      addTemporaryNotification(message, SettaNotificationTypeEnum.warning);
      return false;
    }
    return true;
  }

  async function handleDeleteStatefulAttachment(
    attachmentId: string,
    attachmentKind: DropzoneStoredAttachment["kind"],
  ): Promise<void> {
    if (!onChange) {
      return;
    }
    const nextAttachments = statefulAttachments.filter(
      (item) => item.id !== attachmentId,
    );
    const updatedValue = serializeDropzoneValue(nextAttachments);
    const previousValue = value;
    const committed = await commitStatefulValue(
      updatedValue,
      previousValue,
      [],
    );
    if (!committed) {
      return;
    }
    if (attachmentKind === "file") {
      await deleteFileAttachment(attachmentId);
    }
  }

  function handleLocalFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = "";
    void handleLocalFiles(files);
  }

  function openLocalFilePicker() {
    if (isDisabled || isUploading || !canAttachMore) {
      return;
    }
    fileInputRef.current?.click();
  }

  function openServerFilePicker() {
    if (!canUseServerPicker) {
      return;
    }
    if (isDisabled || isUploading || !canAttachMore) {
      return;
    }
    openDropzoneFilePickerModal({
      title: "Attach Server File",
      remainingSlots,
      onPickPaths: (paths) => {
        void handleServerFilePaths(paths);
      },
    });
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragActive(false);
    if (isDisabled || isUploading) {
      return;
    }
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
      await handleLocalFiles(files);
      return;
    }
    const text = event.dataTransfer.getData("text/plain");
    const fallbackText = text ? text : event.dataTransfer.getData("text");
    if (fallbackText) {
      await handleTextDrop(fallbackText);
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (isDisabled) {
      return;
    }
    if (!isDragActive) {
      setIsDragActive(true);
    }
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (isDisabled) {
      return;
    }
    dragDepth.current += 1;
    setIsDragActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (isDisabled) {
      return;
    }
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) {
      setIsDragActive(false);
    }
  }

  let label = placeholder;
  if (displayAttachments.length > 0) {
    const suffix = displayAttachments.length === 1 ? "" : "s";
    if (mode === DropzoneModeEnum.STATELESS) {
      label = `Recent drop${suffix}`;
    } else {
      label = `${displayAttachments.length} attachment${suffix}`;
    }
  }
  const disabledClassName = isDisabled ? "opacity-60" : "";
  const dragActiveClassName = isDragActive
    ? "border-emerald-500 bg-emerald-200/80 text-emerald-900 ring-4 ring-emerald-400/60 shadow-[0_0_0_6px_rgba(16,185,129,0.15)] dark:border-emerald-300 dark:bg-emerald-500/30 dark:text-emerald-100 dark:ring-emerald-300/60 dark:shadow-[0_0_0_6px_rgba(16,185,129,0.25)]"
    : "";
  const wrapperClassName = `${SETTA_PREVENT_SECTION_ACTIVE_CSS} section-value flex h-full w-full flex-1 items-center justify-center gap-2 rounded-xl border-4 border-dashed border-setta-300 bg-setta-50/70 px-4 py-3 text-center text-xs font-bold uppercase tracking-widest text-setta-500/80 dark:border-setta-700 dark:bg-setta-900/50 dark:text-setta-500 ${dragActiveClassName} ${disabledClassName} ${className ?? ""}`;

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        onChange={handleLocalFileInputChange}
        disabled={isDisabled || isUploading || !canAttachMore}
      />
      <div
        className={wrapperClassName}
        onDrop={(event) => {
          void handleDrop(event);
        }}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        aria-disabled={isDisabled}
      >
        <FiUploadCloud className="text-base" />
        <span className="break-all">{label}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-setta-400">
        <button
          type="button"
          className="rounded-full border border-setta-200 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-setta-400 hover:border-setta-400 hover:text-setta-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-setta-800 dark:text-setta-500 dark:hover:border-setta-600 dark:hover:text-setta-300"
          onClick={openLocalFilePicker}
          disabled={isDisabled || isUploading || !canAttachMore}
        >
          Local file...
        </button>
        {canUseServerPicker && (
          <button
            type="button"
            className="rounded-full border border-setta-200 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-setta-400 hover:border-setta-400 hover:text-setta-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-setta-800 dark:text-setta-500 dark:hover:border-setta-600 dark:hover:text-setta-300"
            onClick={openServerFilePicker}
            disabled={isDisabled || isUploading || !canAttachMore}
          >
            Server file...
          </button>
        )}
        {isUploading && (
          <span className="text-[10px] font-semibold uppercase tracking-widest text-setta-300">
            Uploading...
          </span>
        )}
      </div>
      {displayAttachments.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-setta-200/70 bg-white/60 p-2 text-[11px] text-setta-600 dark:border-setta-800 dark:bg-setta-900/40 dark:text-setta-400">
          {displayAttachments.map((attachment) => (
            <div
              key={attachment.key}
              className="flex items-center justify-between gap-2"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-semibold">
                  {attachment.name}
                </span>
                {attachment.size !== null && attachment.size !== undefined && (
                  <span className="text-[10px] uppercase tracking-wide text-setta-400">
                    {attachment.size} bytes
                  </span>
                )}
              </div>
              {mode !== DropzoneModeEnum.STATELESS && (
                <button
                  type="button"
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-setta-400 hover:bg-setta-100 hover:text-setta-600 dark:hover:bg-setta-850 dark:hover:text-setta-200"
                  onClick={() => {
                    if (isDisabled) {
                      return;
                    }
                    if (!attachment.id) {
                      return;
                    }
                    void handleDeleteStatefulAttachment(
                      attachment.id,
                      attachment.kind,
                    );
                  }}
                  disabled={isDisabled}
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
