export function ProjectChatHistory() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 pt-2">
      <ChatHistoryItem />
      <ChatHistoryItem />
      <ChatHistoryItem />
      <ChatHistoryItem />
      <ChatHistoryItem />
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
