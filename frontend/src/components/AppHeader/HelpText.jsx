export function HelpText() {
  return (
    <aside className="ml-auto mr-4 flex items-center gap-2">
      <div className="hidden items-center gap-2 lg:flex">
        <p className="text-xs font-bold text-setta-400 dark:text-setta-500">
          Hold down &quot;Q&quot; to see tool tips.
        </p>
        <button className="flex cursor-pointer items-center text-setta-300 hover:text-setta-700 dark:text-setta-500 dark:hover:text-setta-400">
          <i className="gg-close" />
        </button>
      </div>
    </aside>
  );
}
