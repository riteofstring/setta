import { type ChatStarterPrompt } from "components/Chat/chatComposerControls";
import { ChatInput } from "components/Chat/ChatInput";
import { ChatMessageList } from "components/Chat/ChatMessages";
import { type ComponentProps } from "react";

const CHAT_WIDTH_SHELL_CLASS_NAME = "mx-auto w-full min-w-0 max-w-[72rem] px-2";

type ProjectChatMessageListProps = Omit<
  ComponentProps<typeof ChatMessageList>,
  "contentClassName"
>;

type ProjectChatInputProps = ComponentProps<typeof ChatInput>;

function ProjectChatEmptyState({
  starterPrompts,
  disabled,
  onStarterPrompt,
}: {
  starterPrompts: ChatStarterPrompt[];
  disabled: boolean;
  onStarterPrompt: (prompt: string) => void;
}) {
  const starterButtonClassName =
    "cursor-pointer rounded-md border border-setta-200 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-setta-600 transition-colors hover:border-setta-400 hover:text-setta-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:border-setta-500 dark:hover:text-setta-100";

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto p-3">
      {starterPrompts.map((starterPrompt) => (
        <button
          key={starterPrompt.id}
          type="button"
          className={starterButtonClassName}
          onClick={() => onStarterPrompt(starterPrompt.prompt)}
          disabled={disabled}
        >
          {starterPrompt.label}
        </button>
      ))}
    </div>
  );
}

export function ProjectChatConversationSurface({
  blockedReason,
  showEmptyState,
  showConversationSearchEmptyState,
  visibleStarterPrompts,
  isDisabled,
  onStarterPrompt,
  messageListProps,
  chatInputProps,
}: {
  blockedReason: string | null;
  showEmptyState: boolean;
  showConversationSearchEmptyState: boolean;
  visibleStarterPrompts: ChatStarterPrompt[];
  isDisabled: boolean;
  onStarterPrompt: (prompt: string) => void;
  messageListProps: ProjectChatMessageListProps;
  chatInputProps: ProjectChatInputProps;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
      {blockedReason ? (
        <div
          role="alert"
          data-testid="project-chat-thread-blocked-banner"
          className="mx-auto mt-2 w-full max-w-[72rem] rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-600/70 dark:bg-amber-950/40 dark:text-amber-200"
        >
          {blockedReason}
        </div>
      ) : null}
      {showEmptyState ? (
        <div
          className={`${CHAT_WIDTH_SHELL_CLASS_NAME} flex min-h-0 flex-1 flex-col`}
          data-chat-width-shell="true"
        >
          <ProjectChatEmptyState
            starterPrompts={visibleStarterPrompts}
            disabled={isDisabled}
            onStarterPrompt={onStarterPrompt}
          />
        </div>
      ) : showConversationSearchEmptyState ? (
        <div
          className={`${CHAT_WIDTH_SHELL_CLASS_NAME} flex min-h-0 flex-1 items-center justify-center`}
          data-chat-width-shell="true"
        >
          <p className="text-xs text-setta-500 dark:text-setta-400">
            No messages match this filter.
          </p>
        </div>
      ) : (
        <ChatMessageList
          {...messageListProps}
          contentClassName={CHAT_WIDTH_SHELL_CLASS_NAME}
        />
      )}
      <div className={CHAT_WIDTH_SHELL_CLASS_NAME} data-chat-width-shell="true">
        <ChatInput {...chatInputProps} />
      </div>
    </div>
  );
}
