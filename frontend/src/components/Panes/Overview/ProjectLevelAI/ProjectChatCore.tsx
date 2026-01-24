import * as Accordion from "@radix-ui/react-accordion";
import { CodeBlock } from "components/Section/Layouts/TextBlock";
import {
  Dispatch,
  SetStateAction,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { FaBrain } from "react-icons/fa6";
import { IoMdCheckmark } from "react-icons/io";
import { MdErrorOutline } from "react-icons/md";
import { PiWrenchFill } from "react-icons/pi";
import { TbLayoutDashboard, TbLayoutDashboardFilled } from "react-icons/tb";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import {
  clearPendingChatDetails,
  getDefaultChatDetails,
  getLLMChat,
  initializePendingChatDetails,
} from "state/actions/ai";
import { useAIStore } from "state/definitions";
import { C } from "utils/c";
import { ChatRoleEnum } from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import { ChatInput } from "./ChatInput";
import { useTypewriterEffect } from "./useTypewriterEffect";

function MarkdownContent({ content, className, role, isStreaming }) {
  // Only animate if this is an assistant message that's currently streaming
  const shouldAnimate = role === ChatRoleEnum.assistant && isStreaming;

  // Use the typewriter effect
  const displayText = useTypewriterEffect(
    content,
    shouldAnimate,
    5, // typing speed
  );

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      className={className}
      components={{ code: CodeBlock }}
    >
      {displayText}
    </ReactMarkdown>
  );
}

const formatToolArgs = (args) => {
  if (!args) return "{}";
  if (typeof args === "string") {
    return args;
  }

  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
};

