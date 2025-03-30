import { CodeBlock } from "components/Section/Layouts/TextBlock";
import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import { useEffect, useState } from "react";
import { IoMdArrowRoundBack } from "react-icons/io";
import { IoSend } from "react-icons/io5";
import { MdAdd } from "react-icons/md";
import { RiChatHistoryLine } from "react-icons/ri";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { dbGetLLMResponse } from "requests/ai";
import { localStorageFns } from "state/hooks/localStorage";
import { MODEL_GROUPS } from "utils/constants";
import { ProjectChatHistory } from "./ProjectChatHistory";

export function ProjectAIChat() {
  const [viewHistory, setViewHistory] = useState(false);
  const [apiKeys] = localStorageFns.apiKeys.hook();
  const [userSelectedLLM, setUserSelectedLLM] =
    localStorageFns.userSelectedLLM.hook();
  const [messages, setMessages] = localStorageFns.messages.hook([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);

  // Simple string for the current message input
  const [currMessage, setCurrMessage] = useState("");

  const availableProviders = apiKeys.map((key) => key.modelId);
  const filteredModelGroups = MODEL_GROUPS.filter((group) =>
    availableProviders.some(
      (provider) =>
        group.group.toLowerCase().replace(/\s+/g, "-") ===
        provider.toLowerCase(),
    ),
  );

  // Flatten all model items for easier selection
  const allModelItems = filteredModelGroups.flatMap((group) => group.items);

  // Initialize selectedModel with userSelectedLLM or first available model
  useEffect(() => {
    if (!userSelectedLLM && allModelItems.length > 0) {
      setUserSelectedLLM(allModelItems[0].id);
    }
  }, [userSelectedLLM, allModelItems, setUserSelectedLLM]);

  const placeholderText = "Type a message...";

  const handleSubmit = async (userMessage) => {
    if (!userMessage.trim()) return;
    setIsLoading(true);

    // Add user message to UI immediately
    const userMsg = { role: "user", content: userMessage };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);

    try {
      // Get the Axios response object
      const axiosResponse = await dbGetLLMResponse(
        userSelectedLLM || "claude-3-sonnet-20240229",
        userMessage,
        sessionId,
      );

      // Check if it's an error response
      if (axiosResponse.isAxiosError) {
        throw new Error("Failed to get LLM response");
      }

      // Extract the actual data from the Axios response
      const responseData = axiosResponse.data;

      // Store the session ID from the first response
      if (responseData.session_id && !sessionId) {
        setSessionId(responseData.session_id);
      }

      // Add AI response to messages
      if (responseData && responseData.content) {
        const aiMsg = { role: "assistant", content: responseData.content };
        setMessages([...updatedMessages, aiMsg]);
      } else {
        // Handle missing content
        setMessages([
          ...updatedMessages,
          {
            role: "assistant",
            content: "Sorry, I couldn't process your request properly.",
          },
        ]);
      }
    } catch (error) {
      console.error("Error getting LLM response:", error);
      // Add an error message to the chat
      setMessages([
        ...updatedMessages,
        {
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

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
            <IdNameCombobox
              allItems={filteredModelGroups}
              value={userSelectedLLM}
              small={false}
              onSelectedItemChange={(value) => setUserSelectedLLM(value)}
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
          selectedModel={userSelectedLLM}
          placeholderText={placeholderText}
          handleSubmit={handleSubmit}
          currMessage={currMessage}
          setCurrMessage={setCurrMessage}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}

function ProjectChatCore({
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
      <form onSubmit={onSubmit} className="min-h-[58px] pb-2 pt-2">
        <div className="flex space-x-2">
          <textarea
            type="text"
            value={currMessage}
            onChange={(e) => setCurrMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isLoading ? "Waiting for response..." : placeholderText
            }
            disabled={isLoading}
            className="nodrag max-h-48 flex-1 resize-none overflow-y-auto rounded-lg border border-setta-100 bg-transparent px-4 py-2 text-setta-800 outline-none [field-sizing:content] hover:bg-setta-100/50 focus:outline-none focus:outline focus:outline-blue-500 dark:border-setta-700 dark:text-white dark:hover:bg-setta-800 dark:focus:bg-setta-800/50 dark:focus:outline-blue-700"
          />
          <button
            type="submit"
            disabled={isLoading}
            className={`mb-3 cursor-pointer self-end px-2 py-0.5 ${
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
