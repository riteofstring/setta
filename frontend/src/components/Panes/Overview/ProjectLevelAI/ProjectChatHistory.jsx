export function ProjectChatHistory({ chatSessions, sessionId, switchToChat }) {
  return (
    <div className="flex flex-col gap-2 overflow-y-auto p-4">
      <h3 className="mb-4 text-setta-600 dark:text-setta-400">Chat History</h3>
      {chatSessions.length === 0 ? (
        <p className="text-center text-xs text-setta-400">
          No chat history yet
        </p>
      ) : (
        chatSessions
          .sort((a, b) => b.lastUpdated - a.lastUpdated) // Sort by most recent
          .map((session) => (
            <button
              key={session.id}
              className={` flex cursor-pointer flex-col gap-1 rounded-md border border-transparent px-3 py-2 transition-colors hover:bg-white/50 hover:shadow-sm focus-visible:border-blue-500 hover:dark:bg-setta-800 ${
                session.id === sessionId ? "bg-setta-100 dark:bg-setta-800" : ""
              }`}
              onClick={() => switchToChat(session.id)}
            >
              <div className="flex items-center justify-between">
                <h4 className="truncate font-semibold text-setta-500 dark:text-setta-300">
                  {session.title || "New Chat"}
                </h4>
                <span className="text-xs text-setta-800 dark:text-setta-200">
                  {new Date(session.lastUpdated).toLocaleString()}
                </span>
              </div>
              <p className="truncate text-xs text-setta-800 dark:text-setta-200">
                {session.messages.length} messages
              </p>
            </button>
          ))
      )}
    </div>
  );
}

function ChatHistoryItem() {
  return (
    <button
      className="flex cursor-pointer flex-col gap-1 rounded-md border border-transparent px-2 py-1 transition-colors hover:bg-white focus-visible:border-blue-500 hover:dark:bg-setta-800"
      tabIndex="1"
    >
      <h3 className="truncate font-semibold text-setta-500 dark:text-setta-300">
        My Previous Chat Had A Long Title
      </h3>
      <p className="truncate text-xs text-setta-800 dark:text-setta-200">
        Let's put in a brief snippet here that is truncated visually with css.
      </p>
    </button>
  );
}
