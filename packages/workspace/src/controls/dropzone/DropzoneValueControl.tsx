import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type RefObject,
} from "react";
import { FiUploadCloud } from "react-icons/fi";
import { useItemSelectionModeForControl } from "../../document/itemSelectionMode";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "../../interaction";
import { handleSectionControlEscape } from "../sectionFocus";
import { useWorkspaceHost } from "../../workspaceHostContext";
import { getWorkspaceHostDomId } from "../../workspaceHostInternals";
import {
  assertDropzoneAttachments,
  assertDropzonePolicy,
  formatDropzoneBytes,
  getDroppedTextRejection,
  getDropzoneRemainingSlots,
  partitionDropzoneFiles,
} from "./dropzonePolicy";
import type {
  DropzoneAttachment,
  DropzonePolicy,
  DropzoneValueControlProps,
} from "./dropzoneTypes";

// The remaining-controls milestone's backend-free Dropzone. Its default presentation and
// drag-depth behavior come from the frozen `DropzoneInput`, while every side effect crosses an
// explicit host seam. The package filters metadata and emits raw `File` objects or dropped text;
// it never reads byte payloads, creates attachment identities, uploads, persists, or deletes.

const INTERACTION_BOUNDARY_CLASS_NAME = `${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`;
const ROOT_CLASS_NAME = `${INTERACTION_BOUNDARY_CLASS_NAME} section-value flex h-full min-h-0 w-full flex-col gap-2`;
const DROP_TARGET_BASE_CLASS_NAME =
  "section-value flex h-full w-full flex-1 items-center justify-center gap-2 rounded-xl border-4 border-dashed border-setta-300 bg-setta-50/70 px-4 py-3 text-center text-xs font-bold uppercase tracking-widest text-setta-500/80 dark:border-setta-700 dark:bg-setta-900/50 dark:text-setta-500";
const DROP_TARGET_ACTIVE_CLASS_NAME =
  "border-emerald-500 bg-emerald-200/80 text-emerald-900 ring-4 ring-emerald-400/60 shadow-[0_0_0_6px_rgba(16,185,129,0.15)] dark:border-emerald-300 dark:bg-emerald-500/30 dark:text-emerald-100 dark:ring-emerald-300/60 dark:shadow-[0_0_0_6px_rgba(16,185,129,0.25)]";
const CONTROLS_ROW_CLASS_NAME =
  "flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-setta-400";
const CONTROL_BUTTON_CLASS_NAME =
  "relative rounded-full border border-setta-200 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-setta-400 after:absolute after:inset-x-0 after:-inset-y-1 hover:border-setta-400 hover:text-setta-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-setta-800 dark:text-setta-500 dark:hover:border-setta-600 dark:hover:text-setta-300";
const UPLOADING_TEXT_CLASS_NAME =
  "text-[10px] font-semibold uppercase tracking-widest text-setta-300";
const ERROR_TEXT_CLASS_NAME =
  "text-[10px] font-semibold text-red-600 dark:text-red-400";
const ATTACHMENTS_CONTAINER_CLASS_NAME =
  "flex flex-col gap-2 rounded-lg border border-setta-200/70 bg-white/60 p-2 text-[11px] text-setta-600 dark:border-setta-800 dark:bg-setta-900/40 dark:text-setta-400";
const ATTACHMENT_SIZE_TEXT_CLASS_NAME =
  "text-[10px] uppercase tracking-wide text-setta-400";
const DELETE_BUTTON_CLASS_NAME =
  "relative rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-setta-400 after:absolute after:inset-x-0 after:-inset-y-1 hover:bg-setta-100 hover:text-setta-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-setta-850 dark:hover:text-setta-200";

type DropzoneInteractionContext = {
  blocked: boolean;
  policy: DropzonePolicy;
  remainingSlots: number | null;
  onAccepted: DropzoneValueControlProps["onAccepted"];
  onRejected: DropzoneValueControlProps["onRejected"];
};

type DropzoneInteractions = {
  fileInputRef: RefObject<HTMLInputElement | null>;
  isDragActive: boolean;
  handleFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handleDrop: (event: DragEvent<HTMLDivElement>) => void;
  handleDragOver: (event: DragEvent<HTMLDivElement>) => void;
  handleDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  handleDragLeave: (event: DragEvent<HTMLDivElement>) => void;
};

