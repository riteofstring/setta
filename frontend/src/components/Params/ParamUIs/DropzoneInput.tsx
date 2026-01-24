import { useMemo, useState, type ChangeEvent, type DragEvent } from "react";
import { FiUploadCloud } from "react-icons/fi";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
  setCurrEffectiveCodeObjImplValue,
} from "state/actions/sectionInfos";
import { useShareCapabilities } from "state/hooks/share";
import {
  DropzoneConfigForFrontend,
  useParamCodeObjUIConfig,
} from "state/hooks/uiTypes";
import {
  NO_DRAG_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "utils/constants";
import {
  createDropzoneFileArtifactId,
  createDropzoneTextAttachmentId,
  parseDropzoneValue,
  serializeDropzoneValue,
  type DropzoneStatelessAttachment,
  type DropzoneStoredAttachment,
} from "utils/dropzone";
import { res200 } from "utils/endpointUtils";
import {
  route_update_artifacts,
  route_update_param_impl_config,
} from "utils/generatedEndpoints";
import {
  ArtifactTypeEnum,
  CodeObjTypeEnum,
  DropzoneModeEnum,
  FileArtifact,
} from "utils/generatedTypes";

type DropzoneInputProps = {
  value: string;
  onChange?: (value: string) => void;
  onStatelessDrop?: (attachments: DropzoneStatelessAttachment[]) => void;
  placeholder?: string;
  className?: string;
  isDisabled?: boolean;
  mode?: DropzoneModeEnum;
  maxAttachments?: number | null;
};

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
  const mode = config.mode ?? DropzoneModeEnum.STATEFUL;
  let maxAttachments = "";
  if (
    config.maxAttachments !== null &&
    config.maxAttachments !== undefined &&
    config.maxAttachments > 0
  ) {
    maxAttachments = config.maxAttachments;
  }

  function handleModeChange(event: ChangeEvent<HTMLSelectElement>) {
    onChange({ mode: event.target.value as DropzoneModeEnum });
  }

  function handleMaxAttachmentsChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    if (raw.trim() === "") {
      onChange({ maxAttachments: null });
      return;
    }
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      onChange({ maxAttachments: null });
      return;
    }
    onChange({ maxAttachments: parsed });
  }

  return (
    <div className="flex flex-col gap-3 text-xs text-setta-600 dark:text-setta-300">
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
            onClick={() => onChange({ maxAttachments: null })}
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
    DropzoneStatelessAttachment[]
  >([]);
  const [isUploading, setIsUploading] = useState(false);

  const parsedStatefulValue = useMemo(() => {
    return parseDropzoneValue(value);
  }, [value]);

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

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (isDisabled || isUploading) {
      return;
    }
    const files = Array.from(event.dataTransfer.files);
    const text = event.dataTransfer.getData("text/plain");
    const fallbackText = text ? text : event.dataTransfer.getData("text");
    const currentCount =
      mode === DropzoneModeEnum.STATELESS
        ? statelessAttachments.length
        : statefulAttachments.length;
    const remainingSlots = getRemainingSlots(currentCount);

    if (files.length > 0) {
      if (remainingSlots === 0) {
        return;
      }
      const allowedFiles =
        remainingSlots === null ? files : files.slice(0, remainingSlots);
      setIsUploading(true);
      const fileIds = allowedFiles.map((file) =>
        createDropzoneFileArtifactId(file.name),
      );
      const base64Payloads = await Promise.all(
        allowedFiles.map((file) => readFileAsBase64(file)),
      );
      if (mode === DropzoneModeEnum.STATELESS) {
        const attachments: DropzoneStatelessAttachment[] = allowedFiles.map(
          (file, index) => ({
            kind: "file",
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
            base64: base64Payloads[index],
          }),
        );
        setStatelessAttachments((prev) => [...prev, ...attachments]);
        onStatelessDrop?.(attachments);
        setIsUploading(false);
        return;
      }
      if (!onChange) {
        setIsUploading(false);
        return;
      }
      const artifacts: FileArtifact[] = base64Payloads.map(
        (payload, index) => ({
          type: ArtifactTypeEnum.File,
          id: fileIds[index],
          value: payload,
        }),
      );
      const res = await route_update_artifacts({ artifacts });
      setIsUploading(false);
      if (!res200(res)) {
        return;
      }
      const newAttachments: DropzoneStoredAttachment[] = allowedFiles.map(
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
      onChange(updatedValue);
      return;
    }

    if (fallbackText) {
      if (remainingSlots === 0) {
        return;
      }
      if (mode === DropzoneModeEnum.STATELESS) {
        const attachment: DropzoneStatelessAttachment = {
          kind: "text",
          name: "Dropped text",
          text: fallbackText,
        };
        setStatelessAttachments((prev) => [...prev, attachment]);
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
        text: fallbackText,
      };
      const updatedValue = serializeDropzoneValue([
        ...statefulAttachments,
        attachment,
      ]);
      onChange(updatedValue);
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
  }

  let label = placeholder;
  if (displayAttachments.length > 0) {
    const suffix = displayAttachments.length === 1 ? "" : "s";
    label = `${displayAttachments.length} attachment${suffix}`;
  }
  const disabledClassName = isDisabled ? "opacity-60" : "";
  const wrapperClassName = `${SETTA_PREVENT_SECTION_ACTIVE_CSS} section-value flex h-full w-full flex-1 items-center justify-center gap-2 rounded-xl border-4 border-dashed border-setta-300 bg-setta-50/70 px-4 py-3 text-center text-xs font-bold uppercase tracking-widest text-setta-500/80 dark:border-setta-700 dark:bg-setta-900/50 dark:text-setta-500 ${disabledClassName} ${className ?? ""}`;

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2">
      <div
        className={wrapperClassName}
        onDrop={(event) => {
          void handleDrop(event);
        }}
        onDragOver={handleDragOver}
        aria-disabled={isDisabled}
      >
        <FiUploadCloud className="text-base" />
        <span className="break-all">{label}</span>
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
              <button
                type="button"
                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-setta-400 hover:bg-setta-100 hover:text-setta-600 dark:hover:bg-setta-850 dark:hover:text-setta-200"
                onClick={() => {
                  if (isDisabled) {
                    return;
                  }
                  if (mode === DropzoneModeEnum.STATELESS) {
                    setStatelessAttachments((prev) => {
                      const next = [...prev];
                      const index = prev.findIndex(
                        (item, idx) => `${item.kind}-${idx}` === attachment.key,
                      );
                      if (index >= 0) {
                        next.splice(index, 1);
                      }
                      return next;
                    });
                    return;
                  }
                  if (!onChange) {
                    return;
                  }
                  const nextAttachments = statefulAttachments.filter(
                    (item) => item.id !== attachment.id,
                  );
                  const updatedValue = serializeDropzoneValue(nextAttachments);
                  onChange(updatedValue);
                }}
                disabled={isDisabled}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
