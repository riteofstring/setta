import { createContext, useContext, useEffect, useState } from "react";
import { ChatHistory } from "./ChatHistory";

// Create a context for chat history management
const ChatHistoryContext = createContext(null);

/**
 * Provider component for chat history context
 */
export function ChatHistoryProvider({ children }) {
  const [chatHistory, setChatHistory] = useState([]);
  const [savedChats, setSavedChats] = useState({});

  // Load chat history from localStorage on mount
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem("chatHistory");
      const savedChatsData = localStorage.getItem("savedChats");

      if (savedHistory) {
        setChatHistory(JSON.parse(savedHistory));
      }

      if (savedChatsData) {
        setSavedChats(JSON.parse(savedChatsData));
      }
    } catch (error) {
      console.error("Error loading chat history:", error);
    }
  }, []);

  // Save to localStorage when chat history changes
  useEffect(() => {
    try {
      localStorage.setItem("chatHistory", JSON.stringify(chatHistory));
    } catch (error) {
      console.error("Error saving chat history:", error);
    }
  }, [chatHistory]);

  // Save to localStorage when saved chats change
  useEffect(() => {
    try {
      localStorage.setItem("savedChats", JSON.stringify(savedChats));
    } catch (error) {
      console.error("Error saving chat data:", error);
    }
  }, [savedChats]);

  // Function to save a new chat to history
  const saveChat = (messages) => {
    if (!messages || messages.length < 2) return null;

    // Create a chat title from the first user message
    const firstUserMessage = messages.find((msg) => msg.role === "user");
    const title = firstUserMessage
      ? firstUserMessage.content.substring(0, 50) +
        (firstUserMessage.content.length > 50 ? "..." : "")
      : "New Chat";

    // Create a preview from the last assistant message
    const assistantMessages = messages.filter(
      (msg) => msg.role === "assistant",
    );
    const lastAssistantMessage =
      assistantMessages[assistantMessages.length - 1];
    const preview = lastAssistantMessage
      ? lastAssistantMessage.content.substring(0, 100) +
        (lastAssistantMessage.content.length > 100 ? "..." : "")
      : "";

    // Create a new chat history item
    const newChat = {
      id: Date.now().toString(),
      title,
      preview,
      date: new Date().toISOString(),
    };

    // Add to chat history
    setChatHistory((prev) => [newChat, ...prev]);

    // Save chat messages
    setSavedChats((prev) => ({
      ...prev,
      [newChat.id]: messages,
    }));

    return newChat.id;
  };

  // Function to delete a chat from history
  const deleteChat = (chatId) => {
    setChatHistory((prev) => prev.filter((chat) => chat.id !== chatId));

    // Also remove the saved messages
    setSavedChats((prev) => {
      const newSavedChats = { ...prev };
      delete newSavedChats[chatId];
      return newSavedChats;
    });
  };

  // Function to load chat messages by ID
  const loadMessages = (chatId) => {
    return savedChats[chatId] || null;
  };

  // Update existing chat
  const updateChat = (chatId, messages) => {
    if (!chatId || !messages || messages.length < 2) return;

    // Update the saved messages
    setSavedChats((prev) => ({
      ...prev,
      [chatId]: messages,
    }));

    // Update the history item if it exists
    setChatHistory((prev) => {
      const chat = prev.find((c) => c.id === chatId);
      if (!chat) return prev;

      // Get updated preview
      const assistantMessages = messages.filter(
        (msg) => msg.role === "assistant",
      );
      const lastAssistantMessage =
        assistantMessages[assistantMessages.length - 1];
      const preview = lastAssistantMessage
        ? lastAssistantMessage.content.substring(0, 100) +
          (lastAssistantMessage.content.length > 100 ? "..." : "")
        : "";

      return prev.map((c) =>
        c.id === chatId ? { ...c, preview, date: new Date().toISOString() } : c,
      );
    });
  };

  const value = {
    chatHistory,
    saveChat,
    deleteChat,
    loadMessages,
    updateChat,
  };

  return (
    <ChatHistoryContext.Provider value={value}>
      {children}
    </ChatHistoryContext.Provider>
  );
}

/**
 * Custom hook to use chat history
 */
export function useChatHistory() {
  const context = useContext(ChatHistoryContext);
  if (!context) {
    throw new Error("useChatHistory must be used within a ChatHistoryProvider");
  }
  return context;
}

/**
 * ChatHistoryManager component - handles chat history display
 * This separates the history UI from the main chat component
 */
export function ChatHistoryManager({ onBackClick, onSelectChat }) {
  const { chatHistory } = useChatHistory();

  return (
    <ChatHistory
      chatHistory={chatHistory}
      onBackClick={onBackClick}
      onSelectChat={onSelectChat}
    />
  );
}
