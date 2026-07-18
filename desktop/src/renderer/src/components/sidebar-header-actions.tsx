import { FolderPlus, MessageSquarePlus } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "../lib/utils";

export function SidebarIconButton({
  children,
  className,
  disabled = false,
  label,
  onClick,
  type = "button",
  ...buttonProps
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  label: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...buttonProps}
      aria-label={label}
      className={cn(
        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-20",
        className,
      )}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type={type}
    >
      {children}
    </button>
  );
}

function SidebarHeaderActionGroup({ children }: { children: ReactNode }) {
  return <div className="mr-0.5 flex shrink-0 items-center gap-0.5">{children}</div>;
}

export function ConversationSectionHeaderActions({
  busy,
  createConversation,
  disabled,
  openLocalFolder,
}: {
  busy: boolean;
  createConversation: () => Promise<void>;
  disabled: boolean;
  openLocalFolder: () => Promise<void>;
}) {
  return (
    <SidebarHeaderActionGroup>
      <SidebarIconButton
        disabled={busy || disabled}
        label="New conversation"
        onClick={() => void createConversation()}
      >
        <MessageSquarePlus className="h-3.5 w-3.5" />
      </SidebarIconButton>
      <SidebarIconButton
        disabled={busy}
        label="Open project folder"
        onClick={() => void openLocalFolder()}
      >
        <FolderPlus className="h-3.5 w-3.5" />
      </SidebarIconButton>
    </SidebarHeaderActionGroup>
  );
}
