import { DropdownInput } from "components/Params/ParamUIs/DropdownInput";
import { CodeBlock } from "components/Section/Layouts/TextBlock";
import _ from "lodash";
import { useState } from "react";
import { IoSend } from "react-icons/io5";
import { MdAdd } from "react-icons/md";
import { RiChatHistoryLine } from "react-icons/ri";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { sendToInteractiveTasks } from "state/actions/interactive";
import { useArtifacts } from "state/definitions";
import useDeepCompareEffect from "use-deep-compare-effect";

// Global project chat that doesn't require a specific section
export function ProjectAIChat() {
  // Instead of using section-based artifacts, we'll find chat artifacts directly
  const chatArtifacts = useArtifacts((state) => {
    const allArtifacts = state.x;
    // Find artifacts that look like chat data
    for (const id in allArtifacts) {
      if (
        allArtifacts[id]?.value &&
        Array.isArray(allArtifacts[id].value) &&
        allArtifacts[id].value.length > 0 &&
        allArtifacts[id].value[0]?.role
      ) {
        // Return the first chat-like artifact we find
        return { id, messages: allArtifacts[id].value };
      }
    }
    // No chat artifacts found
    return { id: null, messages: [] };
  }, _.isEqual);

  console.log("ProjectAIChat found chat artifact:", chatArtifacts);

  // Use found messages or default welcome message
  const messages =
    chatArtifacts.messages.length > 0
      ? chatArtifacts.messages
      : [
          {
            role: "assistant",
            content: "Welcome to the project chat! How can I help you today?",
          },
        ];

  // Generate a temporary ID if we don't have a real one
  const chatId = chatArtifacts.id || "project_chat";

  return <ProjectAIChatCore chatId={chatId} messages={messages} />;
}

function ProjectAIChatCore({ chatId, messages }) {
  const [viewHistory, setViewHistory] = useState(false);
  return (
    <div className="flex h-full min-h-0 flex-col ">
      <nav className="flex items-center gap-2 border-b border-setta-100 py-4 dark:border-setta-800">
        <button className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-400 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-500 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-blue-950">
          <MdAdd size={15} />
        </button>
        <button className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-400 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-500 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-blue-950">
          <RiChatHistoryLine size={15} />
        </button>

        <DropdownInput
          options={["GPT-4", "Claude 3.7", "Mixtral"]}
          onChange={() => {}}
          value={""}
          placeholder="Select an LLM model."
          outerDivClasses="max-w-64 justify-center ml-auto"
        />
        {/* <button className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-400 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-500 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-blue-950">
          <IoSettingsOutline size={15} />
        </button> */}
      </nav>
      {viewHistory ? (
        <ProjectChatHistory />
      ) : (
        <ProjectChatCore messages={messages} />
      )}
    </div>
  );
}

function ProjectChatCore({ messages }) {
  const [pendingUserMessages, setPendingUserMessages] = useState([]);

  const [newMessage, setNewMessage] = useState("");

  const handleSubmit = (e) => {
    if (e) {
      e.preventDefault();
    }
    if (newMessage.trim() === "") return;

    // Send to a project-level chat handler
    sendToInteractiveTasks(["project", "chatMessage"], newMessage);

    setPendingUserMessages((x) => [
      ...x,
      { role: "user", content: newMessage },
    ]);
    setNewMessage("");
  };

  // Add an onKeyDown handler
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault(); // Prevent default to avoid new line
      handleSubmit();
    }
  };

  useDeepCompareEffect(() => {
    setPendingUserMessages([]);
  }, [messages]);
  return (
    <>
      <div className="flex h-full min-h-0 flex-col-reverse overflow-y-auto">
        <div>
          {[...messages, ...pendingUserMessages].map((message, idx) => (
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
      <form onSubmit={handleSubmit} className="min-h-[58px] pb-2 pt-2">
        <div className="flex space-x-2">
          <textarea
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="nodrag max-h-48 flex-1 resize-none overflow-y-auto rounded-lg border border-setta-100 bg-transparent px-4 py-2 text-setta-800 outline-none [field-sizing:content] hover:bg-setta-100/50 focus:outline-none focus:outline focus:outline-blue-500 dark:border-setta-700 dark:text-white dark:hover:bg-setta-800 dark:focus:bg-setta-800/50 dark:focus:outline-blue-700"
          />
          <button
            type="submit"
            className="mb-3 cursor-pointer self-end px-2 py-0.5 text-setta-500 hover:text-blue-500 focus:text-blue-500 focus:outline-none focus:ring-0 dark:hover:text-blue-700"
          >
            <IoSend />
          </button>
        </div>
      </form>
    </>
  );
}

function ProjectChatHistory() {
  return <div className="flex h-full min-h-0 flex-col ">History</div>;
}
