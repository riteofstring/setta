import * as Accordion from "@radix-ui/react-accordion";
import { CodeBlock } from "components/Section/Layouts/TextBlock";
import { memo } from "react";
import { IoMdCheckmark } from "react-icons/io";
import { MdErrorOutline } from "react-icons/md";
import { PiWrenchFill } from "react-icons/pi";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import ChatInput from "./ChatInput";

// Reusable Markdown component to avoid duplication
const MarkdownContent = ({ content, className }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm, remarkMath]}
    rehypePlugins={[rehypeKatex]}
    className={className}
    components={{ code: CodeBlock }}
  >
    {content}
  </ReactMarkdown>
);

// Utility function to format tool arguments
const formatToolArgs = (args, jsonSoFar) => {
  if (jsonSoFar) return jsonSoFar;
  if (!args) return "{}";

  const keys = Object.keys(args);
  return keys.length <= 3
    ? keys.map((key) => `${key}: ${JSON.stringify(args[key])}`).join(", ")
    : JSON.stringify(args, null, 2);
};

// Component for tool calls with expandable result
const ToolCall = memo(
  ({ name, args, jsonSoFar, streaming, result, success = true }) => {
    return (
      <Accordion.Root type="single" collapsible>
        <Accordion.Item value="details">
          <Accordion.Trigger className="w-full cursor-pointer overflow-hidden rounded-md bg-setta-50 transition-all hover:bg-white hover:shadow-md dark:bg-setta-700 dark:hover:bg-setta-600">
            <div className="flex w-full items-center justify-between gap-2 px-2 py-2 text-left">
              <div className="-mx-2 -my-5 bg-white/50 px-2 py-5 dark:bg-setta-600/50">
                <PiWrenchFill
                  size={15}
                  className="min-w-6 text-setta-200 dark:text-setta-400"
                />
              </div>

              <div className="break-all px-2 font-mono text-xs font-bold text-setta-500 dark:text-setta-200">
                {name}
                {streaming}
              </div>

              {result &&
                (success ? (
                  <IoMdCheckmark className="text-setta-400" />
                ) : (
                  <MdErrorOutline className="text-red-500" />
                ))}
            </div>
          </Accordion.Trigger>

          <Accordion.Content className="-mt-2.5 mb-2 overflow-hidden rounded-b-md data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown">
            {(args || jsonSoFar) && (
              <div className="bg-setta-800 px-3 pb-2 pt-2.5 text-xs dark:bg-setta-700">
                <pre className="m-0 font-mono text-xs text-white">
                  {formatToolArgs(args, jsonSoFar)}
                </pre>
              </div>
            )}
            {result && (
              <div className="bg-setta-400 p-3 dark:bg-setta-860/50">
                <pre className="m-0 font-mono text-xs text-white dark:text-setta-200">
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

// Component to render a stream sequence item based on its type
const StreamItem = ({ item, idx, streamSequence }) => {
  switch (item.type) {
    case "text":
      return (
        <MarkdownContent
          key={`text-${idx}`}
          content={item.content}
          className="dark:prose-invert prose-headings:tracking-tighter prose-headings:text-setta-600 prose-h1:text-2xl prose-h1:leading-none prose-p:text-sm prose-code:before:hidden prose-code:after:hidden dark:prose-headings:text-setta-300 [&>p]:inline-block [&_*]:break-all"
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

// Style utility function
const getMessageClassName = (role) => {
  const baseClass =
    "prose prose-sm w-fit max-w-[min(85%,800px)] flex-shrink cursor-text px-4 py-2.5";

  const roleClass =
    role === "user"
      ? "rounded-t-lg rounded-bl-lg bg-blue-500 text-white prose-headings:text-blue-200 dark:bg-blue-700"
      : "rounded-b-lg rounded-tr-lg bg-setta-100 text-setta-800 prose-headings:text-setta-600 dark:bg-setta-700/50 dark:text-setta-50 dark:prose-headings:text-setta-300";

  return `${baseClass} ${roleClass} dark:prose-invert prose-headings:tracking-tighter prose-h1:text-2xl prose-h1:leading-none prose-p:text-sm prose-code:before:hidden prose-code:after:hidden [&>p]:inline-block [&_*]:break-all`;
};

// Simplified ChatMessage component
const ChatMessage = memo(({ message }) => {
  // Handle streaming message
  if (message.streamSequence?.length > 0) {
    return (
      <div className="my-4 flex justify-start">
        <div className="prose prose-sm w-fit max-w-[min(85%,800px)] flex-shrink cursor-text rounded-b-lg rounded-tr-lg bg-setta-100 px-4 py-2.5 text-setta-800 dark:bg-setta-700/50 dark:text-setta-50">
          {message.streamSequence.map((item, idx) => (
            <StreamItem
              item={item}
              idx={idx}
              key={idx}
              streamSequence={message.streamSequence}
            />
          ))}
        </div>
      </div>
    );
  }

  // Handle regular message
  return (
    <div
      className={`my-4 flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
    >
      <MarkdownContent
        content={message.content}
        className={getMessageClassName(message.role)}
      />
    </div>
  );
});

// Message list component
const MessageList = memo(function MessageList({ messages }) {
  return (
    <div className="flex h-full min-h-0 flex-col-reverse overflow-y-auto pr-2">
      <div>
        {messages.map((message, idx) => (
          <ChatMessage key={idx} message={message} />
        ))}
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
      <MessageList messages={messages} />
      <ChatInput
        onSubmit={handleSubmit}
        placeholderText={placeholderText}
        isLoading={isLoading}
      />
    </>
  );
});

// Loading component
function LoadingDots() {
  return (
    <div className="flex h-screen items-center justify-center space-x-2 bg-white dark:invert">
      <span className="sr-only">Loading...</span>
      <div className="h-1 w-1 animate-bounce rounded-full bg-black [animation-delay:-0.3s]"></div>
      <div className="h-1 w-1 animate-bounce rounded-full bg-black [animation-delay:-0.15s]"></div>
      <div className="h-1 w-1 animate-bounce rounded-full bg-black"></div>
    </div>
  );
}
