import {
  callOpenAPI,
  formatBytes,
  getErrorDetail,
  parseDropzoneValue,
  res200,
  serializeDropzoneValue,
  type DropzoneStoredAttachment,
} from "@setta/app-subsystem-frontend-sdk";

import {
  deleteArtifacts,
  importFilesToArtifacts,
  setParamEnteredValue,
  updateParamImplConfig,
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

import {
  ArtifactTypeEnum,
  CodeObjTypeEnum,
  DropzoneModeEnum,
  DropzoneParamCodeObjImpl,
  NotificationTypeEnum,
} from "utils/generatedTypes";

import {
  DropzoneActionContext,
  DropzoneClassNames,
  DropzoneCommitContext,
  DropzoneDisplayAttachment,
  DropzoneInputProps,
  DropzoneStatelessDisplayAttachment,
  canStartDropzoneAction,
  canUseServerFilePicker,
  ensureValidStatefulValue,
  getCurrentAttachmentCount,
  getRemainingSlots,
  handleLocalFilesAction,
  handleTextDropAction,
  hasInvalidStatefulDropzoneValue,
  hasRemainingAttachmentCapacity,
  limitItemsToRemainingSlots,
  resolveAttachmentLimit,
  resolveDisplayAttachments,
  resolveDropzoneClassNames,
  resolveDropzoneLabel,
  resolveDropzonePolicy,
  resolveStatelessDisplayLimit,
} from "./dropzoneActions";

export async function handleServerFilePathsAction(
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

export async function deleteFileAttachment(
  artifactId: string,
): Promise<boolean> {
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

export async function handleDeleteStatefulAttachmentAction(
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

export type DropzoneUiHandlers = {
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

export type CreateDropzoneUiHandlersArgs = {
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

export function resolveDroppedText(event: DragEvent<HTMLDivElement>): string {
  const text = event.dataTransfer.getData("text/plain");
  return text || event.dataTransfer.getData("text");
}

export function createDropzoneUiHandlers({
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

export function DropzoneAttachmentList({
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

export async function commitStatefulValueUpdate(
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

export function DropzoneInputConfig({
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

export type DropzoneInputViewProps = {
  fileInputRef: RefObject<HTMLInputElement | null>;
  classNames: DropzoneClassNames;
  gpuFlowControlId: string;
  uiHandlers: DropzoneUiHandlers;
  isDisabled: boolean;
  isUploading: boolean;
  canAttachMore: boolean;
  canUseServerPicker: boolean;
  label: string;
  displayAttachments: DropzoneDisplayAttachment[];
  mode: DropzoneModeEnum;
};

export function useDropzoneInputController({
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
  const gpuFlowControlId =
    sectionId && paramInfoId
      ? `dropzone:${sectionId}:${paramInfoId}`
      : "dropzone";
  return {
    fileInputRef,
    classNames,
    gpuFlowControlId,
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

export function DropzoneInputView({
  fileInputRef,
  classNames,
  gpuFlowControlId,
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
        data-gpu-flow-control={gpuFlowControlId}
        data-gpu-flow-interactive="true"
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
