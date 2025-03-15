import { useEffect, useRef, useState } from "react";
import { CgSpinner } from "react-icons/cg";
import {
  HiChevronDown,
  HiOutlineCode,
  HiOutlineCog,
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
import { getAvailableModels, sendMessage } from "services/aiService";
import { setModalOpen, setModalType } from "state/actions/modal";
import { useIsScrollable } from "state/hooks/sectionSizes";
import { MODAL_TYPE } from "utils/constants";
import { CodeBlockDisplay } from "./ChatComponents/CodeBlockDisplay";
import { FileDragDrop } from "./ChatComponents/FileDragDrop";
import { ReasoningAccordion } from "./ChatComponents/ReasoningAccordion";

export function ProjectLLMChat() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [model, setModel] = useState("gpt-4");
  const [currentStreamedMessage, setCurrentStreamedMessage] = useState("");
  const { ref, isScrollable } = useIsScrollable();
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const streamingMessageRef = useRef(null);
  const abortControllerRef = useRef(null);
  const [availableModels, setAvailableModels] = useState([
    { value: "gpt-4", label: "GPT-4" },
    { value: "claude-3", label: "Claude 3" },
    { value: "mixtral", label: "Mixtral" },
    { value: "llama-3", label: "Llama 3" },
  ]);

  // Fetch available models on initial load
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const models = await getAvailableModels();
        if (models && models.length > 0) {
          // Get unique providers with models
          const uniqueProviders = [
            ...new Set(
              models.filter((m) => m.serviceId).map((m) => m.serviceId),
            ),
          ].filter((provider) => {
            // Only include providers that have API keys (at least one model)
            return models.some((m) => m.serviceId === provider);
          });

          // Format models for the dropdown
          const formattedModels = models.map((model) => ({
            value: model.id,
            label: model.name,
            provider: model.serviceId,
            isDefault: model.isDefault,
          }));

          setAvailableModels(formattedModels);

          // Find any default model from localStorage
          const defaultModel = formattedModels.find((m) => m.isDefault);

          // If we have a default model, use it
          if (defaultModel) {
            setModel(defaultModel.value);
          }
          // Otherwise, check if the currently selected model exists in the new list
          else if (!formattedModels.some((m) => m.value === model)) {
            // If not, select the first available model
            setModel(formattedModels[0].value);
          }
        }
      } catch (error) {
        console.error("Failed to fetch models:", error);
        // Keep the default models if fetching fails
      }
    };

    fetchModels();
  }, []); // Remove the model dependency to avoid infinite loops

  // Scroll to bottom when messages change or when streaming
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, currentStreamedMessage]);

  // Focus input after sending a message
  useEffect(() => {
    if (!isThinking && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isThinking]);

  // Cleanup function for when component unmounts during streaming
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleSubmit = async (e) => {
    if (e) {
      e.preventDefault();
    }

    if (inputValue.trim() === "" || isThinking) return;

    const newMessage = {
      role: "user",
      content: inputValue,
      files: [...selectedFiles], // Include any attached files
    };

    // Reset streaming state
    setCurrentStreamedMessage("");
    streamingMessageRef.current = null;

    // Add user message to chat
    setMessages((prevMessages) => [...prevMessages, newMessage]);
    setInputValue("");
    setSelectedFiles([]);
    setIsThinking(true);

    try {
      // Send message to AI service
      abortControllerRef.current = await sendMessage({
        message: inputValue,
        model: model,
        onStart: () => {
          // Initialize streaming state
          setCurrentStreamedMessage("");
        },
        onMessage: (content) => {
          // Update streaming message with new content
          setCurrentStreamedMessage((prev) => prev + content);
        },
        onError: (error) => {
          console.error("Error in LLM response:", error);
          setIsThinking(false);
          setMessages((prevMessages) => [
            ...prevMessages,
            {
              role: "assistant",
              content:
                "Sorry, there was an error processing your request. Please try again.",
              error: true,
            },
          ]);
        },
        onComplete: (reasoning) => {
          // Add final message to chat history
          setMessages((prevMessages) => [
            ...prevMessages,
            {
              role: "assistant",
              content: currentStreamedMessage, // Use the current streamed message value
              reasoning: reasoning,
            },
          ]);
          setIsThinking(false);
          setCurrentStreamedMessage("");
        },
      });
    } catch (error) {
      console.error("Failed to send message:", error);
      setIsThinking(false);
      setMessages((prevMessages) => [
        ...prevMessages,
        {
          role: "assistant",
          content:
            "Sorry, there was an error sending your message. Please try again.",
          error: true,
        },
      ]);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const clearMessages = () => {
    // Abort any in-progress streaming
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setMessages([]);
    setCurrentStreamedMessage("");
    setIsThinking(false);
    setSelectedFiles([]);
  };

  const handleFileSelect = (files) => {
    setSelectedFiles(files);
  };

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden"
      data-testid="project-llm-chat"
    >
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
          <button
            onClick={() => {
              setModalType(MODAL_TYPE.LLM_SETTINGS);
              setModalOpen(true);
            }}
            className="rounded p-1 text-setta-500 hover:bg-setta-100 hover:text-blue-500 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-blue-400"
            title="LLM Settings"
            data-testid="llm-settings-button"
          >
            <HiOutlineCog size={16} />
          </button>

          <ModelSelector
            model={model}
            setModel={setModel}
            availableModels={availableModels}
          />

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
        className="flex flex-1 flex-col-reverse overflow-y-auto overflow-x-hidden p-3"
        ref={ref}
      >
        <div className="w-full">
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
                  className={`my-4 flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div className="flex max-w-[85%] flex-col">
                    {/* Display file attachments if any */}
                    {message.files && message.files.length > 0 && (
                      <div className="mb-1 flex flex-wrap gap-1">
                        {message.files.map((file, fileIndex) => (
                          <div key={fileIndex} className="relative">
                            {file.objectURL && (
                              <img
                                src={file.objectURL}
                                alt={file.name}
                                className="h-16 w-16 rounded-md object-cover"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Message content */}
                    <div
                      className={`prose prose-sm w-fit max-w-full flex-shrink cursor-text px-4 py-2.5 ${
                        message.role === "user"
                          ? "rounded-t-lg rounded-bl-lg bg-blue-500 text-white prose-headings:text-blue-200 dark:bg-blue-700"
                          : "rounded-b-lg rounded-tr-lg bg-setta-100 text-setta-800 prose-headings:text-setta-600 dark:bg-setta-700/50 dark:text-setta-50 dark:prose-headings:text-setta-300"
                      } dark:prose-invert prose-headings:tracking-tighter prose-h1:text-2xl prose-h1:leading-none prose-p:text-sm prose-code:before:hidden prose-code:after:hidden [&>p]:inline-block [&_*]:break-words`}
                    >
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
                        {message.content}
                      </ReactMarkdown>
                    </div>

                    {/* Display reasoning if available */}
                    {message.reasoning && (
                      <ReasoningAccordion reasoning={message.reasoning} />
                    )}
                  </div>
                </div>
              ))}
              {/* Streaming message or thinking indicator */}
              {isThinking && (
                <div
                  className="my-4 flex justify-start"
                  data-testid="thinking-indicator"
                >
                  <div
                    className={`prose prose-sm w-fit max-w-[85%] flex-shrink rounded-b-lg rounded-tr-lg bg-setta-100 px-4 py-2.5 text-setta-800 dark:bg-setta-700/50 dark:text-setta-50 dark:prose-headings:text-setta-300 ${
                      currentStreamedMessage
                        ? "dark:prose-invert prose-headings:tracking-tighter prose-h1:text-2xl prose-h1:leading-none prose-p:text-sm"
                        : ""
                    }`}
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
              <div ref={messagesEndRef} /> {/* Anchor for auto-scrolling */}
            </>
          )}
        </div>
      </div>

      {/* Message input */}
      <div className="border-t border-setta-200 dark:border-setta-800">
        {/* File drag & drop area */}
        {selectedFiles.length > 0 && (
          <div className="px-3 pt-2">
            <FileDragDrop
              onFileSelect={handleFileSelect}
              acceptedTypes="image/*"
            />
          </div>
        )}

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
                  onClick={() => {
                    if (selectedFiles.length === 0) {
                      setSelectedFiles([
                        new File(["dummy"], "dummy.png", { type: "image/png" }),
                      ]);
                    }
                  }}
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
                ref={inputRef}
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
              className="mb-0 rounded p-1.5 text-blue-500 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-400 dark:hover:bg-setta-800 dark:focus:ring-blue-600"
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

function ModelSelector({ model, setModel, availableModels }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

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

  // Make sure availableModels is not empty
  if (!availableModels || availableModels.length === 0) {
    return null; // Don't render anything if no models are available
  }

  // Get current model label with fallback
  const currentModel =
    availableModels.find((m) => m.value === model) || availableModels[0];

  // Fallback label in case currentModel is somehow still undefined
  const displayLabel = currentModel ? currentModel.label : "Select Model";

  // Group models by provider
  const modelsByProvider = availableModels.reduce((acc, model) => {
    const provider = model.provider || "Other";
    if (!acc[provider]) {
      acc[provider] = [];
    }
    acc[provider].push(model);
    return acc;
  }, {});

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-setta-700 hover:bg-setta-100 dark:text-setta-300 dark:hover:bg-setta-800"
        onClick={() => setIsOpen(!isOpen)}
        data-testid="model-selector"
      >
        <span>{displayLabel}</span>
        <HiChevronDown size={14} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-10 mt-1 max-h-60 w-48 overflow-auto rounded-md border border-setta-200 bg-white shadow-md dark:border-setta-700 dark:bg-setta-900">
          <div className="p-1">
            {Object.entries(modelsByProvider).map(([provider, models]) => (
              <div key={provider} className="mb-1">
                {models.length > 0 && (
                  <div className="mb-1 px-2 pt-1 text-[10px] font-semibold uppercase text-setta-400 dark:text-setta-500">
                    {provider}
                  </div>
                )}
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
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
