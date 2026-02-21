import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  FormEvent,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { IoAdd, IoAttach, IoClose, IoFolderOpen } from "react-icons/io5";
import { formatBytes } from "utils/attachments";
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

export const ChatMessageEditor = memo(function ChatMessageEditor({
  initialText,
  initialAttachments,
  disabled = false,
  onCancel,
  onSave,
}: ChatMessageEditorProps) {
  const [value, setValue] = useState(initialText);
  const [isSaving, setIsSaving] = useState(false);
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

  const canSubmit = useMemo(() => {
    const trimmed = value.trim();
    return !isDisabled && (trimmed.length > 0 || attachments.length > 0);
  }, [attachments.length, isDisabled, value]);

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

  const textAreaClassName = useMemo(() => {
    const base =
      "w-full resize-none border-0 bg-transparent py-1.5 pl-3 pr-2 text-[13px] leading-5 text-white outline-none placeholder:text-white/70 [field-sizing:content]";
    const dragClass = isDragActive
      ? "rounded-md ring-2 ring-white/40"
      : "";
    if (isDisabled) {
      return `${base} ${dragClass} cursor-not-allowed opacity-60`;
    }
    return `${base} ${dragClass} cursor-text`;
  }, [isDisabled, isDragActive]);

  return (
    <form onSubmit={handleSubmit} className="flex w-full min-w-0 flex-col gap-2">
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
            className="absolute -left-7 top-1.5 z-10 flex flex-col items-center gap-1"
          >
            <DropdownMenu.Root modal={false}>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  aria-label="Attachment options"
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-md border border-transparent text-white/80 transition-colors hover:bg-white/20 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40 ${
                    attachmentInputDisabled
                      ? "cursor-not-allowed opacity-40 hover:bg-transparent"
                      : "cursor-pointer"
                  }`}
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
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-setta-100 hover:text-setta-900 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 dark:hover:bg-setta-800 dark:hover:text-white"
                    onSelect={() => fileInputRef.current?.click()}
                    disabled={attachmentInputDisabled}
                  >
                    <IoAttach />
                    Attach
                  </DropdownMenu.Item>
                  {!isDeploymentMode ? (
                    <DropdownMenu.Item
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-setta-100 hover:text-setta-900 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 dark:hover:bg-setta-800 dark:hover:text-white"
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
          </div>
          <textarea
            aria-label="Edit message"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Edit message..."
            className={textAreaClassName}
            disabled={isDisabled}
            rows={1}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {showSharePolicyMessage ? (
            <span className="text-[10px] uppercase tracking-[0.2em] text-white/70">
              Attachments blocked by share policy
            </span>
          ) : null}
          {showAttachmentDisabledMessage ? (
            <span className="text-[10px] uppercase tracking-[0.2em] text-white/70">
              Attachments disabled
            </span>
          ) : null}
          {isUploading ? (
            <span className="text-[10px] uppercase tracking-[0.2em] text-white/70">
              Uploading...
            </span>
          ) : null}
        </div>
        {attachments.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center gap-2 rounded-md border border-white/40 bg-white/90 px-2 py-1 text-xs text-setta-700"
              >
                <span className="max-w-[200px] truncate">
                  {attachment.name}
                </span>
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
        ) : null}
        {attachmentWarning ? (
          <div
            className="mt-1 rounded-md border border-amber-200 bg-amber-50/90 px-2 py-1 text-xs text-amber-700"
            role="alert"
          >
            {attachmentWarning}
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          className="cursor-pointer rounded-md border border-white/40 px-3 py-1 text-xs font-semibold text-white/80 transition-colors hover:border-white hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          onClick={handleCancel}
          disabled={isSaving}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="cursor-pointer rounded-md bg-white px-3 py-1 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!canSubmit}
        >
          Save
        </button>
      </div>
    </form>
  );
});
