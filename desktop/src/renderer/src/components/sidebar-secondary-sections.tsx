import { Settings } from "lucide-react";

export function SidebarSettingsButton({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <button
      aria-label="Open settings"
      className="flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-xs text-muted-foreground hover:bg-accent/55 hover:text-foreground"
      onClick={onOpenSettings}
      type="button"
    >
      <Settings className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-medium">Settings</span>
    </button>
  );
}

export function EmptySectionSpace() {
  return <div aria-hidden="true" className="h-10" data-testid="sidebar-empty-space" />;
}
