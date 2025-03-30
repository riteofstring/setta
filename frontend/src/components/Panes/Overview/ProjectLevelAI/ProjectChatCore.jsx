import { CodeBlock } from "components/Section/Layouts/TextBlock";
import { IoSend } from "react-icons/io5";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

export function ProjectChatCore({
  messages,
  selectedModel,
  placeholderText,
  handleSubmit,
  currMessage,
  setCurrMessage,
  isLoading,
}) {
  const onSubmit = (e) => {
    e.preventDefault();
    if (currMessage.trim() === "") return;
    if (isLoading) return; // Prevent multiple submissions while loading

    // Pass the message to parent component
    handleSubmit(currMessage);

    // Clear the input field
    setCurrMessage("");
  };

  // Add an onKeyDown handler
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault(); // Prevent default to avoid new line
      onSubmit(e);
    }
  };

  return (
    <>
      <div className="flex h-full min-h-0 flex-col-reverse overflow-y-auto pr-2">
        <div>
          {messages.map((message, idx) => (
            <div
              key={idx}
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
          ))}
        </div>
      </div>

      {/* Message input */}
      <form onSubmit={onSubmit} className="">
        <div className="flex gap-2">
          <textarea
            type="text"
            value={currMessage}
            onChange={(e) => setCurrMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isLoading ? "Waiting for response..." : placeholderText
            }
            disabled={isLoading}
            className="nodrag prose prose-sm my-2 max-h-48 flex-1 resize-none overflow-y-auto rounded-lg border border-setta-200 bg-transparent px-4 py-2 text-setta-800 outline-none [field-sizing:content] hover:bg-setta-100/50 focus:outline-none focus:outline focus:outline-blue-500 dark:border-setta-700 dark:text-white dark:hover:bg-setta-800 dark:focus:bg-setta-800/50 dark:focus:outline-blue-700"
          />
          <button
            type="submit"
            disabled={isLoading}
            className={`mb-5 cursor-pointer self-end px-2 py-0.5 ${
              isLoading
                ? "text-setta-300 dark:text-setta-600"
                : "text-setta-500 hover:text-blue-500 focus:text-blue-500"
            } focus:outline-none focus:ring-0 dark:hover:text-blue-700`}
          >
            <IoSend />
          </button>
        </div>
      </form>
    </>
  );
}
