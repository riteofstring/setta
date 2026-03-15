import { isActionablePath } from "./projectChatSkillsViewModel";

type ProjectChatSkillsMcpPathGroupHeaderProps = {
  title: string;
  path: string | null;
  onCopyPath: (path: string | null) => void;
  onRevealPath: (path: string | null) => void;
};

export function ProjectChatSkillsMcpPathGroupHeader({
  title,
  path,
  onCopyPath,
  onRevealPath,
}: ProjectChatSkillsMcpPathGroupHeaderProps) {
  const actionablePath = isActionablePath(path);
  const displayPath = path && path.trim() ? path : "Unavailable";
  const iconButtonClassName =
    "grid h-5 w-5 place-items-center rounded text-setta-500 opacity-0 transition-all duration-150 group-hover/header:opacity-100 group-focus-within/header:opacity-100 hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-200";

  return (
    <div className="group/header flex min-w-0 items-start justify-between gap-2 px-1 pb-1">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-setta-700 dark:text-setta-200">
          {title}
        </div>
        <div
          className="truncate font-mono text-[10px] text-setta-400 dark:text-setta-500"
          title={displayPath}
        >
          {displayPath}
        </div>
      </div>
      <div className="flex flex-none items-center gap-1">
        <button
          aria-label={`Copy path for ${title}`}
          title="Copy path"
          className={`${iconButtonClassName} cursor-pointer`}
          disabled={!actionablePath}
          onClick={() => onCopyPath(path)}
        >
          <i className="gg-file !scale-[0.55]" />
        </button>
        <button
          aria-label={`Reveal path for ${title}`}
          title="Reveal in OS file explorer"
          className={`${iconButtonClassName} cursor-pointer`}
          disabled={!actionablePath}
          onClick={() => onRevealPath(path)}
        >
          <i className="gg-folder !scale-[0.55]" />
        </button>
      </div>
    </div>
  );
}
