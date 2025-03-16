import { useEffect, useRef, useState } from "react";
import { IoAddOutline, IoSend, IoTime } from "react-icons/io5";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import AIModelSelect from "./AIModelSelect";
import {
  ChatHistoryManager,
  ChatHistoryProvider,
  useChatHistory,
} from "./ChatHistoryManager";

// A simple code block component
const CodeBlock = ({ children, className }) => {
  const language = className ? className.replace(/language-/, "") : "";
  return (
    <pre className={`rounded-md bg-setta-800 p-2 ${className || ""}`}>
      <code className={language ? `language-${language}` : ""}>{children}</code>
    </pre>
  );
};

// A custom hook to check if an element is scrollable
const useIsScrollable = () => {
  const ref = useRef(null);
  const [isScrollable, setIsScrollable] = useState(false);

  useEffect(() => {
    const checkScrollable = () => {
      if (ref.current) {
        const { scrollHeight, clientHeight } = ref.current;
        setIsScrollable(scrollHeight > clientHeight);
      }
    };

    checkScrollable();
    window.addEventListener("resize", checkScrollable);
    return () => window.removeEventListener("resize", checkScrollable);
  }, []);

  return { ref, isScrollable };
};

// Inner component that uses the chat history context
function ProjectAIChatInner() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Hello! How can I help you with your project today?",
    },
  ]);
  const [newMessage, setNewMessage] = useState("");
  const [pendingUserMessages, setPendingUserMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [currentChatId, setCurrentChatId] = useState(null);
  const { ref, isScrollable } = useIsScrollable();
  const { saveChat, loadMessages, updateChat } = useChatHistory();

  // Save current chat to history when messages change significantly
  useEffect(() => {
    if (messages.length > 1) {
      if (currentChatId) {
        // Update existing chat
        updateChat(currentChatId, messages);
      } else if (messages.length >= 3) {
        // Only create a new chat entry after at least one user-assistant exchange
        const chatId = saveChat(messages);
        setCurrentChatId(chatId);
      }
    }
  }, [messages, currentChatId, saveChat, updateChat]);

  const handleSubmit = async (e) => {
    if (e) {
      e.preventDefault();
    }
    if (newMessage.trim() === "") return;

    const userMessage = { role: "user", content: newMessage };

    // Add user message immediately to UI
    setPendingUserMessages((x) => [...x, userMessage]);
    setNewMessage("");

    // Simulate AI response for now - will be replaced with Vercel AI SDK
    setIsLoading(true);

    // Simulating a network delay - will be replaced with actual API call
    setTimeout(() => {
      // Add both messages to the main messages array
      setMessages((prev) => [
        ...prev,
        userMessage,
        {
          role: "assistant",
          content: `This is a placeholder response. In the future, this will be connected to Vercel AI SDK to provide real AI responses.`,
        },
      ]);

      // Clear pending messages since they're now in the main messages array
      setPendingUserMessages([]);
      setIsLoading(false);
    }, 1000);
  };

  // Handle Enter key to submit
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault(); // Prevent default to avoid new line
      handleSubmit();
    }
  };

  // Clear pending messages when main messages change
  useEffect(() => {
    setPendingUserMessages([]);
  }, [messages]);

  // Start a new chat
  const handleNewChat = () => {
    setMessages([
      {
        role: "assistant",
        content: "Hello! How can I help you with your project today?",
      },
    ]);
    setCurrentChatId(null);
    setShowHistory(false);
  };

  // Handle selecting a chat from history
  const handleSelectChat = (chatId) => {
    const savedMessages = loadMessages(chatId);
    if (savedMessages) {
      setMessages(savedMessages);
      setCurrentChatId(chatId);
    } else {
      // If no saved messages found, just start a new chat
      handleNewChat();
    }
    setShowHistory(false);
  };

  return (
    <section className="relative isolate flex h-full flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-setta-200 px-4 py-3 dark:border-setta-700">
        <div className="flex items-center gap-2">
          <button
            onClick={handleNewChat}
            className="inline-flex items-center gap-1 rounded-md border border-setta-200 px-2 py-1 text-xs font-medium text-setta-700 transition-colors hover:bg-setta-100 hover:text-blue-600 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-700 dark:hover:text-blue-400"
            title="Start a new chat"
          >
            <IoAddOutline className="h-3.5 w-3.5" />
            <span>New Chat</span>
          </button>

          <button
            onClick={() => setShowHistory(true)}
            className="inline-flex items-center gap-1 rounded-md border border-setta-200 px-2 py-1 text-xs font-medium text-setta-700 transition-colors hover:bg-setta-100 hover:text-blue-600 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-700 dark:hover:text-blue-400"
            title="View chat history"
          >
            <IoTime className="h-3.5 w-3.5" />
            <span>History</span>
          </button>
        </div>

        <AIModelSelect />
      </header>

      {showHistory ? (
        <ChatHistoryManager
          onBackClick={() => setShowHistory(false)}
          onSelectChat={handleSelectChat}
        />
      ) : (
        <>
          <div
            className="z-0 flex flex-1 flex-col-reverse overflow-y-auto px-4"
            ref={ref}
          >
            {/* The flex-col-reverse trick is to keep the scrollbar at the bottom */}
            <div>
              {[...messages, ...pendingUserMessages].map((message, idx) => (
                <div
                  key={idx}
                  className={`my-4 flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`prose prose-sm w-fit max-w-[min(85%,800px)] flex-shrink cursor-text px-4 py-2.5 ${
                      message.role === "user"
                        ? "rounded-t-lg rounded-bl-lg bg-blue-500 text-white"
                        : "rounded-b-lg rounded-tr-lg bg-setta-100 text-setta-800 dark:bg-setta-700 dark:text-setta-50"
                    }`}
                  >
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                      components={{
                        code: CodeBlock,
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="my-4 flex justify-start">
                  <div className="rounded-b-lg rounded-tr-lg bg-setta-100 px-4 py-2.5 text-setta-800 dark:bg-setta-700 dark:text-setta-50">
                    <div className="flex gap-2">
                      <div className="h-2 w-2 animate-bounce rounded-full bg-setta-400"></div>
                      <div className="h-2 w-2 animate-bounce rounded-full bg-setta-400 [animation-delay:0.2s]"></div>
                      <div className="h-2 w-2 animate-bounce rounded-full bg-setta-400 [animation-delay:0.4s]"></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Message input */}
          <form
            onSubmit={handleSubmit}
            className="border-t border-setta-200 px-4 pb-4 pt-4 dark:border-setta-700"
          >
            <div className="flex gap-2">
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                disabled={isLoading}
                className={`max-h-48 flex-1 resize-none overflow-y-auto rounded-lg border border-setta-200 bg-transparent px-4 py-2 text-setta-800 outline-none [field-sizing:content] hover:bg-white focus:outline-none focus:outline focus:outline-blue-500 dark:border-setta-700 dark:text-white dark:hover:bg-setta-800 dark:focus:bg-setta-800/50 dark:focus:outline-blue-700`}
              />
              <button
                type="submit"
                disabled={isLoading}
                className="mb-3 cursor-pointer self-end px-2 py-0.5 text-setta-500 hover:text-blue-500 focus:text-blue-500 focus:outline-none focus:ring-0 dark:hover:text-blue-700"
              >
                <IoSend size={20} />
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}

// Wrapper component that provides the chat history context
export function ProjectAIChat() {
  return (
    <ChatHistoryProvider>
      <ProjectAIChatInner />
    </ChatHistoryProvider>
  );
}
