import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { formatBytes } from "@setta/app-subsystem-frontend-sdk";
import {
  FormEvent,
  RefObject,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { IoAdd, IoAttach, IoClose, IoFolderOpen } from "react-icons/io5";
import { ChatFileAttachment } from "utils/generatedTypes";
import { useChatAttachmentManager } from "./useChatAttachmentManager";

type ChatMessageEditorProps = {
  initialText: string;
  initialAttachments: ChatFileAttachment[];
  disabled?: boolean;
  onCancel: () => void;
  onSave: (
    text: string,
    attachments: ChatFileAttachment[],
  ) => Promise<boolean | void> | boolean | void;
};

type TextAreaHeightTarget = {
  scrollHeight: number;
  style: {
    height: string;
  };
};

type AttachmentMenuProps = {
  attachmentCountLabel: string;
  attachmentInputDisabled: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  handlePickFromProject: () => void;
  isDeploymentMode: boolean;
};

type EditorStatusMessagesProps = {
  messages: string[];
};

type AttachmentChipListProps = {
  attachmentActionsDisabled: boolean;
  attachments: ChatFileAttachment[];
  handleClearAttachments: () => Promise<void>;
  handleRemoveAttachment: (attachment: ChatFileAttachment) => void;
};

const TEXT_AREA_BASE_CLASS =
  "w-full resize-none overflow-y-hidden border-0 bg-transparent pb-5 pl-9 pr-2 pt-1 text-[13px] leading-5 text-inherit outline-none placeholder:text-setta-800/70 dark:placeholder:text-white/70";
const TEXT_AREA_DRAG_CLASS =
  "rounded-md ring-2 ring-blue-500/35 dark:ring-white/40";
const ATTACHMENT_TRIGGER_CLASS =
  "inline-flex h-4 w-4 items-center justify-center rounded-sm border border-transparent text-setta-900/70 transition-colors hover:bg-white/30 hover:text-setta-950 focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:text-white/80 dark:hover:bg-white/20 dark:hover:text-white dark:focus-visible:ring-white/40";
const DROPDOWN_ITEM_CLASS =
  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-setta-100 hover:text-setta-900 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 dark:hover:bg-setta-800 dark:hover:text-white";
const STATUS_MESSAGE_CLASS =
  "text-[10px] uppercase tracking-[0.2em] text-setta-900/70 dark:text-white/70";

function syncTextAreaHeight(textArea: TextAreaHeightTarget | null): void {
  if (!textArea) {
    return;
  }
  textArea.style.height = "0px";
  textArea.style.height = `${textArea.scrollHeight}px`;
}

function getTextAreaClassName(
  isDisabled: boolean,
  isDragActive: boolean,
): string {
  const dragClass = isDragActive ? TEXT_AREA_DRAG_CLASS : "";
  if (isDisabled) {
    return `${TEXT_AREA_BASE_CLASS} ${dragClass} cursor-not-allowed opacity-60`;
  }
  return `${TEXT_AREA_BASE_CLASS} ${dragClass} cursor-text`;
}

function getEditorStatusMessages(
  showSharePolicyMessage: boolean,
  showAttachmentDisabledMessage: boolean,
  isUploading: boolean,
): string[] {
  const messages: string[] = [];
  if (showSharePolicyMessage) {
    messages.push("Attachments blocked by share policy");
  }
  if (showAttachmentDisabledMessage) {
    messages.push("Attachments disabled");
  }
  if (isUploading) {
    messages.push("Uploading...");
  }
  return messages;
}

function AttachmentMenu({
  attachmentCountLabel,
  attachmentInputDisabled,
  fileInputRef,
  handlePickFromProject,
  isDeploymentMode,
}: AttachmentMenuProps) {
  const triggerClassName = attachmentInputDisabled
    ? `${ATTACHMENT_TRIGGER_CLASS} cursor-not-allowed opacity-40 hover:bg-transparent`
    : `${ATTACHMENT_TRIGGER_CLASS} cursor-pointer`;

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Attachment options"
          className={triggerClassName}
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
            className={DROPDOWN_ITEM_CLASS}
            onSelect={() => fileInputRef.current?.click()}
            disabled={attachmentInputDisabled}
          >
            <IoAttach />
            Attach
          </DropdownMenu.Item>
          {!isDeploymentMode ? (
            <DropdownMenu.Item
              className={DROPDOWN_ITEM_CLASS}
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
  );
}

function EditorStatusMessages({ messages }: EditorStatusMessagesProps) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 pt-0.5">
      {messages.map((message) => (
        <span key={message} className={STATUS_MESSAGE_CLASS}>
          {message}
        </span>
      ))}
    </div>
  );
}

