import * as Accordion from "@radix-ui/react-accordion";
import { CodeBlock } from "components/Section/Layouts/TextBlock";
import { memo } from "react";
import { IoMdCheckmark } from "react-icons/io";
import { MdErrorOutline } from "react-icons/md";
import { PiWrenchFill } from "react-icons/pi";
import { TbLayoutDashboard, TbLayoutDashboardFilled } from "react-icons/tb";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import ChatInput from "./ChatInput";
import { useTypewriterEffect } from "./useTypewriterEffect";

function MarkdownContent({ content, className, role, isStreaming }) {
  // Only animate if this is an assistant message that's currently streaming
  const isAssistant = role === "assistant";
  const shouldAnimate = isAssistant && isStreaming;

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

const formatToolArgs = (args, jsonSoFar) => {
  if (jsonSoFar) return jsonSoFar;
  if (!args) return "{}";

  return JSON.stringify(args, null, 2);
};

const ToolCall = memo(
  ({ name, args, jsonSoFar, streaming, result, success = true }) => {
    return (
      <Accordion.Root type="single" collapsible>
        <Accordion.Item value="details">
          <Accordion.Trigger className="my-1 w-full cursor-pointer overflow-hidden rounded-md bg-setta-50 transition-all hover:bg-white hover:shadow-md dark:bg-setta-700 dark:hover:bg-setta-600">
            <div className="relative flex w-full items-center justify-center gap-2 px-2 py-2 text-left">
              <div className="absolute left-2 -mx-2 -my-5 bg-white/50 px-2 py-5 dark:bg-setta-600/50">
                <PiWrenchFill
                  size={15}
                  className="min-w-6 text-setta-200 dark:text-setta-400"
                />
              </div>

              <div className="max-w-[calc(100%_-_6rem)] truncate break-words font-mono text-xs font-bold text-setta-500 dark:text-setta-200">
                {name}
                {streaming}
              </div>

              {result &&
                (success ? (
                  <IoMdCheckmark className="absolute right-2 text-setta-400" />
                ) : (
                  <MdErrorOutline className="absolute right-2 text-red-500" />
                ))}
            </div>
          </Accordion.Trigger>

          <Accordion.Content className="-mt-2.5 mb-2 overflow-hidden rounded-b-md data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown">
            {(args || jsonSoFar) && (
              <div className="bg-setta-300 px-3 pb-2 pt-2.5 text-xs dark:bg-setta-860">
                <h3 className="!mt-2.5 text-xs uppercase dark:text-setta-300">
                  Arguments
                </h3>
                <pre className="m-0 cursor-auto font-mono text-xs text-setta-200">
                  {formatToolArgs(args, jsonSoFar)}
                </pre>
              </div>
            )}
            {result && (
              <div className=" bg-setta-300 p-3  dark:bg-setta-860">
                <h3 className="!mt-0 text-xs uppercase text-setta-700 dark:text-setta-300">
                  Result
                </h3>
                <pre className="m-0 cursor-auto font-mono text-xs text-setta-200">
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
  },
);

const StreamItem = ({ item, idx, streamSequence, isStreaming }) => {
  switch (item.type) {
    case "text":
      return (
        <MarkdownContent
          key={`text-${idx}`}
          content={item.content}
          className="prose prose-sm dark:prose-invert prose-headings:tracking-tighter prose-headings:text-setta-600 prose-h1:text-2xl prose-h1:leading-none prose-p:text-sm prose-code:before:hidden prose-code:after:hidden dark:prose-headings:text-setta-300 [&_*]:break-words"
          role="assistant"
          isStreaming={isStreaming}
        />
      );
    case "tool_call":
      // Check if the next item is a tool_result
      const nextItem = streamSequence[idx + 1];
      const hasResult = nextItem && nextItem.type === "tool_result";
      const resultContent = hasResult ? nextItem.content : null;

      // Determine success/failure status (could be enhanced with more sophisticated detection)
      const isSuccess =
        hasResult &&
        !resultContent?.includes("error") &&
        !resultContent?.includes("fail");

      return (
        <ToolCall
          key={`tool-call-${idx}`}
          name={item.name}
          args={item.args}
          jsonSoFar={item.jsonSoFar}
          streaming={item.streaming}
          result={hasResult ? resultContent : undefined}
          success={isSuccess}
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

const ChatMessage = memo(({ message, isStreaming }) => {
  // Handle streaming message with streamSequence
  if (message.streamSequence) {
    return (
      <LLMChatBubble>
        {message.streamSequence.length === 0 && (
          <i className="gg-spinner !scale-125 self-center justify-self-end text-blue-500/70" />
        )}
        {message.streamSequence.map((item, idx) => (
          <StreamItem
            item={item}
            idx={idx}
            key={idx}
            streamSequence={message.streamSequence}
            isStreaming={isStreaming}
          />
        ))}
      </LLMChatBubble>
    );
  }

  // Handle regular message
  return (
    <div className="my-4 flex justify-end">
      <MarkdownContent
        content={message.content}
        className="prose prose-sm w-fit max-w-[min(85%,800px)] flex-shrink cursor-text rounded-t-lg rounded-bl-lg bg-blue-500 px-4 py-4 text-white dark:prose-invert prose-headings:tracking-tighter prose-headings:text-blue-200 prose-h1:text-2xl prose-h1:leading-none prose-p:text-sm prose-code:before:hidden prose-code:after:hidden dark:bg-blue-700 [&>p]:inline-block [&_*]:break-words"
        role={message.role}
        isStreaming={isStreaming}
      />
    </div>
  );
});

// Message list component
const MessageList = memo(function MessageList({ messages, isLoading }) {
  if (messages.length === 0) {
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
        {messages.map((message, idx) => {
          // Only the last assistant message should be considered streaming when loading
          const isLastAssistantMessage =
            isLoading &&
            message.role === "assistant" &&
            idx === messages.length - 1;

          return (
            <ChatMessage
              key={idx}
              message={message}
              isStreaming={isLastAssistantMessage}
            />
          );
        })}
      </div>
    </div>
  );
});

// Main component
export const ProjectChatCore = memo(function ProjectChatCore({
  messages,
  selectedModel,
  placeholderText,
  handleSubmit,
  isLoading,
}) {
  return (
    <>
      <MessageList messages={messages} isLoading={isLoading} />
      <ChatInput
        onSubmit={handleSubmit}
        placeholderText={placeholderText}
        isLoading={isLoading}
      />
    </>
  );
});
