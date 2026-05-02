import {
  type CSSProperties,
  type Dispatch,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useMemo,
} from "react";
import { ChatFileAttachment } from "utils/generatedTypes";
import {
  cycleQueuedDraftSelection,
  type QueuedChatDraft,
} from "../chatInputHelpers";
import { type DictationState } from "../dictation";
import {
  ChatAttachmentsSection,
  ChatComposerFeedbackSection,
  ChatQueuedDraftStack,
  ChatSlashSuggestionsPortal,
} from "./composerSections";
import { CHAT_COMPOSER_GPU_FLOW_CLASS_NAME } from "./shared";

export function ChatInputFormLayout({
  attachmentActionsDisabled,
  attachmentWarning,
  attachments,
  canRenderSlashSuggestionsInPortal,
  composerFieldSection,
  composerMetaSection,
  dictationFeedback,
  dictationState,
  handleClearAttachments,
  handleDragEnter,
  handleDragLeave,
  handleDragOver,
  handleDrop,
  handleFormKeyDown,
  handleRemoveAttachment,
  handleSubmit,
  isUploading,
  queuedDrafts,
  restoreQueuedDraftToComposer,
  selectedQueuedDraftId,
  setSelectedQueuedDraftId,
  showAttachmentDisabledMessage,
  showSharePolicyMessage,
  slashFeedback,
  slashSuggestionsList,
  slashSuggestionsPortalStyle,
}: {
  attachmentActionsDisabled: boolean;
  attachmentWarning: string | null;
  attachments: ChatFileAttachment[];
  canRenderSlashSuggestionsInPortal: boolean;
  composerFieldSection: ReactNode;
  composerMetaSection: ReactNode;
  dictationFeedback: string | null;
  dictationState: DictationState;
  handleClearAttachments: () => void;
  handleDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  handleDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  handleDragOver: (event: DragEvent<HTMLDivElement>) => void;
  handleDrop: (event: DragEvent<HTMLDivElement>) => void;
  handleFormKeyDown: (event: KeyboardEvent<HTMLFormElement>) => void;
  handleRemoveAttachment: (attachmentId: string) => void;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isUploading: boolean;
  queuedDrafts: QueuedChatDraft[];
  restoreQueuedDraftToComposer: (draftId: string) => void;
  selectedQueuedDraftId: string | null;
  setSelectedQueuedDraftId: Dispatch<SetStateAction<string | null>>;
  showAttachmentDisabledMessage: boolean;
  showSharePolicyMessage: boolean;
  slashFeedback: string | null;
  slashSuggestionsList: ReactNode;
  slashSuggestionsPortalStyle: CSSProperties | null;
}) {
  const selectQueuedDraft = useCallback(
    (draftId: string) => {
      setSelectedQueuedDraftId(draftId);
    },
    [setSelectedQueuedDraftId],
  );
  const cycleSelectedQueuedDraft = useCallback(
    (direction: "prev" | "next") => {
      setSelectedQueuedDraftId((current) =>
        cycleQueuedDraftSelection(queuedDrafts, current, direction),
      );
    },
    [queuedDrafts, setSelectedQueuedDraftId],
  );
  const attachmentWarningSection = useMemo(() => {
    if (!attachmentWarning) {
      return null;
    }
    return (
      <div
        className="mb-0.5 rounded-md border border-amber-200 bg-amber-50/80 px-2 py-1 text-xs text-amber-700 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-200"
        role="alert"
      >
        {attachmentWarning}
      </div>
    );
  }, [attachmentWarning]);

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={handleFormKeyDown}
      className={`${CHAT_COMPOSER_GPU_FLOW_CLASS_NAME} flex justify-center`}
      data-gpu-flow-control="chat-composer"
      data-gpu-flow-interactive="true"
    >
      <div className="flex w-full gap-1">
        <div
          className="flex min-w-0 flex-1 flex-col @container"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <ChatQueuedDraftStack
            queuedDrafts={queuedDrafts}
            restoreQueuedDraftToComposer={restoreQueuedDraftToComposer}
            selectedQueuedDraftId={selectedQueuedDraftId}
            selectQueuedDraft={selectQueuedDraft}
            cycleSelectedQueuedDraft={cycleSelectedQueuedDraft}
          />
          {composerFieldSection}
          <ChatComposerFeedbackSection
            dictationFeedback={dictationFeedback}
            dictationState={dictationState}
            isUploading={isUploading}
            showAttachmentDisabledMessage={showAttachmentDisabledMessage}
            showSharePolicyMessage={showSharePolicyMessage}
            slashFeedback={slashFeedback}
          />
          {composerMetaSection}
          <ChatAttachmentsSection
            attachmentActionsDisabled={attachmentActionsDisabled}
            attachments={attachments}
            handleClearAttachments={handleClearAttachments}
            handleRemoveAttachment={handleRemoveAttachment}
          />
          {attachmentWarningSection}
        </div>
      </div>
      <ChatSlashSuggestionsPortal
        canRenderSlashSuggestionsInPortal={canRenderSlashSuggestionsInPortal}
        slashSuggestionsList={slashSuggestionsList}
        slashSuggestionsPortalStyle={slashSuggestionsPortalStyle}
      />
    </form>
  );
}