function AttachmentChipList({
  attachmentActionsDisabled,
  attachments,
  handleClearAttachments,
  handleRemoveAttachment,
}: AttachmentChipListProps) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="mt-0.5 flex flex-wrap gap-2">
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className="flex items-center gap-2 rounded-md border border-white/40 bg-white/90 px-2 py-1 text-xs text-setta-700"
        >
          <span className="max-w-[200px] truncate">{attachment.name}</span>
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
          className="rounded-full border border-white/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/80 hover:border-white hover:text-white"
          onClick={handleClearAttachments}
          disabled={attachmentActionsDisabled}
        >
          Clear all
        </button>
      ) : null}
    </div>
  );
}

export const ChatMessageEditor = memo(function ChatMessageEditor({
  initialText,
  initialAttachments,
  disabled = false,
  onCancel,
  onSave,
}: ChatMessageEditorProps) {
  const [value, setValue] = useState(initialText);
  const [isSaving, setIsSaving] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const isDisabled = disabled || isSaving;
  const {
    attachments,
    attachmentActionsDisabled,
    attachmentCountLabel,
    attachmentInputDisabled,
    attachmentWarning,
    fileInputRef,
    handleClearAttachments,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFileInputChange,
    handlePickFromProject,
    handleRemoveAttachment,
    isDragActive,
    isDeploymentMode,
    isUploading,
    showAttachmentDisabledMessage,
    showSharePolicyMessage,
  } = useChatAttachmentManager({
    disabled: isDisabled,
    initialAttachments,
    preserveInitialArtifacts: true,
  });

  useEffect(() => {
    setValue(initialText);
  }, [initialText]);
  useEffect(() => {
    syncTextAreaHeight(textAreaRef.current);
  }, [value]);

  const canSubmit = useMemo(() => {
    const trimmed = value.trim();
    return !isDisabled && (trimmed.length > 0 || attachments.length > 0);
  }, [attachments.length, isDisabled, value]);
  const statusMessages = useMemo(
    () =>
      getEditorStatusMessages(
        showSharePolicyMessage,
        showAttachmentDisabledMessage,
        isUploading,
      ),
    [isUploading, showAttachmentDisabledMessage, showSharePolicyMessage],
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canSubmit) {
        return;
      }
      setIsSaving(true);
      try {
        const result = await onSave(value, attachments);
        if (result === false) {
          return;
        }
      } finally {
        setIsSaving(false);
      }
    },
    [attachments, canSubmit, onSave, value],
  );

  const handleCancel = useCallback(async () => {
    if (isSaving) {
      return;
    }
    await handleClearAttachments();
    onCancel();
  }, [handleClearAttachments, isSaving, onCancel]);

  const textAreaClassName = useMemo(
    () => getTextAreaClassName(isDisabled, isDragActive),
    [isDisabled, isDragActive],
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full min-w-0 flex-col gap-1"
    >
      <div
        className="flex min-w-0 flex-1 flex-col"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="group relative w-full">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
            disabled={attachmentInputDisabled}
          />
          <div
            data-chat-editor-side-rail="true"
            className="absolute left-2 top-1.5 z-10 flex flex-col items-center gap-1"
          >
            <AttachmentMenu
              attachmentCountLabel={attachmentCountLabel}
              attachmentInputDisabled={attachmentInputDisabled}
              fileInputRef={fileInputRef}
              handlePickFromProject={handlePickFromProject}
              isDeploymentMode={isDeploymentMode}
            />
          </div>
          <textarea
            ref={textAreaRef}
            aria-label="Edit message"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              syncTextAreaHeight(event.currentTarget);
            }}
            placeholder="Edit message..."
            className={textAreaClassName}
            disabled={isDisabled}
            rows={1}
          />
          <div className="absolute bottom-1 right-1 flex items-center gap-1">
            <button
              type="button"
              className="h-4 cursor-pointer rounded border border-white/35 px-1.5 text-[10px] font-semibold leading-none text-white/80 transition-colors hover:border-white hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              onClick={handleCancel}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-4 cursor-pointer rounded bg-white px-1.5 text-[10px] font-semibold leading-none text-blue-600 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canSubmit}
            >
              Save
            </button>
          </div>
        </div>
        <EditorStatusMessages messages={statusMessages} />
        <AttachmentChipList
          attachmentActionsDisabled={attachmentActionsDisabled}
          attachments={attachments}
          handleClearAttachments={handleClearAttachments}
          handleRemoveAttachment={handleRemoveAttachment}
        />
        {attachmentWarning ? (
          <div
            className="mt-0.5 rounded-md border border-amber-200 bg-amber-50/90 px-2 py-1 text-xs text-amber-700"
            role="alert"
          >
            {attachmentWarning}
          </div>
        ) : null}
      </div>
    </form>
  );
});
