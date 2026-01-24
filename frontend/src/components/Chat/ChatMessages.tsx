import * as Accordion from "@radix-ui/react-accordion";
import { CodeBlock } from "components/Section/Layouts/TextBlock";
import {
  ReactNode,
  Ref,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FaBrain } from "react-icons/fa6";
import { IoMdCheckmark } from "react-icons/io";
import { MdErrorOutline } from "react-icons/md";
import { PiWrenchFill } from "react-icons/pi";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { C } from "utils/c";
import {
  APPROVAL_TOOL_NAME,
  type ApprovalPayload,
  type AskUserQuestionPayload,
  QUESTION_TOOL_NAME,
  TODO_TOOL_NAME,
  type TodoListPayload,
  normalizeToolName,
  parseAnswers,
  parseApprovalPayload,
  parseAskUserQuestionPayload,
  parseTodoPayload,
  resolveToolCallArguments,
} from "utils/claudeTools";
import {
  BaseChatMessageUnion,
  ChatRoleEnum,
  ToolCall,
  ToolChatMessage,
} from "utils/generatedTypes";
import { ApprovalCard } from "./ApprovalCard";
import { QuestionCard } from "./QuestionCard";
import { TodoListCard } from "./TodoListCard";
import { useTypewriterEffect } from "./useTypewriterEffect";

type AssistantChatMessage = Extract<
  BaseChatMessageUnion,
  { role: ChatRoleEnum.assistant }
>;
type ChatContentItem = AssistantChatMessage["content"][number];

type ToolResultValue = ToolChatMessage["result"] | string;

type ToolCallContext = {
  todoPayloadById: Record<string, TodoListPayload>;
  questionPayloadById: Record<string, AskUserQuestionPayload>;
  approvalPayloadById: Record<string, ApprovalPayload>;
  latestTodoCallId: string | null;
};

const EMPTY_ASSISTANT_CONTENT: ChatContentItem[] = [];
const IDLE_SPINNER_DELAY_MS = 1000;

type ChatMessageListProps = {
  messages: Array<BaseChatMessageUnion>;
  waitingForResponse: boolean;
  toolCallArguments?: Record<string, string>;
  className?: string;
  scrollRef?: Ref<HTMLDivElement>;
};

type MarkdownContentProps = {
  content: string;
  className: string;
  role: ChatRoleEnum;
  isStreaming: boolean;
  typingIndicator?: boolean;
};

function MarkdownContent({
  content,
  className,
  role,
  isStreaming,
  typingIndicator = false,
}: MarkdownContentProps) {
  const shouldAnimate = role === ChatRoleEnum.assistant && isStreaming;
  const displayText = useTypewriterEffect(content, shouldAnimate, 5);

  return (
    <div
      className={typingIndicator ? "chat-typing" : undefined}
      data-typing={typingIndicator ? "true" : undefined}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        className={className}
        components={{ code: CodeBlock }}
      >
        {displayText}
      </ReactMarkdown>
    </div>
  );
}

function formatToolArgs(args: unknown) {
  if (!args) return "{}";
  if (typeof args === "string") {
    return args;
  }

  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

function getStreamActivityKey(content: ChatContentItem[]): string {
  let textLength = 0;
  let thinkingLength = 0;
  let summaryLength = 0;
  let signatureLength = 0;
  let imageCount = 0;
  for (const item of content) {
    if (item.type === C.LLM_TEXT) {
      textLength += item.text.length;
      continue;
    }
    if (item.type === C.LLM_THINKING) {
      thinkingLength += item.thinking.length;
      if (item.summary) {
        summaryLength += item.summary.length;
      }
      if (item.signature) {
        signatureLength += item.signature.length;
      }
      continue;
    }
    if (item.type === "image_url") {
      imageCount += 1;
    }
  }
  return `${textLength}-${thinkingLength}-${summaryLength}-${signatureLength}-${imageCount}`;
}

function useIdleStreamSpinner(
  shouldTrack: boolean,
  activityKey: string,
  delayMs: number,
): boolean {
  const [showSpinner, setShowSpinner] = useState(false);
  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!shouldTrack) {
      setShowSpinner(false);
      return;
    }
    lastActivityRef.current = Date.now();
    setShowSpinner(false);
  }, [activityKey, shouldTrack]);

  useEffect(() => {
    if (!shouldTrack) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs >= delayMs) {
        setShowSpinner(true);
      }
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [activityKey, delayMs, shouldTrack]);

  return showSpinner;
}

