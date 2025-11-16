import * as Accordion from "@radix-ui/react-accordion";
import { CodeBlock } from "components/Section/Layouts/TextBlock";
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
import { useAIStore, useProjectState } from "state/definitions";
import { C } from "utils/c";
import type {
  ChatMessage as PersistedChatMessage,
  IDToUUIDForLLM,
  LLMContentBlock,
  LLMReasoningBlock,
  LLMTextBlock,
  LLMToolCallBlock,
  ToolResult as ToolResultPayload,
} from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import { ChatInput } from "./ChatInput";
import { useTypewriterEffect } from "./useTypewriterEffect";

type ToolResultsMap = Record<string, ToolResultPayload>;

type StreamingIntoBlock = {
  type: typeof C.LLM_STREAMING_INTO_CODE_BLOCK;
  sectionId: string | null;
  done: boolean;
  isError: boolean;
  content: string | null;
};

type LegacyThinkingBlock = {
  type: typeof C.LLM_THINKING;
  thinking: string;
  signature?: string;
};

type ChatContentItem = LLMContentBlock | StreamingIntoBlock | LegacyThinkingBlock;

type DisplayChatMessage = Omit<PersistedChatMessage, "content"> & {
  content: ChatContentItem[];
};

function isLLMTextBlock(item: ChatContentItem): item is LLMTextBlock {
  return item.type === "text";
}

function isToolCallBlock(item: ChatContentItem): item is LLMToolCallBlock {
  return item.type === "tool_call";
}

function isReasoningBlock(item: ChatContentItem): item is LLMReasoningBlock {
  return item.type === "reasoning";
}

function isLegacyThinkingBlock(
  item: ChatContentItem,
): item is LegacyThinkingBlock {
  return item.type === C.LLM_THINKING;
}

