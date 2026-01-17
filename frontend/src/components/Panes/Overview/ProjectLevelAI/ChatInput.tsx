import { memo, useState } from "react";
import { IoSend, IoStop } from "react-icons/io5";
import { submitMessage } from "state/actions/ai";
import { route_stop_llm_chat } from "utils/generatedEndpoints";

export const ChatInput = memo(function ChatInput({
  deepThink,
  placeholderText,
  waitingForResponse,
  llmConfigId,
  chatId,
  onNewChatStart,
  onNewChatSettled,
}: {
  deepThink: boolean;
  placeholderText: string | undefined;
  waitingForResponse: boolean;
  llmConfigId: string | null;
  chatId: string | null | undefined;
  onNewChatStart?: () => void;
  onNewChatSettled?: (chatId: string | null, succeeded: boolean) => void;
}) {
  const disabled = !llmConfigId;
  // Keep input state local to this component
  const [inputValue, setInputValue] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (waitingForResponse) {
      if (typeof chatId === "string") {
        await route_stop_llm_chat({ chatId });
      }
      return;
    }

    const trimmedInput = inputValue.trim();
    if (trimmedInput === "") return;
    if (!llmConfigId) return;

    const isFirstMessage = chatId === undefined;
    const messageToSend = inputValue;

    if (isFirstMessage) {
      onNewChatStart?.();
    }

    // Only communicate with parent on submission
    setInputValue("");

    let succeeded = false;
    let submittedChatId: string | null = null;
    try {
      submittedChatId = await submitMessage(
        chatId ?? null,
        messageToSend,
        deepThink,
        llmConfigId,
      );
      succeeded = Boolean(submittedChatId);
    } catch (err) {
      console.error("Failed to submit LLM chat message", err);
    } finally {
      if (isFirstMessage) {
        onNewChatSettled?.(submittedChatId, succeeded);
      }
    }
  };

  const handleKeyDown = (e) => {
    // Only allow Enter key submission when NOT waiting for a response
    if (e.key === "Enter" && !e.shiftKey && !waitingForResponse) {
      e.preventDefault();
      void handleSubmit(e);
    }
  };

  // Local change handler that doesn't affect parent
  const handleChange = (e) => {
    setInputValue(e.target.value);
  };

  return (
    <form onSubmit={handleSubmit} className="flex justify-center">
      <div className="flex w-full max-w-xl gap-2">
        <textarea
          type="text"
          value={inputValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholderText}
          className={`nodrag prose prose-sm my-2 max-h-48 flex-1 resize-none overflow-y-auto rounded-lg border border-setta-200 bg-transparent px-4 py-2 text-setta-800 outline-none [field-sizing:content] hover:bg-setta-100/50 focus:outline-none focus:outline focus:outline-blue-500 dark:border-setta-700 dark:text-white dark:hover:bg-setta-800 dark:focus:bg-setta-800/50 dark:focus:outline-blue-700 ${disabled ? "cursor-not-allowed opacity-30" : "cursor-auto opacity-100"}`}
          disabled={disabled}
        />
        <button
          type="submit"
          disabled={disabled}
          className={`mb-5 cursor-pointer self-end px-2 py-0.5 ${
            waitingForResponse
              ? "text-setta-300 dark:text-setta-600"
              : "text-setta-500 hover:text-blue-500 focus:text-blue-500"
          } focus:outline-none focus:ring-0 dark:hover:text-blue-700`}
        >
          {waitingForResponse ? <IoStop /> : <IoSend />}
        </button>
      </div>
    </form>
  );
});
