import * as Accordion from "@radix-ui/react-accordion";
import { CodeBlock } from "components/Section/Layouts/TextBlock";
import C from "constants/constants.json";
import { memo, useEffect, useRef } from "react";
import { FaBrain } from "react-icons/fa6";
import { IoMdCheckmark } from "react-icons/io";
import { MdCode, MdErrorOutline } from "react-icons/md";
import { PiWrenchFill } from "react-icons/pi";
import { TbLayoutDashboard, TbLayoutDashboardFilled } from "react-icons/tb";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import {
  getDefaultChatDetails,
  getLLMChat,
  startStreamingInto,
  stopStreamingInto,
} from "state/actions/ai";
import { goToSection } from "state/actions/sections/sectionPositions";
import { useAIStore, useSectionInfos } from "state/definitions";
import { shallow } from "zustand/shallow";
import { ChatInput } from "./ChatInput";
import { useTypewriterEffect } from "./useTypewriterEffect";

function MarkdownContent({ content, className, role, isStreaming }) {
  // Only animate if this is an assistant message that's currently streaming
  const shouldAnimate = role === C.LLM_ASSISTANT_ROLE && isStreaming;

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

  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return args;
  }
};

const StreamingIntoCodeBlock = memo(function StreamingIntoCodeBlock({
  sectionId,
  isStreaming,
  done,
}) {
  const sectionName = useSectionInfos((x) => x.x[sectionId]?.name);

  return (
    <Accordion.Root type="single" collapsible>
      <Accordion.Item value="details">
        <Accordion.Trigger className="relative my-1 flex w-full cursor-pointer items-center justify-between overflow-hidden rounded-md bg-setta-50 transition-all hover:bg-white hover:shadow-md dark:bg-setta-900 dark:hover:bg-setta-950 dark:hover:shadow-none">
          <div className="px-2 py-2 ">
            <MdCode
              size={15}
              className="min-w-6 text-setta-200 dark:text-setta-400"
            />
          </div>

          <div className="max-w-[calc(100%_-_6rem)] truncate break-words font-mono text-xs font-bold text-setta-500 dark:text-setta-200">
            {sectionName ? (
              <>
                Writing code in{" "}
                <span
                  className="cursor-pointer text-blue-500 hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                  onClick={(e) => {
                    e.stopPropagation();
                    goToSection(sectionId);
                  }}
                >
                  {sectionName}
                </span>
              </>
            ) : (
              "Writing code"
            )}
          </div>
          {done ? (
            <IoMdCheckmark className="mr-1.5 text-setta-400" />
          ) : isStreaming && !done ? (
            <i className="gg-spinner !scale-125 self-center justify-self-end text-setta-500/70" />
          ) : null}
        </Accordion.Trigger>

        <Accordion.Content className="-mt-2.5 mb-2 overflow-hidden rounded-b-md data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown">
          <div className="bg-setta-300 p-3 dark:bg-setta-860">
            <div className="text-xs text-setta-700 dark:text-setta-300">
              {sectionName ? (
                <>
                  Code is being written to section{" "}
                  <span
                    className="cursor-pointer text-blue-500 hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    {sectionName}
                  </span>
                </>
              ) : (
                "Code is being written"
              )}
              {done ? " (completed)" : ""}
            </div>
          </div>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
});

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
            role={C.LLM_ASSISTANT_ROLE}
            isStreaming={isStreaming}
          />
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
});

function ToolCallAccordionStatus({ result, success, isStreaming }) {
  if (result) {
    return success ? (
      <IoMdCheckmark className="mr-1.5 self-center justify-self-end text-setta-400" />
    ) : (
      <MdErrorOutline className="mr-1.5 self-center justify-self-end text-red-500" />
    );
  } else if (isStreaming) {
    return (
      <i className="gg-spinner mr-1.5 !scale-75 self-center justify-self-end text-setta-400 dark:text-setta-300/70" />
    );
  }
  return (
    <i className="gg-spinner mr-1.5 !scale-75 self-center justify-self-end text-setta-400 dark:text-setta-300/70" />
  );
}

