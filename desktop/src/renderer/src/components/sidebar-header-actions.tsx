import { FolderPlus } from "lucide-react";
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
        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-20",
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
    <SidebarIconButton label={label} onClick={onClick}>
      {icon}
    </SidebarIconButton>
  );
}

export function SidebarHeaderActionGroup({ children }: { children: ReactNode }) {
  return <div className="mr-0.5 flex shrink-0 items-center gap-0.5">{children}</div>;
}

export function ProjectFolderButton({
  busy,
  openLocalFolder,
}: {
  busy: boolean;
  openLocalFolder: () => Promise<void>;
}) {
  return (
    <SidebarHeaderActionGroup>
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