function ChatImage({ url, className }: { url: string; className?: string }) {
  const baseClassName =
    "max-h-64 w-auto max-w-full rounded-md border border-setta-200/70 bg-white";
  const combinedClassName = className
    ? `${baseClassName} ${className}`
    : baseClassName;
  return (
    <img
      src={url}
      alt="Chat attachment"
      className={combinedClassName}
      loading="lazy"
    />
  );
}

const ThinkingBox = memo(function ThinkingBox({
  content,
  summary,
  signature,
  isStreaming,
}: {
  content: string;
  summary: string | null | undefined;
  signature: string | null | undefined;
  isStreaming: boolean;
}) {
  const streaming = !signature && isStreaming;
  const displayText = useTypewriterEffect(content, streaming, 5);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const summaryText = summary?.trim() ?? "";
  const title = summaryText || (streaming ? "Thinking..." : "Reasoning");

  useEffect(() => {
    if (streaming && previewRef.current) {
      previewRef.current.scrollTop = previewRef.current.scrollHeight;
    }
  }, [displayText, streaming]);

  return (
    <Accordion.Root type="single" collapsible>
      <Accordion.Item value="details">
        <Accordion.Trigger className="relative mb-4 flex w-full cursor-pointer overflow-hidden rounded-lg  bg-setta-50 transition-all hover:bg-white hover:shadow-md dark:bg-setta-900 dark:hover:bg-setta-950 dark:hover:shadow-none">
          <div className="flex min-w-[40px] items-center  px-2 py-5 ">
            {streaming ? (
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
              <FaBrain className=" min-w-6 text-setta-200 dark:text-setta-400" />
            )}
          </div>

          <div className="relative my-3 mr-3 flex w-full flex-col gap-1">
            <div className="px-1 text-[11px] font-semibold text-setta-500 dark:text-setta-300">
              <div className="truncate">{title}</div>
            </div>
            <div className="relative w-full overflow-clip rounded-xl border border-solid border-white shadow-[inset_0px_2px_4px_2px_rgb(0_0_0_/_0.15)] dark:border-setta-800/30 dark:bg-setta-860 ">
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

function ToolCallAccordionStatus({
  success,
  isStreaming,
}: {
  success: boolean | undefined;
  isStreaming: boolean;
}) {
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
    <IoMdCheckmark className="mr-1.5 self-center justify-self-end text-setta-300/70" />
  );
}

const ToolCallItem = memo(function ToolCallItem({
  name,
  args,
  result,
  success,
  isStreaming,
}: {
  name: string;
  args: unknown;
  result: ToolResultValue | undefined;
  success: boolean | undefined;
  isStreaming: boolean;
}) {
  const resultDisplay = (() => {
    if (typeof result === "string") {
      if (result.trim().length > 0) {
        return result;
      }
    } else if (typeof result === "number" || typeof result === "boolean") {
      return String(result);
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
        <Accordion.Trigger className="relative flex w-full cursor-pointer items-center justify-between overflow-hidden rounded-md bg-setta-50 transition-all hover:bg-white hover:shadow-md dark:bg-setta-900 dark:hover:bg-setta-950 dark:hover:shadow-none">
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

        <Accordion.Content className="overflow-hidden rounded-b-md data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown data-[state=open]:-mt-2.5 data-[state=open]:mb-2">
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

function StreamItem({
  item,
  isStreaming,
  showTypingIndicator = false,
}: {
  item: ChatContentItem;
  isStreaming: boolean;
  showTypingIndicator?: boolean;
}) {
  switch (item.type) {
    case C.LLM_TEXT:
      return (
        <MarkdownContent
          content={item.text}
          className="prose prose-sm dark:prose-invert prose-headings:tracking-tighter prose-headings:text-setta-600 prose-h1:text-2xl prose-h1:leading-none prose-p:text-sm prose-code:before:hidden prose-code:after:hidden dark:prose-headings:text-setta-300 [&_*]:break-words [&_*]:marker:text-setta-400"
          role={ChatRoleEnum.assistant}
          isStreaming={isStreaming}
          typingIndicator={showTypingIndicator}
        />
      );
    case C.LLM_THINKING:
      return (
        <ThinkingBox
          content={item.thinking}
          summary={item.summary}
          signature={item.signature}
          isStreaming={isStreaming}
        />
      );
    case "image_url":
      return <ChatImage url={item.image_url.url} />;
    default:
      return null;
  }
}

function LLMChatBubble({ children }: { children: ReactNode }) {
  return (
    <div className="my-4 flex justify-start">
      <div className="flex min-h-[25px] w-fit min-w-[25px] max-w-[min(85%,800px)] flex-shrink cursor-text flex-col gap-2 rounded-b-lg rounded-tr-lg bg-setta-100 px-4 py-4 text-setta-800 dark:bg-setta-700/50 dark:text-setta-50">
        {children}
      </div>
    </div>
  );
}

function UserChatBubble({ children }: { children: ReactNode }) {
  return (
    <div className="my-4 flex justify-end">
      <div className="flex w-fit max-w-[min(85%,800px)] flex-shrink cursor-text flex-col gap-3 rounded-t-lg rounded-bl-lg bg-blue-500 px-4 py-4 text-white dark:bg-blue-700">
        {children}
      </div>
    </div>
  );
}

function SystemChatBubble({ children }: { children: ReactNode }) {
  return (
    <div className="my-3 flex justify-center">
      <div className="flex max-w-[min(90%,800px)] cursor-text flex-col gap-2 rounded-md border border-setta-200 bg-setta-50 px-3 py-2 text-xs text-setta-600 dark:border-setta-800 dark:bg-setta-900/60 dark:text-setta-300">
        {children}
      </div>
    </div>
  );
}

const USER_MARKDOWN_CLASS =
  "prose prose-sm text-white dark:prose-invert prose-headings:tracking-tighter prose-headings:text-blue-200 prose-h1:text-2xl prose-h1:leading-none prose-p:text-sm prose-code:before:hidden prose-code:after:hidden [&>p]:inline-block [&_*]:break-words [&_*]:marker:text-setta-400";
const SYSTEM_MARKDOWN_CLASS =
  "prose prose-sm text-setta-600 dark:prose-invert prose-p:text-xs prose-headings:text-xs prose-headings:font-semibold prose-code:before:hidden prose-code:after:hidden [&_*]:break-words";

const ChatMessage = memo(function ChatMessage({
  message,
  toolResultsById,
  toolCallArguments,
  isStreaming,
  toolCallContext,
}: {
  message: BaseChatMessageUnion;
  toolResultsById: Record<string, ToolChatMessage>;
  toolCallArguments: Record<string, string>;
  isStreaming: boolean;
  toolCallContext: ToolCallContext;
}) {
  const isAssistant = message.role === ChatRoleEnum.assistant;
  const assistantContent = isAssistant
    ? message.content
    : EMPTY_ASSISTANT_CONTENT;
  const activityKey = useMemo(
    () => getStreamActivityKey(assistantContent),
    [assistantContent],
  );
  const spinnerDelayMs =
    assistantContent.length === 0 ? 0 : IDLE_SPINNER_DELAY_MS;
  const toolCalls = isAssistant ? message.tool_calls ?? [] : [];
  const showAssistantSpinner = useIdleStreamSpinner(
    isAssistant && isStreaming && toolCalls.length === 0,
    activityKey,
    spinnerDelayMs,
  );
  const lastTextIndex = useMemo(() => {
    let lastIndex = -1;
    for (let i = 0; i < assistantContent.length; i += 1) {
      if (assistantContent[i].type === C.LLM_TEXT) {
        lastIndex = i;
      }
    }
    return lastIndex;
  }, [assistantContent]);

  if (message.role === ChatRoleEnum.assistant) {
    const showTypingIndicator = showAssistantSpinner;
    return (
      <LLMChatBubble>
        {message.content.map((item, idx) => (
          <StreamItem
            key={idx}
            item={item}
            isStreaming={isStreaming}
            showTypingIndicator={showTypingIndicator && idx === lastTextIndex}
          />
        ))}
        {showTypingIndicator && lastTextIndex === -1 ? (
          <span
            className="chat-typing-inline"
            data-typing="true"
            aria-hidden="true"
          />
        ) : null}
        {toolCalls.length > 0 ? (
          <div className="flex flex-col gap-1">
            {toolCalls.map((toolCall: ToolCall) => {
              const toolResult = toolResultsById[toolCall.id];
              const questionPayload =
                toolCallContext.questionPayloadById[toolCall.id];
              if (questionPayload) {
                const resolvedAnswers = resolveQuestionAnswers(
                  questionPayload,
                  toolResult,
                );
                return (
                  <QuestionCard
                    key={toolCall.id}
                    toolCallId={toolCall.id}
                    payload={questionPayload}
                    resolvedAnswers={resolvedAnswers}
                  />
                );
              }
              const todoPayload = toolCallContext.todoPayloadById[toolCall.id];
              if (todoPayload) {
                const summaryOnly =
                  toolCallContext.latestTodoCallId !== toolCall.id;
                return (
                  <TodoListCard
                    key={toolCall.id}
                    todos={todoPayload.todos}
                    summaryOnly={summaryOnly}
                  />
                );
              }
              const approvalPayload =
                toolCallContext.approvalPayloadById[toolCall.id];
              if (approvalPayload) {
                return (
                  <ApprovalCard
                    key={toolCall.id}
                    toolCallId={toolCall.id}
                    toolName={approvalPayload.toolName ?? null}
                    toolType={approvalPayload.toolType ?? null}
                    input={approvalPayload.input}
                    toolResult={toolResult}
                    isStreaming={isStreaming}
                  />
                );
              }
              const argsFromAssistant = toolCall.function?.arguments;
              const pendingArgs = toolCallArguments?.[toolCall.id];
              let argsToDisplay = pendingArgs;
              if (
                toolResult?.arguments &&
                Object.keys(toolResult.arguments).length > 0
              ) {
                argsToDisplay = toolResult.arguments;
              } else if (
                argsFromAssistant &&
                Object.keys(argsFromAssistant).length > 0
              ) {
                argsToDisplay = argsFromAssistant;
              }
              const rawToolName =
                toolResult?.tool_name ||
                toolCall.function?.name ||
                `Tool call ${toolCall.id}`;
              return (
                <ToolCallItem
                  key={toolCall.id}
                  name={rawToolName}
                  args={argsToDisplay}
                  result={formatToolResult(toolResult)}
                  success={toolResult ? !toolResult.is_error : undefined}
                  isStreaming={isStreaming}
                />
              );
            })}
          </div>
        ) : null}
      </LLMChatBubble>
    );
  }

  const content = message.content ?? [];
  let textClassName = USER_MARKDOWN_CLASS;
  let imageClassName = "border-white/30";
  let Wrapper = UserChatBubble;
  if (message.role === ChatRoleEnum.system) {
    textClassName = SYSTEM_MARKDOWN_CLASS;
    imageClassName = "";
    Wrapper = SystemChatBubble;
  }
  const resolvedImageClassName = imageClassName || undefined;

  return (
    <Wrapper>
      {content.map((item, idx) => {
        const key = `${message.id}-${idx}`;
        if (item.type === C.LLM_TEXT) {
          return (
            <MarkdownContent
              key={key}
              content={item.text}
              className={textClassName}
              role={message.role}
              isStreaming={false}
            />
          );
        }
        if (item.type === C.LLM_THINKING) {
          return (
            <MarkdownContent
              key={key}
              content={item.thinking}
              className={`${textClassName} italic`}
              role={message.role}
              isStreaming={false}
            />
          );
        }
        if (item.type === "image_url") {
          return (
            <ChatImage
              key={key}
              url={item.image_url.url}
              className={resolvedImageClassName}
            />
          );
        }
        return null;
      })}
    </Wrapper>
  );
});

function resolveQuestionAnswers(
  payload: AskUserQuestionPayload,
  toolResult: ToolChatMessage | undefined,
): Record<string, string> | null {
  if (toolResult) {
    const parsed = parseAnswers(toolResult.result);
    if (parsed) {
      return parsed;
    }
  }
  if (payload.answers) {
    return payload.answers;
  }
  return null;
}

function ChatMessages({
  messages,
  waitingForResponse,
  toolCallArguments,
  allMessages,
}: {
  messages: Array<BaseChatMessageUnion>;
  waitingForResponse: boolean;
  toolCallArguments: Record<string, string>;
  allMessages: Array<BaseChatMessageUnion>;
}) {
  const toolResultsById = useMemo(
    () => buildToolResultMap(allMessages),
    [allMessages],
  );
  const toolCallContext = useMemo(
    () => buildToolCallContext(allMessages, toolCallArguments),
    [allMessages, toolCallArguments],
  );
  const output: ReactNode[] = [];
  const lastMessage = messages[messages.length - 1];
  let streamingMessageId: string | null = null;
  if (waitingForResponse && lastMessage?.role === ChatRoleEnum.assistant) {
    streamingMessageId = lastMessage.id;
  }
  for (const message of messages) {
    const isStreamingMessage =
      waitingForResponse &&
      message.role === ChatRoleEnum.assistant &&
      message.id === streamingMessageId;
    output.push(
      <ChatMessage
        key={message.id}
        message={message}
        toolResultsById={toolResultsById}
        toolCallArguments={toolCallArguments}
        isStreaming={isStreamingMessage}
        toolCallContext={toolCallContext}
      />,
    );
  }

  if (waitingForResponse && lastMessage?.role !== ChatRoleEnum.assistant) {
    const pendingMessageId = lastMessage?.id
      ? `pending-${lastMessage.id}`
      : "pending";
    const placeholderMessage: AssistantChatMessage = {
      id: pendingMessageId,
      role: ChatRoleEnum.assistant,
      content: [],
      tool_calls: null,
    };
    output.push(
      <ChatMessage
        key={placeholderMessage.id}
        message={placeholderMessage}
        toolResultsById={toolResultsById}
        toolCallArguments={toolCallArguments}
        isStreaming={true}
        toolCallContext={toolCallContext}
      />,
    );
  }

  return output;
}

export const ChatMessageList = memo(function ChatMessageList({
  messages,
  waitingForResponse,
  toolCallArguments,
  className,
  scrollRef,
}: ChatMessageListProps) {
  const filteredMessages = messages.filter(
    (message) => message.role !== ChatRoleEnum.tool,
  );
  const toolArgs = toolCallArguments ?? {};
  const wrapperClassName =
    `flex min-h-0 flex-1 flex-col-reverse overflow-y-auto pr-2 ${className ?? ""}`.trim();

  return (
    <div ref={scrollRef} className={wrapperClassName}>
      <div>
        <ChatMessages
          messages={filteredMessages}
          waitingForResponse={waitingForResponse}
          toolCallArguments={toolArgs}
          allMessages={messages}
        />
      </div>
    </div>
  );
});

function buildToolCallContext(
  messages: Array<BaseChatMessageUnion>,
  toolCallArguments: Record<string, string>,
): ToolCallContext {
  const todoPayloadById: Record<string, TodoListPayload> = {};
  const questionPayloadById: Record<string, AskUserQuestionPayload> = {};
  const approvalPayloadById: Record<string, ApprovalPayload> = {};
  const todoOrder: string[] = [];

  for (const message of messages) {
    if (message.role !== ChatRoleEnum.assistant) {
      continue;
    }
    const toolCalls = message.tool_calls ?? [];
    for (const toolCall of toolCalls) {
      const normalizedName = normalizeToolName(toolCall.function?.name);
      const resolvedArgs = resolveToolCallArguments(
        toolCall,
        toolCallArguments,
      );
      if (!normalizedName) {
        continue;
      }
      if (normalizedName === APPROVAL_TOOL_NAME) {
        const approvalPayload = parseApprovalPayload(resolvedArgs);
        if (!approvalPayload) {
          continue;
        }
        const approvalToolName = normalizeToolName(approvalPayload.toolName);
        if (approvalToolName === QUESTION_TOOL_NAME) {
          const questionPayload = parseAskUserQuestionPayload(
            approvalPayload.input,
          );
          if (questionPayload) {
            questionPayloadById[toolCall.id] = questionPayload;
          }
        } else {
          approvalPayloadById[toolCall.id] = approvalPayload;
        }
        continue;
      }
      if (normalizedName === TODO_TOOL_NAME) {
        const todoPayload = parseTodoPayload(resolvedArgs);
        if (todoPayload) {
          todoPayloadById[toolCall.id] = todoPayload;
          todoOrder.push(toolCall.id);
        }
        continue;
      }
      if (normalizedName === QUESTION_TOOL_NAME) {
        const questionPayload = parseAskUserQuestionPayload(resolvedArgs);
        if (questionPayload) {
          questionPayloadById[toolCall.id] = questionPayload;
        }
      }
    }
  }

  const latestTodoCallId = todoOrder.length
    ? todoOrder[todoOrder.length - 1]
    : null;
  return {
    todoPayloadById,
    questionPayloadById,
    approvalPayloadById,
    latestTodoCallId,
  };
}

function buildToolResultMap(
  messages: Array<BaseChatMessageUnion>,
): Record<string, ToolChatMessage> {
  const map: Record<string, ToolChatMessage> = {};
  for (const message of messages) {
    if (message.role === ChatRoleEnum.tool && message.tool_call_id) {
      map[message.tool_call_id] = message;
    }
  }
  return map;
}

function formatToolResult(
  toolResult: ToolChatMessage | undefined,
): ToolResultValue | undefined {
  if (!toolResult) {
    return undefined;
  }
  if (Array.isArray(toolResult.content) && toolResult.content.length > 0) {
    const renderedEntries = toolResult.content
      .map((entry) => {
        if (entry.type === "text") {
          return entry.text;
        }
        if (entry.type === "tool_reference") {
          return `Tool reference: ${entry.tool_name}`;
        }
        if (entry.type === "resource") {
          const label = entry.resource?.uri
            ? `Resource: ${entry.resource.uri}`
            : "Resource";
          return entry.resource?.mimeType
            ? `${label} (${entry.resource.mimeType})`
            : label;
        }
        if (entry.type === "image") {
          return entry.mimeType ? `Image (${entry.mimeType})` : "Image";
        }
        return JSON.stringify(entry, null, 2);
      })
      .filter((entry) => entry.trim().length > 0);
    if (renderedEntries.length > 0) {
      return renderedEntries.join("\n\n");
    }
  }
  return toolResult.result;
}