const ToolCall = memo(({ name, args, result, success, isStreaming }) => {
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
            result={result}
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
              <pre className="m-0 cursor-auto font-mono text-xs text-setta-600 dark:text-setta-200">
                {formatToolArgs(args)}
              </pre>
            </div>
          )}
          {result && (
            <div className=" bg-setta-200 p-3  dark:bg-setta-900">
              <h3 className="!mt-0 text-xs font-bold uppercase text-setta-600 dark:text-setta-300">
                Result
              </h3>
              <pre className="m-0 cursor-auto font-mono text-xs text-setta-600 dark:text-setta-200">
                {typeof result === "string"
                  ? result
                  : typeof result === "object"
                    ? JSON.stringify(result, null, 2)
                    : success
                      ? "Tool completed successfully"
                      : "Tool execution failed"}
              </pre>
            </div>
          )}
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
});

const StreamItem = ({ item, toolResults = {}, isStreaming }) => {
  switch (item.type) {
    case C.LLM_TEXT:
      return (
        <MarkdownContent
          content={item.text}
          className="prose prose-sm dark:prose-invert prose-headings:tracking-tighter prose-headings:text-setta-600 prose-h1:text-2xl prose-h1:leading-none prose-p:text-sm prose-code:before:hidden prose-code:after:hidden dark:prose-headings:text-setta-300 [&_*]:break-words [&_*]:marker:text-setta-400 "
          role={C.LLM_ASSISTANT_ROLE}
          isStreaming={isStreaming}
        />
      );
    case C.LLM_TOOL_USE:
      // Get the result for this tool_use if available
      const toolResult = toolResults[item.id];
      const hasResult = !!toolResult;

      // Determine success/failure status
      const isSuccess = hasResult && !toolResult.is_error;

      return (
        <ToolCall
          name={item.name}
          args={item.input}
          result={hasResult ? toolResult.content?.[0]?.text : undefined}
          success={isSuccess}
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
    case C.LLM_STREAMING_INTO_CODE_BLOCK:
      return (
        <StreamingIntoCodeBlock
          sectionId={item.sectionId}
          isStreaming={isStreaming}
          done={item.done}
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

const ChatMessage = memo(({ message, toolResults, isStreaming }) => {
  if (message.role === C.LLM_ASSISTANT_ROLE) {
    return (
      <LLMChatBubble>
        {message.content.length === 0 && isStreaming && (
          <i className="gg-spinner !scale-125 self-center justify-self-end text-blue-500/70" />
        )}
        {message.content.map((item, idx) => (
          <StreamItem
            key={idx}
            item={item}
            toolResults={toolResults}
            isStreaming={isStreaming}
          />
        ))}
      </LLMChatBubble>
    );
  }

  return (
    <div className="my-4 flex justify-end">
      <MarkdownContent
        content={message.content[0].text}
        className="prose prose-sm w-fit max-w-[min(85%,800px)] flex-shrink cursor-text rounded-t-lg rounded-bl-lg bg-blue-500 px-4 py-4 text-white dark:prose-invert prose-headings:tracking-tighter prose-headings:text-blue-200 prose-h1:text-2xl prose-h1:leading-none prose-p:text-sm prose-code:before:hidden prose-code:after:hidden dark:bg-blue-700 [&>p]:inline-block [&_*]:break-words [&_*]:marker:text-setta-400"
        role={message.role}
        isStreaming={false}
      />
    </div>
  );
});

function ChatMessages({ messages, toolResults, waitingForResponse }) {
  const output = [];
  for (const [idx, message] of messages.entries()) {
    output.push(
      <ChatMessage
        key={idx}
        message={message}
        toolResults={toolResults}
        isStreaming={
          waitingForResponse && message.role === C.LLM_ASSISTANT_ROLE
        }
      />,
    );
  }

  // add a temporary empty message for loading spinner to appear in
  if (
    waitingForResponse &&
    messages[messages.length - 1]?.role !== C.LLM_ASSISTANT_ROLE
  ) {
    output.push(
      <ChatMessage
        key={messages.length}
        message={{ role: C.LLM_ASSISTANT_ROLE, content: [] }}
        toolResults={toolResults}
        isStreaming={true}
      />,
    );
  }
  return output;
}

// Message list component
const MessageList = memo(function MessageList({
  messages,
  toolResults,
  waitingForResponse,
  idToUUIDForLLM,
  currentChatId,
}) {
  // TODO: make more efficient
  const consolidatedMessages = consolidateAssistantMessages(
    messages,
    idToUUIDForLLM,
  );

  if (!currentChatId) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center gap-4 overflow-y-auto">
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
    <div className="flex h-full min-h-0 flex-col-reverse overflow-y-auto pr-2">
      <div>
        <ChatMessages
          messages={consolidatedMessages}
          toolResults={toolResults}
          waitingForResponse={waitingForResponse}
        />
      </div>
    </div>
  );
});

// Main component
export const ProjectChatCore = memo(function ProjectChatCore({
  placeholderText,
  deepThink,
  userSelectedLLM,
}) {
  const {
    messages,
    toolResults,
    waitingForResponse,
    idToUUIDForLLM,
    currentChatId,
  } = useAIStore((x) => {
    const details = x.chatDetails[x.currentChatId];
    if (!x.currentChatId || !details) {
      return { ...getDefaultChatDetails(), currentChatId: x.currentChatId };
    }
    const { messages, toolResults, waitingForResponse } = details;
    return {
      messages,
      toolResults,
      waitingForResponse,
      idToUUIDForLLM: x.idToUUIDForLLM,
      currentChatId: x.currentChatId,
    };
  }, shallow);

  useEffect(() => {
    if (currentChatId) {
      getLLMChat(currentChatId);
    }
  }, [currentChatId]);

  console.log("idToUUIDForLLM", idToUUIDForLLM);

  return (
    <>
      <MessageList
        messages={messages}
        toolResults={toolResults}
        waitingForResponse={waitingForResponse}
        idToUUIDForLLM={idToUUIDForLLM}
        currentChatId={currentChatId}
      />
      <ChatInput
        deepThink={deepThink}
        placeholderText={placeholderText}
        waitingForResponse={waitingForResponse}
        userSelectedLLM={userSelectedLLM}
        currentChatId={currentChatId}
      />
    </>
  );
});

// Consolidate assistant messages and handle tool results
const consolidateAssistantMessages = (messages, idToUUIDForLLM) => {
  const processedMessages = [];
  let currentAssistantMessage = null;

  for (const message of messages) {
    // If this is an assistant message
    if (message.role === C.LLM_ASSISTANT_ROLE) {
      // If we're already building an assistant message, add this content to it
      if (currentAssistantMessage) {
        currentAssistantMessage.content.push(...message.content);
      } else {
        // Start a new assistant message
        currentAssistantMessage = {
          ...message,
          content: [...message.content],
        };
      }
    } else {
      // User message - add the current assistant message if we have one
      if (currentAssistantMessage) {
        processedMessages.push(currentAssistantMessage);
        currentAssistantMessage = null;
      }
      processedMessages.push(message);
    }
  }

  // Add the last assistant message if there is one
  if (currentAssistantMessage) {
    processedMessages.push(currentAssistantMessage);
  }

  // Second pass: filter out text content between startStreamingInto and stopStreamingInto
  const finalMessages = [];
  let sectionId;

  for (const message of processedMessages) {
    if (message.role === C.LLM_ASSISTANT_ROLE) {
      const filteredContent = [];
      let streamingItem = null;

      for (const item of message.content) {
        if (
          item.type === C.LLM_TOOL_USE &&
          item.name === startStreamingInto.name
        ) {
          sectionId = idToUUIDForLLM[item.input.sectionId];
          streamingItem = {
            type: C.LLM_STREAMING_INTO_CODE_BLOCK,
            sectionId,
            done: false,
          };
          filteredContent.push(streamingItem);
        } else if (
          item.type === C.LLM_TOOL_USE &&
          item.name === stopStreamingInto.name
        ) {
          streamingItem.done = true;
          streamingItem = null;
        } else if (streamingItem && item.type === "text") {
          // Skip text content while streaming
        } else {
          filteredContent.push(item);
        }
      }

      if (filteredContent.length > 0) {
        finalMessages.push({
          ...message,
          content: filteredContent,
        });
      }
    } else {
      finalMessages.push(message);
    }
  }

  return finalMessages;
};