const ThinkingBox = memo(({ content, signature, isStreaming }) => {
  // signature is an empty string until thinking is done
  const _isStreaming = !signature && isStreaming;

  const displayText = useTypewriterEffect(
    content,
    _isStreaming,
    5, // typing speed
  );

  // Create a ref for the preview container
  const previewRef = useRef(null);

  // Auto-scroll to bottom when content changes during streaming
  useEffect(() => {
    if (_isStreaming && previewRef.current) {
      previewRef.current.scrollTop = previewRef.current.scrollHeight;
    }
  }, [displayText, _isStreaming]);

  return (
    <Accordion.Root type="single" collapsible>
      <Accordion.Item value="details">
        <Accordion.Trigger className="relative mb-4 flex w-full cursor-pointer overflow-hidden rounded-lg  bg-setta-50 transition-all hover:bg-white hover:shadow-md dark:bg-setta-900 dark:hover:bg-setta-950 dark:hover:shadow-none">
          <div className="flex min-w-[40px] items-center  px-2 py-5 ">
            {_isStreaming ? (
              <div className="single-cell-container">
                <FaBrain
                  className="single-cell-child min-w-6 animate-ping text-setta-200 dark:text-setta-400"
                  size={15}
                />
                <FaBrain
                  className="single-cell-child min-w-6 text-setta-200 dark:text-setta-400"
                  size={15}
                />
              </div>
            ) : (
              // <i className="gg-spinner !scale-100 text-blue-500/70" />

              <FaBrain
                className=" min-w-6 text-setta-200 dark:text-setta-400"
                size={15}
              />
            )}
          </div>

          <div className="relative my-3 mr-3 w-full overflow-clip rounded-xl border border-solid border-white shadow-[inset_0px_2px_4px_2px_rgb(0_0_0_/_0.15)] dark:border-setta-800/30 dark:bg-setta-860 ">
            <div
              ref={previewRef}
              className="top-bottom-fade h-20 overflow-y-auto px-3 py-2 text-xs text-setta-300 dark:text-setta-500"
              style={{
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}
            >
              {displayText}
            </div>
          </div>
        </Accordion.Trigger>
        <Accordion.Content className="-mt-6 mb-2 overflow-hidden rounded-b-md bg-setta-200 px-3 pb-3 pt-4 data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown dark:bg-setta-860">
          <MarkdownContent
            content={content}
            className="prose prose-sm dark:prose-invert prose-headings:tracking-tighter prose-headings:text-setta-600 prose-h1:text-2xl prose-h1:leading-none prose-p:text-sm prose-code:before:hidden prose-code:after:hidden dark:prose-headings:text-setta-300 [&_*]:break-words"
            role={ChatRoleEnum.assistant}
            isStreaming={isStreaming}
          />
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
});

function ToolCallAccordionStatus({ success, isStreaming }) {
  if (success === true) {
    return (
      <IoMdCheckmark className="mr-1.5 self-center justify-self-end text-setta-400" />
    );
  }
  if (success === false) {
    return (
      <MdErrorOutline className="mr-1.5 self-center justify-self-end text-red-500" />
    );
  }
  if (isStreaming) {
    return (
      <i className="gg-spinner mr-1.5 !scale-75 self-center justify-self-end text-setta-400 dark:text-setta-300/70" />
    );
  }
  return (
    <i className="gg-spinner mr-1.5 !scale-75 self-center justify-self-end text-setta-400 dark:text-setta-300/70" />
  );
}

const ToolCall = memo(({ name, args, result, success, isStreaming }) => {
  const resultDisplay = (() => {
    if (typeof result === "string" && result.trim().length > 0) {
      return result;
    }
    if (result && typeof result === "object") {
      try {
        return JSON.stringify(result, null, 2);
      } catch {
        return String(result);
      }
    }
    if (success === false) {
      return "Tool execution failed";
    }
    if (success === true) {
      return "Tool completed successfully";
    }
    return null;
  })();

  return (
    <Accordion.Root type="single" collapsible>
      <Accordion.Item value="details">
        <Accordion.Trigger className="relative my-1 flex w-full cursor-pointer items-center justify-between overflow-hidden rounded-md bg-setta-50 transition-all hover:bg-white hover:shadow-md dark:bg-setta-900 dark:hover:bg-setta-950 dark:hover:shadow-none">
          <div className="px-2 py-2 ">
            <PiWrenchFill
              size={15}
              className="min-w-6 text-setta-200 dark:text-setta-400"
            />
          </div>

          <div className="max-w-[calc(100%_-_6rem)] truncate break-words font-mono text-xs font-bold text-setta-500 dark:text-setta-200">
            {name}
          </div>
          <ToolCallAccordionStatus
            success={success}
            isStreaming={isStreaming}
          />
        </Accordion.Trigger>

        <Accordion.Content className="-mt-2.5 mb-2 overflow-hidden rounded-b-md data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown">
          {args && (
            <div className="bg-setta-200/50 px-3 pb-2 pt-2.5 text-xs dark:bg-setta-860">
              <h3 className="!mt-2.5 text-xs font-bold uppercase text-setta-600 dark:text-setta-300">
                Arguments
              </h3>
              <pre className="m-0 cursor-auto whitespace-pre-wrap break-words font-mono text-xs text-setta-600 dark:text-setta-200">
                {formatToolArgs(args)}
              </pre>
            </div>
          )}
          {resultDisplay && (
            <div className=" bg-setta-200 p-3  dark:bg-setta-900">
              <h3 className="!mt-0 text-xs font-bold uppercase text-setta-600 dark:text-setta-300">
                Result
              </h3>
              <pre className="m-0 cursor-auto whitespace-pre-wrap break-words font-mono text-xs text-setta-600 dark:text-setta-200">
                {resultDisplay}
              </pre>
            </div>
          )}
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
});

const StreamItem = ({ item, isStreaming }) => {
  switch (item.type) {
    case C.LLM_TEXT:
      return (
        <MarkdownContent
          content={item.text}
          className="prose prose-sm dark:prose-invert prose-headings:tracking-tighter prose-headings:text-setta-600 prose-h1:text-2xl prose-h1:leading-none prose-p:text-sm prose-code:before:hidden prose-code:after:hidden dark:prose-headings:text-setta-300 [&_*]:break-words [&_*]:marker:text-setta-400 "
          role={ChatRoleEnum.assistant}
          isStreaming={isStreaming}
        />
      );
    case C.LLM_THINKING:
      return (
        <ThinkingBox
          content={item.thinking}
          signature={item.signature}
          isStreaming={isStreaming}
        />
      );
    default:
      return null;
  }
};

function LLMChatBubble({ children }) {
  return (
    <div className="my-4 flex justify-start">
      <div className="min-h-[25px] w-fit min-w-[25px] max-w-[min(85%,800px)] flex-shrink cursor-text rounded-b-lg rounded-tr-lg bg-setta-100 px-4 py-4 text-setta-800 dark:bg-setta-700/50 dark:text-setta-50">
        {children}
      </div>
    </div>
  );
}

const ChatMessage = memo(
  ({
    message,
    toolResultsById,
    toolCallArguments,
    isStreaming,
    waitingForResponse,
  }) => {
    if (message.role === ChatRoleEnum.tool) {
      return null;
    }

    if (message.role === ChatRoleEnum.assistant) {
      const toolCalls = message.tool_calls ?? [];
      const showAssistantSpinner =
        isStreaming && message.content.length === 0 && toolCalls.length === 0;
      return (
        <LLMChatBubble>
          {showAssistantSpinner && (
            <i className="gg-spinner !scale-125 self-center justify-self-end text-blue-500/70" />
          )}
          {message.content.map((item, idx) => (
            <StreamItem key={idx} item={item} isStreaming={isStreaming} />
          ))}
          {toolCalls.map((toolCall) => {
            const toolResult = toolResultsById[toolCall.id];
            const argsFromAssistant = toolCall.function?.arguments;
            const pendingArgs = toolCallArguments?.[toolCall.id];
            const argsToDisplay =
              toolResult?.arguments &&
              Object.keys(toolResult.arguments).length > 0
                ? toolResult.arguments
                : argsFromAssistant && Object.keys(argsFromAssistant).length > 0
                  ? argsFromAssistant
                  : pendingArgs;
            return (
              <ToolCall
                key={toolCall.id}
                name={
                  toolResult?.tool_name ||
                  toolCall.function?.name ||
                  `Tool call ${toolCall.id}`
                }
                args={argsToDisplay}
                result={formatToolResult(toolResult)}
                success={toolResult ? !toolResult.is_error : undefined}
                isStreaming={Boolean(waitingForResponse && !toolResult)}
              />
            );
          })}
        </LLMChatBubble>
      );
    }

    return (
      <div className="my-4 flex justify-end">
        <MarkdownContent
          content={message.content?.[0]?.text ?? ""}
          className="prose prose-sm w-fit max-w-[min(85%,800px)] flex-shrink cursor-text rounded-t-lg rounded-bl-lg bg-blue-500 px-4 py-4 text-white dark:prose-invert prose-headings:tracking-tighter prose-headings:text-blue-200 prose-h1:text-2xl prose-h1:leading-none prose-p:text-sm prose-code:before:hidden prose-code:after:hidden dark:bg-blue-700 [&>p]:inline-block [&_*]:break-words [&_*]:marker:text-setta-400"
          role={message.role}
          isStreaming={false}
        />
      </div>
    );
  },
);

function ChatMessages({
  messages,
  waitingForResponse,
  toolCallArguments,
  allMessages,
}) {
  const toolResultsById = useMemo(
    () => buildToolResultMap(allMessages ?? messages),
    [allMessages, messages],
  );
  const output = [];
  for (const [idx, message] of messages.entries()) {
    output.push(
      <ChatMessage
        key={idx}
        message={message}
        toolResultsById={toolResultsById}
        toolCallArguments={toolCallArguments}
        isStreaming={
          waitingForResponse && message.role === ChatRoleEnum.assistant
        }
        waitingForResponse={waitingForResponse}
      />,
    );
  }

  if (
    waitingForResponse &&
    messages[messages.length - 1]?.role !== ChatRoleEnum.assistant
  ) {
    output.push(
      <ChatMessage
        key={messages.length}
        message={{ role: ChatRoleEnum.assistant, content: [] }}
        toolResultsById={toolResultsById}
        toolCallArguments={toolCallArguments}
        isStreaming={true}
        waitingForResponse={waitingForResponse}
      />,
    );
  }
  return output;
}

// Message list component
const MessageList = memo(function MessageList({
  messages,
  waitingForResponse,
  chatId,
  toolCallArguments,
}) {
  const filteredMessages = messages.filter(
    (message) => message.role !== ChatRoleEnum.tool,
  );

  if (typeof chatId === "undefined") {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center gap-4 overflow-y-auto">
        <button className="flex cursor-pointer items-center gap-1 rounded-md border border-solid border-setta-200/50 px-3 py-2 text-xs font-semibold text-setta-600 transition-colors hover:bg-white hover:text-setta-800 dark:border-setta-700 dark:text-setta-500 dark:hover:bg-setta-850 hover:dark:text-setta-50">
          <TbLayoutDashboard /> Create Project UI
        </button>
        <button className="flex cursor-pointer items-center gap-1 rounded-md border border-solid border-setta-200/50 px-3 py-2 text-xs font-semibold text-setta-600 transition-colors hover:bg-white hover:text-setta-800 dark:border-setta-700 dark:text-setta-500 dark:hover:bg-setta-850 hover:dark:text-setta-50">
          <TbLayoutDashboardFilled />
          Create Project UI & Values
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto pr-2">
      <div>
        <ChatMessages
          messages={filteredMessages}
          waitingForResponse={waitingForResponse}
          toolCallArguments={toolCallArguments}
          allMessages={messages}
        />
      </div>
    </div>
  );
});

// Main component
export const ProjectChatCore = memo(function ProjectChatCore({
  chatId,
  placeholderText,
  deepThink,
  llmConfigId,
  setChatId,
}: {
  chatId: string | null | undefined;
  placeholderText: string;
  deepThink: boolean;
  llmConfigId: string | null;
  setChatId: Dispatch<SetStateAction<string | null | undefined>>;
}) {
  const { messages, toolCallArguments, waitingForResponse } = useAIStore(
    (state) => {
      if (chatId === null) {
        return state.pendingChatDetails ?? getDefaultChatDetails();
      }
      if (typeof chatId !== "string") {
        return getDefaultChatDetails();
      }
      return state.chatDetails[chatId] ?? getDefaultChatDetails();
    },
    shallow,
  );

  useEffect(() => {
    if (typeof chatId !== "string") {
      return;
    }
    getLLMChat(chatId);
  }, [chatId]);

  const handleNewChatStart = useCallback(() => {
    initializePendingChatDetails();
    setChatId(null);
  }, [initializePendingChatDetails, setChatId]);

  const handleNewChatSettled = useCallback(
    (newChatId: string | null, succeeded: boolean) => {
      clearPendingChatDetails();
      setChatId((currentChatId) => {
        if (currentChatId !== null) {
          return currentChatId;
        }
        if (!succeeded || !newChatId) {
          return undefined;
        }
        return newChatId;
      });
    },
    [clearPendingChatDetails, setChatId],
  );

  return (
    <>
      <MessageList
        messages={messages}
        waitingForResponse={waitingForResponse}
        chatId={chatId}
        toolCallArguments={toolCallArguments}
      />
      <ChatInput
        deepThink={deepThink}
        placeholderText={placeholderText}
        waitingForResponse={waitingForResponse}
        llmConfigId={llmConfigId}
        chatId={chatId}
        onNewChatStart={handleNewChatStart}
        onNewChatSettled={handleNewChatSettled}
      />
    </>
  );
});

function buildToolResultMap(messages) {
  if (!messages) {
    return {};
  }
  const map = {};
  for (const message of messages) {
    if (message.role === ChatRoleEnum.tool && message.tool_call_id) {
      map[message.tool_call_id] = message;
    }
  }
  return map;
}

function formatToolResult(toolResult) {
  if (!toolResult) {
    return undefined;
  }
  if (Array.isArray(toolResult.content) && toolResult.content.length > 0) {
    return toolResult.content
      .map((entry) => {
        if (entry.type === "text") {
          return entry.text;
        }
        return JSON.stringify(entry, null, 2);
      })
      .join("\n\n");
  }
  return toolResult.result;
}
