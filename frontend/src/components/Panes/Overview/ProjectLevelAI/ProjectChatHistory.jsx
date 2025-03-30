export function ProjectChatHistory({ chatSessions, sessionId }) {
  return (
    <div className="flex flex-col overflow-y-auto p-4">
      <h2 className="">Chat History</h2>
      {chatSessions.length === 0 ? (
        <p className="text-center text-setta-400">No chat history yet</p>
      ) : (
        chatSessions
          .sort((a, b) => b.lastUpdated - a.lastUpdated) // Sort by most recent
          .map((session) => (
            <button
              key={session.id}
              className={`flex cursor-pointer flex-col gap-1 rounded-md border border-transparent px-2 py-1 transition-colors hover:bg-white focus-visible:border-blue-500 hover:dark:bg-setta-800 ${
                session.id === sessionId ? "bg-setta-100 dark:bg-setta-800" : ""
              }`}
              onClick={() => switchToChat(session.id)}
            >
              <div className="flex items-center justify-between">
                <h3 className="truncate font-semibold text-setta-500 dark:text-setta-300">
                  {session.title || "New Chat"}
                </h3>
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
