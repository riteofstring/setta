import { FolderPlus } from "lucide-react";
import type { ReactNode } from "react";

export function SidebarHeaderIconButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
      onClick={onClick}
      title={label}
      type="button"
    >
      {icon}
    </button>
  );
}

export function ProjectFolderButton({
  busy,
  openLocalFolder,
}: {
  busy: boolean;
  openLocalFolder: () => Promise<void>;
}) {
  return (
    <div className="shrink-0">
      <button
        aria-label="Open project folder"
        className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-40"
        disabled={busy}
        onClick={() => void openLocalFolder()}
        title="Open project folder"
        type="button"
      >
        <FolderPlus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
