import {
  IoArrowBack,
  IoCalendarOutline,
  IoEllipsisHorizontal,
} from "react-icons/io5";

/**
 * Component for displaying a list of past chat conversations
 */
export function ChatHistory({ onBackClick, chatHistory = [], onSelectChat }) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center border-b border-setta-200 p-4 dark:border-setta-700">
        <button
          onClick={onBackClick}
          className="inline-flex items-center gap-1 text-sm font-medium text-setta-700 hover:text-blue-600 dark:text-setta-300 dark:hover:text-blue-400"
        >
          <IoArrowBack className="h-4 w-4" />
          <span>Back to chat</span>
        </button>
        <h2 className="ml-auto text-sm font-medium text-setta-700 dark:text-setta-300">
          Chat History
        </h2>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {chatHistory.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {chatHistory.map((chat) => (
              <li key={chat.id}>
                <ChatHistoryItem chat={chat} onSelect={onSelectChat} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-setta-400 dark:text-setta-500">
            <IoCalendarOutline size={24} />
            <p className="mt-2 text-sm">No chat history yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Individual chat history item
 */
function ChatHistoryItem({ chat, onSelect }) {
  const { id, title, preview, date } = chat;

  // Format date for display
  const formattedDate = new Date(date).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });

  return (
    <button
      className="w-full overflow-hidden rounded-md bg-transparent px-3 py-2 text-left transition-all hover:bg-white hover:shadow-md dark:hover:bg-setta-800 dark:hover:shadow-lg"
      onClick={() => onSelect(id)}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="truncate font-medium tracking-tight text-setta-800 dark:text-setta-200">
          {title}
        </h3>
        <IoEllipsisHorizontal className="h-4 w-4 flex-shrink-0 text-setta-500" />
      </div>

      <div className="flex items-center justify-between">
        <p className="line-clamp-1 text-xs text-setta-600 dark:text-setta-400">
          {preview}
        </p>
        <span className="ml-2 flex-shrink-0 text-xs text-setta-400 dark:text-setta-500">
          {formattedDate}
        </span>
      </div>
    </button>
  );
}
