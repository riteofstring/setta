import { DropdownInput } from "components/Params/ParamUIs/DropdownInput";
import { CodeBlock } from "components/Section/Layouts/TextBlock";
import { useState } from "react";
import { IoMdArrowRoundBack } from "react-icons/io";
import { IoSend } from "react-icons/io5";
import { MdAdd } from "react-icons/md";
import { RiChatHistoryLine } from "react-icons/ri";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { ProjectChatHistory } from "./ProjectChatHistory";

// Global variable to maintain structure
let didInitialize = false;

// Global project chat component
export function ProjectAIChat() {
  // Sample static messages
  const messages = [
    {
      role: "assistant",
      content: "Welcome to the project chat! How can I help you today?",
    },
    {
      role: "user",
      content: "Can you help me analyze this data?",
    },
    {
      role: "assistant",
      content:
        "Of course! I'd be happy to help analyze your data. Could you please upload the file or share more details about what kind of analysis you're looking for?",
    },
  ];

  return <ProjectAIChatContainer messages={messages} />;
}

function ProjectAIChatContainer({ messages }) {
  // Using useState for minimal toggling functionality
  const [viewHistory, setViewHistory] = useState(false);

  // Hardcoded values
  const selectedModel = "Claude 3.7 Sonnet";
  const modelOptions = [
    "Claude 3 Opus",
    "Claude 3 Sonnet",
    "Claude 3.7 Sonnet",
    "GPT-4o",
  ];
  const placeholderText = "Type a message...";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <nav className="flex min-h-[60px] items-center gap-2 border-b border-setta-100 py-4 dark:border-setta-800">
        <button
          className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-400 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-500 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-blue-950"
          onClick={() => setViewHistory(false)}
        >
          <MdAdd size={15} />
        </button>
        <button
          className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-400 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-500 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-blue-950"
          onClick={() => setViewHistory(!viewHistory)}
        >
          {viewHistory ? (
            <>
              <IoMdArrowRoundBack />
              <p>Return to chat</p>
            </>
          ) : (
            <RiChatHistoryLine size={15} />
          )}
        </button>

        {viewHistory ? null : (
          <div className="ml-auto max-w-64">
            <DropdownInput
              options={modelOptions}
              onChange={() => {}}
              value={selectedModel}
              placeholder="Select an LLM model"
              outerDivClasses="max-w-64 justify-center"
            />
          </div>
        )}
      </nav>
      {viewHistory ? (
        <ProjectChatHistory />
      ) : (
        <ProjectChatCore
          messages={messages}
          selectedModel={selectedModel}
          placeholderText={placeholderText}
        />
      )}
    </div>
  );
}

function ProjectChatCore({ messages, selectedModel, placeholderText }) {
  // Using minimal state for the input field
  const [newMessage, setNewMessage] = useState("");

  return (
    <>
      <div className="flex h-full min-h-0 flex-col-reverse overflow-y-auto">
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

      <div className="relative flex min-h-[58px] items-center gap-2 ">
        <textarea
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder={placeholderText}
          className="nodrag h-min max-h-48 flex-1 resize-none overflow-y-auto rounded-lg border border-setta-100 bg-transparent px-4 py-2 text-setta-800 outline-none [field-sizing:content] hover:bg-setta-100/50 focus:outline-none focus:outline focus:outline-blue-500 dark:border-setta-700 dark:text-white dark:hover:bg-setta-800 dark:focus:bg-setta-800/50 dark:focus:outline-blue-700"
        />
        <button
          type="submit"
          className="cursor-pointer px-2 py-0.5 text-setta-500 hover:text-blue-500 focus:text-blue-500 focus:outline-none focus:ring-0 dark:hover:text-blue-700"
        >
          <IoSend />
        </button>
      </div>
    </>
  );
}
