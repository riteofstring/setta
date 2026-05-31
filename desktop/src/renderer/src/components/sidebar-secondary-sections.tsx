import { Settings } from "lucide-react";

export function SidebarSettingsButton({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <button
      aria-label="Open settings"
      className="flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-xs text-zinc-400 hover:bg-zinc-800/55 hover:text-zinc-100"
      onClick={onOpenSettings}
      type="button"
    >
      <Settings className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
      <span className="min-w-0 flex-1 truncate font-medium">Settings</span>
      <span className="text-[11px] text-zinc-600">Right pane</span>
    </button>
  );
}

export function EmptySectionSpace() {
  return <div aria-hidden="true" className="h-10" data-testid="sidebar-empty-space" />;
}
