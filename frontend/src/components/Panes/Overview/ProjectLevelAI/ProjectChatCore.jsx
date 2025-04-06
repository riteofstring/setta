import { CodeBlock } from "components/Section/Layouts/TextBlock";
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import ChatInput from "./ChatInput";

// Create a memoized message component to prevent unnecessary re-renders
const ChatMessage = memo(({ message }) => {
  return (
    <div
      className={`my-4 flex ${
        message.role === "user" ? "justify-end" : "justify-start"
      }`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        className={`prose prose-sm w-fit max-w-[min(85%,800px)] flex-shrink cursor-text px-4 py-2.5 ${
          message.role === "user"
            ? "rounded-t-lg rounded-bl-lg bg-blue-500 text-white prose-headings:text-blue-200 dark:bg-blue-700"
            : "rounded-b-lg rounded-tr-lg bg-setta-100 text-setta-800 prose-headings:text-setta-600 dark:bg-setta-700/50 dark:text-setta-50 dark:prose-headings:text-setta-300"
        } dark:prose-invert prose-headings:tracking-tighter prose-h1:text-2xl prose-h1:leading-none prose-p:text-sm prose-code:before:hidden prose-code:after:hidden [&>p]:inline-block [&_*]:break-words`}
        components={{
          code: CodeBlock,
        }}
      >
        {message.content}
      </ReactMarkdown>
    </div>
  );
});

ChatMessage.displayName = "ChatMessage";

// Separate memoized messages list component
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

// Main component with memoization
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

      {/* Use the isolated ChatInput component */}
      <ChatInput
        onSubmit={handleSubmit}
        placeholderText={placeholderText}
        isLoading={isLoading}
      />
    </>
  );
});