type ResolvedDropzoneValueControlProps = Omit<
  DropzoneValueControlProps,
  "placeholder" | "pending" | "disabled"
> & {
  placeholder: string;
  pending: boolean;
  disabled: boolean;
};

type DropzoneViewState = {
  isDisabled: boolean;
  actionsBlocked: boolean;
  attachmentActionsDisabled: boolean;
  remainingSlots: number | null;
  label: string;
  errorId: string;
  hasError: boolean;
};

function deliverFiles(
  files: ReadonlyArray<File>,
  context: DropzoneInteractionContext,
): void {
  const result = partitionDropzoneFiles(
    files,
    context.policy,
    context.remainingSlots,
  );
  if (result.rejected.length > 0) {
    context.onRejected(result.rejected);
  }
  if (result.accepted.length > 0) {
    context.onAccepted({ kind: "files", files: result.accepted });
  }
}

function deliverText(text: string, context: DropzoneInteractionContext): void {
  const rejection = getDroppedTextRejection(
    text,
    context.policy,
    context.remainingSlots,
  );
  if (rejection) {
    context.onRejected([rejection]);
    return;
  }
  context.onAccepted({ kind: "text", text });
}

function getDroppedText(event: DragEvent<HTMLDivElement>): string {
  return (
    event.dataTransfer.getData("text/plain") ||
    event.dataTransfer.getData("text")
  );
}

function useDropzoneInteractions(
  context: DropzoneInteractionContext,
): DropzoneInteractions {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [isDragActive, setIsDragActive] = useState(false);

  useEffect(() => {
    if (context.blocked) {
      dragDepth.current = 0;
      setIsDragActive(false);
    }
  }, [context.blocked]);

  function resetDragState(): void {
    dragDepth.current = 0;
    setIsDragActive(false);
  }

  return {
    fileInputRef,
    isDragActive,
    handleFileInputChange(event) {
      const files = event.currentTarget.files
        ? Array.from(event.currentTarget.files)
        : [];
      event.currentTarget.value = "";
      if (!context.blocked && files.length > 0) {
        deliverFiles(files, context);
      }
    },
    handleDrop(event) {
      event.preventDefault();
      event.stopPropagation();
      resetDragState();
      if (context.blocked) {
        return;
      }
      const files = Array.from(event.dataTransfer.files);
      if (files.length > 0) {
        deliverFiles(files, context);
        return;
      }
      const text = getDroppedText(event);
      if (text) {
        deliverText(text, context);
      }
    },
    handleDragOver(event) {
      event.preventDefault();
      event.stopPropagation();
      if (!context.blocked && !isDragActive) {
        event.dataTransfer.dropEffect = "copy";
        setIsDragActive(true);
      }
    },
    handleDragEnter(event) {
      event.preventDefault();
      event.stopPropagation();
      if (!context.blocked) {
        dragDepth.current += 1;
        setIsDragActive(true);
      }
    },
    handleDragLeave(event) {
      event.preventDefault();
      event.stopPropagation();
      if (!context.blocked) {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) {
          setIsDragActive(false);
        }
      }
    },
  };
}

function resolveDropzoneLabel(
  placeholder: string,
  attachments: ReadonlyArray<DropzoneAttachment>,
): string {
  if (attachments.length === 0) {
    return placeholder;
  }
  return `${attachments.length} attachment${attachments.length === 1 ? "" : "s"}`;
}

function resolveDropzoneProps(
  props: DropzoneValueControlProps,
): ResolvedDropzoneValueControlProps {
  return {
    ...props,
    placeholder: props.placeholder ?? "Drop a file here",
    pending: props.pending ?? false,
    disabled: props.disabled ?? false,
  };
}

function resolveDropzoneViewState(
  props: ResolvedDropzoneValueControlProps,
  isSelectingItems: boolean,
  hostId: string,
): DropzoneViewState {
  const isDisabled = props.disabled || isSelectingItems;
  const remainingSlots = getDropzoneRemainingSlots(
    props.attachments,
    props.policy,
  );
  const actionsBlocked = isDisabled || props.pending || remainingSlots === 0;
  return {
    isDisabled,
    actionsBlocked,
    attachmentActionsDisabled: isDisabled || props.pending,
    remainingSlots,
    label: resolveDropzoneLabel(props.placeholder, props.attachments),
    errorId: `${hostId}-${props.sectionId}-${props.controlId}-DropzoneError`,
    hasError: Boolean(props.errorMessage),
  };
}

