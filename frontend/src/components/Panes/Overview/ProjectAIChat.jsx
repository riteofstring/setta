import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import { useEffect, useState } from "react";
import { IoMdArrowRoundBack } from "react-icons/io";
import { MdAdd } from "react-icons/md";
import { RiChatHistoryLine } from "react-icons/ri";
import { dbGetLLMResponse } from "requests/ai";
import { localStorageFns } from "state/hooks/localStorage";
import { MODEL_GROUPS } from "utils/constants";
import { ProjectChatHistory } from "./ProjectLevelAI/ProjectChatHistory";
// import { ProjectChatHistory } from "./ProjectChatHistory";
import { ProjectChatCore } from "./ProjectLevelAI/ProjectChatCore";

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

  // Initialize a new chat session if none exists
  useEffect(() => {
    if (!sessionId) {
      createNewChat();
    }
  }, []);

  const placeholderText = "Type a message...";

  // Function to create a new chat
  const createNewChat = () => {
    // Generate a temporary session ID (could be replaced with UUID or server-generated ID)
    const newSessionId = `session_${Date.now()}`;

    // Save current chat to sessions if it exists and has messages
    if (sessionId && messages.length > 0) {
      // First check if we already have this session
      const existingSessionIndex = chatSessions.findIndex(
        (session) => session.id === sessionId,
      );

      if (existingSessionIndex >= 0) {
        // Update existing session
        const updatedSessions = [...chatSessions];
        updatedSessions[existingSessionIndex] = {
          ...updatedSessions[existingSessionIndex],
          messages: [...messages],
          lastUpdated: Date.now(),
        };
        setChatSessions(updatedSessions);
      } else {
        // Add as new session
        setChatSessions([
          ...chatSessions,
          {
            id: sessionId,
            messages: [...messages],
            lastUpdated: Date.now(),
            // You could add other metadata like title, creation date, etc.
            title: messages[0]?.content.substring(0, 30) || "New Chat",
          },
        ]);
      }
    }

    // Clear current messages and set new session ID
    setMessages([]);
    setSessionId(newSessionId);
    // Make sure we're in chat view, not history view
    setViewHistory(false);
  };

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
        const newMessages = [...updatedMessages, aiMsg];
        setMessages(newMessages);

        // Update this session in the chat sessions list
        updateChatSession(sessionId, newMessages);
      } else {
        // Handle missing content
        const errorMsg = {
          role: "assistant",
          content: "Sorry, I couldn't process your request properly.",
        };
        const newMessages = [...updatedMessages, errorMsg];
        setMessages(newMessages);
        updateChatSession(sessionId, newMessages);
      }
    } catch (error) {
      console.error("Error getting LLM response:", error);
      // Add an error message to the chat
      const errorMsg = {
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again.",
      };
      const newMessages = [...updatedMessages, errorMsg];
      setMessages(newMessages);
      updateChatSession(sessionId, newMessages);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to update a chat session in the sessions list
  const updateChatSession = (id, newMessages) => {
    if (!id) return;

    const existingSessionIndex = chatSessions.findIndex(
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
      const updatedSessions = [...chatSessions];
      updatedSessions[existingSessionIndex] = sessionUpdate;
      setChatSessions(updatedSessions);
    } else {
      // Add as new session
      setChatSessions([...chatSessions, sessionUpdate]);
    }
  };

  // Function to switch to an existing chat
  const switchToChat = (id) => {
    if (id === sessionId) {
      // Already on this chat, just switch to chat view
      setViewHistory(false);
      return;
    }

    // Save current chat state if needed
    if (sessionId && messages.length > 0) {
      updateChatSession(sessionId, messages);
    }

    // Find the selected chat
    const selectedChat = chatSessions.find((session) => session.id === id);
    if (selectedChat) {
      setSessionId(id);
      setMessages(selectedChat.messages);
      setViewHistory(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col @container">
      <nav className="flex min-h-16 flex-col gap-2 border-b border-setta-100 py-4 @[15rem]:flex-row @[15rem]:items-center  dark:border-setta-800">
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
      {viewHistory ? (
        <ProjectChatHistory
          chatSessions={chatSessions}
          sessionId={sessionId}
          switchToChat={switchToChat}
        />
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
