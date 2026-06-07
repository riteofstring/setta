import { PenLine } from "lucide-react";
import type { ReactNode } from "react";

export function SidebarShortcuts({
  busy,
  createConversation,
  hasWorkspace,
}: {
  busy: boolean;
  createConversation: (title?: string) => Promise<void>;
  hasWorkspace: boolean;
}) {
  return (
    <nav className="grid gap-0.5" aria-label="Primary">
      <SidebarShortcutButton
        disabled={busy || !hasWorkspace}
        icon={<PenLine className="h-3.5 w-3.5" />}
        label="New chat"
        onClick={() => void createConversation()}
      />
    </nav>
  );
}

function SidebarShortcutButton({
  disabled = false,
  icon,
  label,
  onClick,
}: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="flex h-7 w-full min-w-0 items-center gap-2 rounded-sm px-2 text-left text-xs text-zinc-300 hover:bg-zinc-800/70 hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span className="shrink-0 text-zinc-300">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}
