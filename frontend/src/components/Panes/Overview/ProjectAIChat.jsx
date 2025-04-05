import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IoMdArrowRoundBack } from "react-icons/io";
import { MdAdd } from "react-icons/md";
import { RiChatHistoryLine } from "react-icons/ri";
import { dbGetLLMResponse } from "requests/ai";
import { localStorageFns } from "state/hooks/localStorage";
import { MODEL_GROUPS } from "utils/constants";
import { ProjectChatCore } from "./ProjectLevelAI/ProjectChatCore";
import { ProjectChatHistory } from "./ProjectLevelAI/ProjectChatHistory";

export function ProjectAIChat() {
  const [viewHistory, setViewHistory] = useState(false);
  const [apiKeys] = localStorageFns.apiKeys.hook();
  const [userSelectedLLM, setUserSelectedLLM] =
    localStorageFns.userSelectedLLM.hook();
  const [messages, setMessages] = localStorageFns.messages.hook([]);
  // Store all chat sessions with their messages
  const [chatSessions, setChatSessions] = useState([]);
  // Current active session ID
  const [sessionId, setSessionId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Use refs to break circular dependencies
  const chatSessionsRef = useRef(chatSessions);
  useEffect(() => {
    chatSessionsRef.current = chatSessions;
  }, [chatSessions]);

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Memoize available providers
  const availableProviders = useMemo(
    () => apiKeys.map((key) => key.modelId),
    [apiKeys],
  );

  // Memoize filtered model groups
  const filteredModelGroups = useMemo(
    () =>
      MODEL_GROUPS.filter((group) =>
        availableProviders.some(
          (provider) =>
            group.group.toLowerCase().replace(/\s+/g, "-") ===
            provider.toLowerCase(),
        ),
      ),
    [availableProviders],
  );

  // Flatten all model items for easier selection
  const allModelItems = useMemo(
    () => filteredModelGroups.flatMap((group) => group.items),
    [filteredModelGroups],
  );

  // Helper function to update a chat session in the sessions list
  const updateChatSession = useCallback(
    (id, newMessages) => {
      if (!id) return;

      const sessions = chatSessionsRef.current;
      const existingSessionIndex = sessions.findIndex(
        (session) => session.id === id,
      );

      const sessionUpdate = {
        id,
        messages: newMessages,
        lastUpdated: Date.now(),
        title: newMessages[0]?.content.substring(0, 30) || "New Chat",
      };

      if (existingSessionIndex >= 0) {
        // Update existing session
        setChatSessions((prevSessions) => {
          const updatedSessions = [...prevSessions];
          updatedSessions[existingSessionIndex] = sessionUpdate;
          return updatedSessions;
        });
      } else {
        // Add as new session
        setChatSessions((prevSessions) => [...prevSessions, sessionUpdate]);
      }
    },
    [], // Empty dependency array since we're using refs
  );

  // Function to create a new chat
  const createNewChat = useCallback(() => {
    // Generate a temporary session ID
    const newSessionId = `session_${Date.now()}`;

    // Save current chat to sessions if it exists and has messages
    if (sessionId && messagesRef.current.length > 0) {
      // First check if we already have this session
      const existingSessionIndex = chatSessionsRef.current.findIndex(
        (session) => session.id === sessionId,
      );

      if (existingSessionIndex >= 0) {
        // Update existing session
        setChatSessions((prevSessions) => {
          const updatedSessions = [...prevSessions];
          updatedSessions[existingSessionIndex] = {
            ...updatedSessions[existingSessionIndex],
            messages: [...messagesRef.current],
            lastUpdated: Date.now(),
          };
          return updatedSessions;
        });
      } else {
        // Add as new session
        setChatSessions((prevSessions) => [
          ...prevSessions,
          {
            id: sessionId,
            messages: [...messagesRef.current],
            lastUpdated: Date.now(),
            title:
              messagesRef.current[0]?.content.substring(0, 30) || "New Chat",
          },
        ]);
      }
    }

    // Clear current messages and set new session ID
    setMessages([]);
    setSessionId(newSessionId);
    // Make sure we're in chat view, not history view
    setViewHistory(false);
  }, [sessionId, setMessages]);

  // Initialize a new chat session if none exists
  useEffect(() => {
    if (!sessionId) {
      createNewChat();
    }
  }, [sessionId, createNewChat]);

  // Modified to work with the isolated input component
  const handleSubmit = useCallback(
    async (userMessage) => {
      if (!userMessage.trim()) return;
      setIsLoading(true);

      // Add user message to UI immediately
      const userMsg = { role: "user", content: userMessage };
      const updatedMessages = [...messagesRef.current, userMsg];
      setMessages(updatedMessages);

      try {
        const response = await dbGetLLMResponse(
          userSelectedLLM,
          userMessage,
          sessionId,
        );

        // Handle the response and update messages...
        if (response.data && response.data.content) {
          const aiMsg = { role: "assistant", content: response.data.content };
          const newMessages = [...updatedMessages, aiMsg];
          setMessages(newMessages);
          updateChatSession(sessionId || response.data.session_id, newMessages);
        } else {
          // Handle error cases...
          const errorMsg = {
            role: "assistant",
            content: "Sorry, I couldn't process your request properly.",
          };
          const newMessages = [...updatedMessages, errorMsg];
          setMessages(newMessages);
          updateChatSession(
            sessionId || (response.data && response.data.session_id),
            newMessages,
          );
        }
      } catch (error) {
        // Handle API errors...
        const errorMsg = {
          role: "assistant",
          content: `Sorry, there was a problem with the API: ${error.message || "Unknown error"}.`,
        };
        const newMessages = [...updatedMessages, errorMsg];
        setMessages(newMessages);
        updateChatSession(sessionId, newMessages);
      } finally {
        setIsLoading(false);
      }
    },
    [sessionId, userSelectedLLM, updateChatSession, setMessages],
  );

  // Function to switch to an existing chat
  const switchToChat = useCallback(
    (id) => {
      if (id === sessionId) {
        setViewHistory(false);
        return;
      }

      // Save current chat state if needed
      if (sessionId && messagesRef.current.length > 0) {
        updateChatSession(sessionId, messagesRef.current);
      }

      // Find the selected chat
      const selectedChat = chatSessionsRef.current.find(
        (session) => session.id === id,
      );
      if (selectedChat) {
        setSessionId(id);
        setMessages(selectedChat.messages);
        setViewHistory(false);
      }
    },
    [sessionId, setMessages, updateChatSession],
  );

  // Memoize the chat core component
  const chatCore = useMemo(() => {
    return (
      <ProjectChatCore
        messages={messages}
        selectedModel={userSelectedLLM}
        placeholderText={"Type a message..."}
        handleSubmit={handleSubmit}
        isLoading={isLoading}
      />
    );
  }, [messages, userSelectedLLM, handleSubmit, isLoading]);

  // Memoize the chat history component
  const chatHistory = useMemo(() => {
    return (
      <ProjectChatHistory
        chatSessions={chatSessions}
        sessionId={sessionId}
        switchToChat={switchToChat}
      />
    );
  }, [chatSessions, sessionId, switchToChat]);

  return (
    <div className="flex h-full min-h-0 flex-col @container">
      <nav className="flex min-h-16 flex-col gap-2 border-b border-setta-100 py-4 @[15rem]:flex-row @[15rem]:items-center dark:border-setta-800">
        <div className="flex gap-2">
          <button
            className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-400 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-500 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-blue-950"
            onClick={createNewChat}
            aria-label="New Chat"
          >
            <MdAdd size={15} />
            <span className="@[15rem]:hidden @sm:block">New</span>
          </button>
          <button
            className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-400 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-500 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-blue-950"
            onClick={() => setViewHistory(!viewHistory)}
            aria-label="View History"
          >
            {viewHistory ? (
              <>
                <IoMdArrowRoundBack />
                <span>Return to chat</span>
              </>
            ) : (
              <>
                <RiChatHistoryLine size={15} />
                <span className="@[15rem]:hidden @sm:block">History</span>
              </>
            )}
          </button>
        </div>

        {viewHistory ? null : (
          <IdNameCombobox
            allItems={filteredModelGroups}
            value={userSelectedLLM}
            small={false}
            onSelectedItemChange={(value) => setUserSelectedLLM(value)}
            placeholder="Select an LLM model"
            outerDivClasses="ml-auto flex @[15rem]:max-w-64 justify-center"
          />
        )}
      </nav>
      {viewHistory ? chatHistory : chatCore}
    </div>
  );
}