export function DropzoneValueControl(props: DropzoneValueControlProps) {
  const resolvedProps = resolveDropzoneProps(props);
  assertDropzonePolicy(resolvedProps.policy);
  assertDropzoneAttachments(resolvedProps.attachments, resolvedProps.policy);
  const host = useWorkspaceHost();
  const isSelectingItems = useItemSelectionModeForControl();
  return (
    <DropzoneValueControlView
      {...resolvedProps}
      viewState={resolveDropzoneViewState(
        resolvedProps,
        isSelectingItems,
        getWorkspaceHostDomId(host),
      )}
    />
  );
}

function DropzoneValueControlView(
  props: ResolvedDropzoneValueControlProps & { viewState: DropzoneViewState },
) {
  const host = useWorkspaceHost();
  const { viewState } = props;
  const localFileButtonRef = useRef<HTMLButtonElement>(null);
  const interactions = useDropzoneInteractions({
    blocked: viewState.actionsBlocked,
    policy: props.policy,
    remainingSlots: viewState.remainingSlots,
    onAccepted: props.onAccepted,
    onRejected: props.onRejected,
  });

  return (
    <div className={ROOT_CLASS_NAME}>
      <input
        ref={interactions.fileInputRef}
        id={`${getWorkspaceHostDomId(host)}-${props.sectionId}-${props.controlId}-DropzoneFileInput`}
        aria-label={`${props.ariaLabel} local files`}
        type="file"
        className="hidden"
        multiple
        onChange={interactions.handleFileInputChange}
        disabled={viewState.actionsBlocked}
      />
      <DropTarget
        ariaLabel={props.ariaLabel}
        pending={props.pending}
        viewState={viewState}
        interactions={interactions}
      />
      <DropzoneActionRow
        fileInputRef={interactions.fileInputRef}
        localFileButtonRef={localFileButtonRef}
        pending={props.pending}
        sectionId={props.sectionId}
        onServerFilePickerRequest={props.onServerFilePickerRequest}
        viewState={viewState}
      />
      <DropzoneStatuses
        pending={props.pending}
        errorMessage={props.errorMessage}
        viewState={viewState}
      />
      <DropzoneAttachmentList
        attachments={props.attachments}
        disabled={viewState.attachmentActionsDisabled}
        sectionId={props.sectionId}
        fallbackFocusRef={localFileButtonRef}
        onAttachmentRemove={props.onAttachmentRemove}
      />
    </div>
  );
}

function getDropTargetClassName(
  viewState: DropzoneViewState,
  isDragActive: boolean,
): string {
  const activeClassName = isDragActive ? DROP_TARGET_ACTIVE_CLASS_NAME : "";
  const disabledClassName = viewState.isDisabled ? "opacity-60" : "";
  return `${INTERACTION_BOUNDARY_CLASS_NAME} ${DROP_TARGET_BASE_CLASS_NAME} ${activeClassName} ${disabledClassName}`;
}

function DropTarget({
  ariaLabel,
  pending,
  viewState,
  interactions,
}: {
  ariaLabel: string;
  pending: boolean;
  viewState: DropzoneViewState;
  interactions: DropzoneInteractions;
}) {
  return (
    <div
      role="group"
      aria-label={`${ariaLabel}: ${viewState.label}`}
      aria-disabled={viewState.actionsBlocked}
      aria-busy={pending}
      aria-describedby={viewState.hasError ? viewState.errorId : undefined}
      data-drag-active={interactions.isDragActive ? "true" : "false"}
      className={getDropTargetClassName(viewState, interactions.isDragActive)}
      onDrop={interactions.handleDrop}
      onDragOver={interactions.handleDragOver}
      onDragEnter={interactions.handleDragEnter}
      onDragLeave={interactions.handleDragLeave}
    >
      <FiUploadCloud
        aria-hidden="true"
        focusable="false"
        className="text-base"
      />
      <span className="break-all">{viewState.label}</span>
    </div>
  );
}