function parseToolArgumentsObject(
  block: LLMToolCallBlock,
): Record<string, unknown> | null {
  const { arguments_json: jsonValue, arguments_text } = block;
  if (
    jsonValue &&
    typeof jsonValue === "object" &&
    !Array.isArray(jsonValue)
  ) {
    return jsonValue as Record<string, unknown>;
  }
  if (typeof arguments_text === "string" && arguments_text.trim()) {
    try {
      const parsed = JSON.parse(arguments_text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function getToolArgumentsPayload(block: LLMToolCallBlock): unknown {
  if (block.arguments_json !== undefined && block.arguments_json !== null) {
    return block.arguments_json;
  }
  if (typeof block.arguments_text === "string" && block.arguments_text.trim()) {
    try {
      return JSON.parse(block.arguments_text);
    } catch {
      return block.arguments_text;
    }
  }
  return null;
}

function getToolResultValue(result: ToolResultPayload | undefined): unknown {
  if (!result) {
    return null;
  }
  if (typeof result.output_text === "string") {
    return result.output_text;
  }
  if (result.output_json !== undefined && result.output_json !== null) {
    return result.output_json;
  }
  return null;
}

function getToolResultText(result: ToolResultPayload | undefined): string | null {
  const value = getToolResultValue(result);
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function resolveSectionId(
  sectionId: unknown,
  idToUUIDForLLM: IDToUUIDForLLM | null,
): string | null {
  if (typeof sectionId !== "string") {
    return null;
  }
  if (idToUUIDForLLM && sectionId in idToUUIDForLLM) {
    return idToUUIDForLLM[sectionId];
  }
  return sectionId;
}

function getStreamingSectionId(
  block: LLMToolCallBlock,
  idToUUIDForLLM: IDToUUIDForLLM | null,
): string | null {
  const args = parseToolArgumentsObject(block);
  if (!args) {
    return null;
  }
  if ("sectionId" in args) {
    const { sectionId } = args as { sectionId: unknown };
    return resolveSectionId(sectionId, idToUUIDForLLM);
  }
  return null;
}

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

const formatToolArgs = (args: unknown): string => {
  if (args === null || args === undefined) {
    return "{}";
  }

  if (typeof args === "string") {
    return args;
  }

  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
};

function StreamingIntoCodeBlockMessage({ sectionName, sectionId }) {
  return sectionName ? (
    <>
      Writing into section{" "}
      <span
        className="cursor-pointer text-blue-500 hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
        onClick={(e) => {
          e.stopPropagation();
          if (sectionId) {
            goToSection(sectionId);
          }
        }}
      >
        {sectionName}
      </span>
    </>
  ) : (
    "Writing into a section"
  );
}

function StreamingIntoCodeBlockError({ sectionName, sectionId, errorMessage }) {
  return sectionName ? (
    <>
      Failed to write into{" "}
      <span
        className="cursor-pointer text-blue-500 hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
        onClick={(e) => {
          e.stopPropagation();
          if (sectionId) {
            goToSection(sectionId);
          }
        }}
      >
        {sectionName}
      </span>
      : {errorMessage}
    </>
  ) : (
    `Failed to write into a section: ${errorMessage}`
  );
}

const StreamingIntoCodeBlock = memo(function StreamingIntoCodeBlock({
  sectionId,
  isStreaming,
  done,
  isError,
  content,
}) {
  const sectionName = useProjectState((x) =>
    sectionId ? x.sections[sectionId]?.name : undefined,
  );

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
            <StreamingIntoCodeBlockMessage
              sectionName={sectionName}
              sectionId={sectionId}
            />
          </div>
          {done ? (
            <IoMdCheckmark className="mr-1.5 text-setta-400" />
          ) : isError ? (
            <MdErrorOutline className="mr-1.5 self-center justify-self-end text-red-500" />
          ) : isStreaming ? (
            <i className="gg-spinner !scale-125 self-center justify-self-end text-setta-500/70" />
          ) : null}
        </Accordion.Trigger>

        <Accordion.Content className="-mt-2.5 mb-2 overflow-hidden rounded-b-md data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown">
          <div className="bg-setta-300 p-3 dark:bg-setta-860">
            <div className="text-xs text-setta-700 dark:text-setta-300">
              {isError ? (
                <StreamingIntoCodeBlockError
                  sectionName={sectionName}
                  sectionId={sectionId}
                  errorMessage={content}
                />
              ) : (
                <StreamingIntoCodeBlockMessage
                  sectionName={sectionName}
                  sectionId={sectionId}
                />
              )}
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

type ToolCallAccordionStatusProps = {
  result: unknown;
  success: boolean | undefined;
  isStreaming: boolean;
};

function ToolCallAccordionStatus({
  result,
  success,
  isStreaming,
}: ToolCallAccordionStatusProps) {
  const hasResult =
    result !== null && result !== undefined && result !== "";
  if (hasResult) {
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

type ToolCallProps = {
  name: string;
  args: unknown;
  result: unknown;
  success: boolean | undefined;
  isStreaming: boolean;
};

const ToolCall = memo(function ToolCall({
  name,
  args,
  result,
  success,
  isStreaming,
}: ToolCallProps) {
  const hasArgs = args !== null && args !== undefined;
  const hasResult = result !== null && result !== undefined;
  const formattedResult = hasResult ? formatToolArgs(result) : null;

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
          {hasArgs ? (
            <div className="bg-setta-200/50 px-3 pb-2 pt-2.5 text-xs dark:bg-setta-860">
              <h3 className="!mt-2.5 text-xs font-bold uppercase text-setta-600 dark:text-setta-300">
                Arguments
              </h3>
              <pre className="m-0 cursor-auto font-mono text-xs text-setta-600 dark:text-setta-200">
                {formatToolArgs(args)}
              </pre>
            </div>
          ) : null}
          {hasResult && formattedResult ? (
            <div className=" bg-setta-200 p-3  dark:bg-setta-900">
              <h3 className="!mt-0 text-xs font-bold uppercase text-setta-600 dark:text-setta-300">
                Result
              </h3>
              <pre className="m-0 cursor-auto font-mono text-xs text-setta-600 dark:text-setta-200">
                {formattedResult}
              </pre>
            </div>
          ) : null}
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
});

type StreamItemProps = {
  item: ChatContentItem;
  toolResults?: ToolResultsMap;
  isStreaming: boolean;
};

const StreamItem = ({
  item,
  toolResults = {},
  isStreaming,
}: StreamItemProps) => {
  if (isLLMTextBlock(item)) {
    return (
      <MarkdownContent
        content={item.text}
        className="prose prose-sm dark:prose-invert prose-headings:tracking-tighter prose-headings:text-setta-600 prose-h1:text-2xl prose-h1:leading-none prose-p:text-sm prose-code:before:hidden prose-code:after:hidden dark:prose-headings:text-setta-300 [&_*]:break-words [&_*]:marker:text-setta-400 "
        role={C.LLM_ASSISTANT_ROLE}
        isStreaming={isStreaming}
      />
    );
  }

  if (isToolCallBlock(item)) {
    const toolResult = toolResults[item.tool_call_id];
    const resultValue = getToolResultValue(toolResult);
    const success = toolResult ? !toolResult.is_error : undefined;
    return (
      <ToolCall
        name={item.name || "Tool call"}
        args={getToolArgumentsPayload(item)}
        result={resultValue}
        success={success}
        isStreaming={isStreaming && !toolResult}
      />
    );
  }

  if (isReasoningBlock(item) || isLegacyThinkingBlock(item)) {
    const content = isReasoningBlock(item) ? item.text : item.thinking;
    const signature = isReasoningBlock(item) ? item.label : item.signature;
    return (
      <ThinkingBox
        content={content}
        signature={signature}
        isStreaming={isStreaming}
      />
    );
  }

  if (item.type === C.LLM_STREAMING_INTO_CODE_BLOCK) {
    return (
      <StreamingIntoCodeBlock
        sectionId={item.sectionId}
        isStreaming={isStreaming}
        done={item.done}
        isError={item.isError}
        content={item.content}
      />
    );
  }

  return null;
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

type ChatMessageProps = {
  message: DisplayChatMessage;
  toolResults: ToolResultsMap;
  isStreaming: boolean;
};

const ChatMessage = memo(function ChatMessage({
  message,
  toolResults,
  isStreaming,
}: ChatMessageProps) {
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

type ChatMessagesProps = {
  messages: DisplayChatMessage[];
  toolResults: ToolResultsMap;
  waitingForResponse: boolean;
};

function ChatMessages({
  messages,
  toolResults,
  waitingForResponse,
}: ChatMessagesProps) {
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
type MessageListProps = {
  messages: PersistedChatMessage[];
  toolResults: ToolResultsMap;
  waitingForResponse: boolean;
  idToUUIDForLLM: IDToUUIDForLLM | null;
  currentChatId: string | null;
};

const MessageList = memo(function MessageList({
  messages,
  toolResults,
  waitingForResponse,
  idToUUIDForLLM,
  currentChatId,
}: MessageListProps) {
  // TODO: make more efficient
  const consolidatedMessages = consolidateAssistantMessages(
    messages,
    toolResults,
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
      toolResults: toolResults ?? {},
      waitingForResponse,
      idToUUIDForLLM: x.idToUUIDForLLM ?? null,
      currentChatId: x.currentChatId,
    };
  }, shallow);

  useEffect(() => {
    if (currentChatId) {
      getLLMChat(currentChatId);
    }
  }, [currentChatId]);

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
const consolidateAssistantMessages = (
  messages: PersistedChatMessage[],
  toolResults: ToolResultsMap,
  idToUUIDForLLM: IDToUUIDForLLM | null,
): DisplayChatMessage[] => {
  const processedMessages: DisplayChatMessage[] = [];
  let currentAssistantMessage: DisplayChatMessage | null = null;

  for (const message of messages) {
    if (message.role === C.LLM_ASSISTANT_ROLE) {
      if (currentAssistantMessage) {
        currentAssistantMessage.content.push(...message.content);
      } else {
        currentAssistantMessage = {
          ...message,
          content: [...message.content],
        };
      }
    } else {
      if (currentAssistantMessage) {
        processedMessages.push(currentAssistantMessage);
        currentAssistantMessage = null;
      }
      processedMessages.push({
        ...message,
        content: [...message.content],
      });
    }
  }

  if (currentAssistantMessage) {
    processedMessages.push(currentAssistantMessage);
  }

  const finalMessages: DisplayChatMessage[] = [];

  for (const message of processedMessages) {
    if (message.role === C.LLM_ASSISTANT_ROLE) {
      const filteredContent: ChatContentItem[] = [];
      let streamingItem: StreamingIntoBlock | null = null;

      for (const item of message.content) {
        if (
          isToolCallBlock(item) &&
          item.name === startStreamingInto.name
        ) {
          const sectionId = getStreamingSectionId(item, idToUUIDForLLM);
          const toolResult = toolResults[item.tool_call_id];
          streamingItem = {
            type: C.LLM_STREAMING_INTO_CODE_BLOCK,
            sectionId,
            done: false,
            isError: toolResult?.is_error ?? false,
            content: getToolResultText(toolResult),
          };
          filteredContent.push(streamingItem);
          continue;
        }
        if (
          streamingItem &&
          isToolCallBlock(item) &&
          item.name === stopStreamingInto.name
        ) {
          streamingItem.done = true;
          streamingItem = null;
          continue;
        }
        if (streamingItem && isLLMTextBlock(item)) {
          continue;
        }
        filteredContent.push(item);
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
