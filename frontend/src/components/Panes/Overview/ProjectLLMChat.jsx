import { useEffect, useRef, useState } from "react";
import { CgSpinner } from "react-icons/cg";
import {
  HiChevronDown,
  HiOutlineCode,
  HiOutlineEye,
  HiOutlineTrash,
  HiOutlineUpload,
} from "react-icons/hi";
import { IoSend } from "react-icons/io5";
import { LuBrainCircuit } from "react-icons/lu";
import { SiOpenai } from "react-icons/si";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { mockStreamResponse } from "services/projectLLMService";
import { useIsScrollable } from "state/hooks/sectionSizes";
import { CodeBlockDisplay } from "./ChatComponents/CodeBlockDisplay";

export function ProjectLLMChat() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [model, setModel] = useState("gpt-4");
  const [currentStreamedMessage, setCurrentStreamedMessage] = useState("");
  const { ref, isScrollable } = useIsScrollable();

  const handleSubmit = (e) => {
    if (e) {
      e.preventDefault();
    }

    if (inputValue.trim() === "" || isThinking) return;

    const newMessage = {
      role: "user",
      content: inputValue,
    };

    setMessages([...messages, newMessage]);
    setInputValue("");

    // Simulate LLM thinking and response
    setIsThinking(true);
    setCurrentStreamedMessage("");

    // Use the mock streaming function
    const cleanupFn = mockStreamResponse(
      inputValue,
      (chunk) => {
        setCurrentStreamedMessage((prev) => prev + chunk + " ");
      },
      () => {
        setMessages((prevMessages) => [
          ...prevMessages,
          { role: "assistant", content: currentStreamedMessage },
        ]);
        setIsThinking(false);
        setCurrentStreamedMessage("");
      },
    );

    // Cleanup function for when component unmounts during streaming
    return () => cleanupFn();
  };

  // Update messages when streaming is complete
  useEffect(() => {
    if (!isThinking && currentStreamedMessage) {
      setMessages((prevMessages) => [
        ...prevMessages.filter(
          (m) => m.role !== "assistant" || m.content !== "",
        ),
        { role: "assistant", content: currentStreamedMessage },
      ]);
      setCurrentStreamedMessage("");
    }
  }, [isThinking, currentStreamedMessage]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const clearMessages = () => {
    setMessages([]);
    setCurrentStreamedMessage("");
    setIsThinking(false);
  };

  return (
    <div className="flex h-full w-full flex-col" data-testid="project-llm-chat">
      {/* Header with settings */}
      <div className="flex items-center justify-between border-b border-setta-200 px-3 py-2 dark:border-setta-800">
        <div className="flex items-center gap-1.5">
          <LuBrainCircuit
            className="text-blue-500 dark:text-blue-400"
            size={18}
          />
          <span className="text-sm font-medium text-setta-700 dark:text-setta-200">
            Project Assistant
          </span>
        </div>

        <div className="flex items-center gap-2">
          <ModelSelector model={model} setModel={setModel} />

          <button
            onClick={clearMessages}
            className="rounded p-1 text-setta-500 hover:bg-setta-100 hover:text-blue-500 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-blue-400"
            title="Clear conversation"
          >
            <HiOutlineTrash size={16} />
          </button>
        </div>
      </div>

      {/* Chat messages */}
      <div
        className="flex flex-1 flex-col-reverse overflow-y-auto p-3"
        ref={ref}
      >
        <div>
          {messages.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center text-center text-setta-400 dark:text-setta-500">
              <SiOpenai className="mb-2" size={24} />
              <p className="text-sm">Ask me anything about this project</p>
              <p className="mt-1 text-xs">
                I can help with layout, configurations, and code.
              </p>
            </div>
          ) : (
            <>
              {messages.map((message, idx) => (
                <div
                  key={idx}
                  className={`my-3 flex ${
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
                      code({ node, inline, className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || "");
                        return !inline && match ? (
                          <CodeBlockDisplay language={match[1]} {...props}>
                            {children}
                          </CodeBlockDisplay>
                        ) : (
                          <code
                            className="rounded-sm bg-blue-100/70 px-1.5 py-0.5 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                            {...props}
                          >
                            {children}
                          </code>
                        );
                      },
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              ))}

              {/* Streaming message or thinking indicator */}
              {isThinking && (
                <div
                  className="my-3 flex justify-start"
                  data-testid="thinking-indicator"
                >
                  <div
                    className={`prose prose-sm w-fit max-w-[min(85%,800px)] flex-shrink rounded-b-lg rounded-tr-lg bg-setta-100 px-4 py-2.5 text-setta-800 dark:bg-setta-700/50 dark:text-setta-50 dark:prose-headings:text-setta-300 ${currentStreamedMessage ? "dark:prose-invert prose-headings:tracking-tighter prose-h1:text-2xl prose-h1:leading-none prose-p:text-sm" : ""}`}
                  >
                    {currentStreamedMessage ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        components={{
                          code({
                            node,
                            inline,
                            className,
                            children,
                            ...props
                          }) {
                            const match = /language-(\w+)/.exec(
                              className || "",
                            );
                            return !inline && match ? (
                              <CodeBlockDisplay language={match[1]} {...props}>
                                {children}
                              </CodeBlockDisplay>
                            ) : (
                              <code
                                className="rounded-sm bg-blue-100/70 px-1.5 py-0.5 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                                {...props}
                              >
                                {children}
                              </code>
                            );
                          },
                        }}
                      >
                        {currentStreamedMessage}
                      </ReactMarkdown>
                    ) : (
                      <div className="flex items-center gap-2">
                        <CgSpinner className="animate-spin" size={16} />
                        <span className="text-sm">Thinking...</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Message input */}
      <div className="border-t border-setta-200 dark:border-setta-800">
        <form onSubmit={handleSubmit} className="p-3">
          <div className="flex items-end gap-2">
            <div className="flex w-full flex-col gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="rounded p-1 text-setta-500 hover:bg-setta-100 hover:text-blue-500 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-blue-400"
                  title="Attach code"
                >
                  <HiOutlineCode size={16} />
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-setta-500 hover:bg-setta-100 hover:text-blue-500 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-blue-400"
                  title="Attach image"
                >
                  <HiOutlineUpload size={16} />
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-setta-500 hover:bg-setta-100 hover:text-blue-500 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-blue-400"
                  title="View current project"
                >
                  <HiOutlineEye size={16} />
                </button>
              </div>

              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                rows={1}
                className={`${isScrollable ? "no-wheel" : ""} w-full resize-none rounded-lg border border-setta-200 bg-transparent px-3 py-2 text-sm text-setta-800 outline-none [field-sizing:content] hover:bg-setta-100/50 focus:border-blue-500 dark:border-setta-700 dark:text-setta-100 dark:hover:bg-setta-800/50 dark:focus:border-blue-600`}
                disabled={isThinking}
              />
            </div>

            <button
              type="submit"
              disabled={inputValue.trim() === "" || isThinking}
              className="mb-1 rounded p-1.5 text-blue-500 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-400 dark:hover:bg-setta-800 dark:focus:ring-blue-600"
              data-testid="send-button"
              title="Send message"
            >
              <IoSend size={16} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModelSelector({ model, setModel }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const models = [
    { value: "gpt-4", label: "GPT-4" },
    { value: "claude-3", label: "Claude 3" },
    { value: "mixtral", label: "Mixtral" },
    { value: "llama-3", label: "Llama 3" },
  ];

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Get current model label
  const currentModel = models.find((m) => m.value === model) || models[0];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-setta-700 hover:bg-setta-100 dark:text-setta-300 dark:hover:bg-setta-800"
        onClick={() => setIsOpen(!isOpen)}
        data-testid="model-selector"
      >
        <span>{currentModel.label}</span>
        <HiChevronDown size={14} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-10 mt-1 w-32 overflow-hidden rounded-md border border-setta-200 bg-white shadow-md dark:border-setta-700 dark:bg-setta-900">
          <div className="p-1">
            {models.map((item) => (
              <button
                key={item.value}
                className={`w-full rounded px-3 py-1.5 text-left text-xs ${
                  item.value === model
                    ? "bg-blue-50 font-medium text-blue-900 dark:bg-blue-900/20 dark:text-blue-100"
                    : "text-setta-700 hover:bg-setta-100 dark:text-setta-100 dark:hover:bg-setta-800"
                }`}
                onClick={() => {
                  setModel(item.value);
                  setIsOpen(false);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