function DropzoneActionRow({
  fileInputRef,
  localFileButtonRef,
  pending,
  sectionId,
  onServerFilePickerRequest,
  viewState,
}: {
  fileInputRef: RefObject<HTMLInputElement | null>;
  localFileButtonRef: RefObject<HTMLButtonElement | null>;
  pending: boolean;
  sectionId: string;
  onServerFilePickerRequest: DropzoneValueControlProps["onServerFilePickerRequest"];
  viewState: DropzoneViewState;
}) {
  const host = useWorkspaceHost();
  const errorDescriptionId = viewState.hasError ? viewState.errorId : undefined;
  return (
    <div className={CONTROLS_ROW_CLASS_NAME}>
      <button
        ref={localFileButtonRef}
        type="button"
        className={CONTROL_BUTTON_CLASS_NAME}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(event) => handleSectionControlEscape(host, event, sectionId)}
        disabled={viewState.actionsBlocked}
        aria-describedby={errorDescriptionId}
      >
        Local file...
      </button>
      {onServerFilePickerRequest ? (
        <button
          type="button"
          className={CONTROL_BUTTON_CLASS_NAME}
          onClick={() =>
            onServerFilePickerRequest({
              remainingSlots: viewState.remainingSlots,
            })
          }
          onKeyDown={(event) => handleSectionControlEscape(host, event, sectionId)}
          disabled={viewState.actionsBlocked}
          aria-describedby={errorDescriptionId}
        >
          Server file...
        </button>
      ) : null}
      {pending ? (
        <span aria-hidden="true" className={UPLOADING_TEXT_CLASS_NAME}>
          Uploading...
        </span>
      ) : null}
    </div>
  );
}

function DropzoneStatuses({
  pending,
  errorMessage,
  viewState,
}: {
  pending: boolean;
  errorMessage: string | undefined;
  viewState: DropzoneViewState;
}) {
  return (
    <>
      <span role="status" className="sr-only">
        {pending ? "Uploading attachments." : ""}
      </span>
      <span
        id={viewState.errorId}
        role="alert"
        className={viewState.hasError ? ERROR_TEXT_CLASS_NAME : "sr-only"}
      >
        {errorMessage ?? ""}
      </span>
    </>
  );
}

function DropzoneAttachmentList({
  attachments,
  disabled,
  sectionId,
  fallbackFocusRef,
  onAttachmentRemove,
}: {
  attachments: ReadonlyArray<DropzoneAttachment>;
  disabled: boolean;
  sectionId: string;
  fallbackFocusRef: RefObject<HTMLButtonElement | null>;
  onAttachmentRemove: DropzoneValueControlProps["onAttachmentRemove"];
}) {
  const host = useWorkspaceHost();
  const removalRequest = useRef<{ attachmentId: string; index: number } | null>(
    null,
  );
  const removeButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => {
    const request = removalRequest.current;
    if (
      !request ||
      attachments.some((attachment) => attachment.id === request.attachmentId)
    ) {
      return;
    }
    removalRequest.current = null;
    const nextAttachment =
      attachments[request.index] ?? attachments[request.index - 1];
    if (nextAttachment) {
      const nextButton = removeButtonRefs.current[nextAttachment.id];
      if (!nextButton) {
        throw new Error(
          `Dropzone cannot restore focus to attachment action ${nextAttachment.id}.`,
        );
      }
      nextButton.focus({ preventScroll: true });
      return;
    }
    const fallbackButton = fallbackFocusRef.current;
    if (!fallbackButton) {
      throw new Error(
        "Dropzone cannot restore focus without its local-file action.",
      );
    }
    fallbackButton.focus({ preventScroll: true });
  }, [attachments, fallbackFocusRef]);

  if (attachments.length === 0) {
    return null;
  }
  return (
    <div role="list" className={ATTACHMENTS_CONTAINER_CLASS_NAME}>
      {attachments.map((attachment, index) => (
        <div
          role="listitem"
          key={attachment.id}
          className="flex items-center justify-between gap-2"
        >
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-semibold">{attachment.name}</span>
            {attachment.size !== null ? (
              <span className={ATTACHMENT_SIZE_TEXT_CLASS_NAME}>
                {formatDropzoneBytes(attachment.size)}
              </span>
            ) : null}
          </div>
          {onAttachmentRemove ? (
            <button
              type="button"
              ref={(element) => {
                removeButtonRefs.current[attachment.id] = element;
              }}
              className={DELETE_BUTTON_CLASS_NAME}
              aria-label={`Delete ${attachment.name}`}
              onClick={() => {
                removalRequest.current = { attachmentId: attachment.id, index };
                onAttachmentRemove(attachment.id);
              }}
              onKeyDown={(event) =>
                handleSectionControlEscape(host, event, sectionId)
              }
              disabled={disabled}
            >
              Delete
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
