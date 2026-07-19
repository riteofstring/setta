import { MessageCircleMore, Sparkles } from "lucide-react";

export function MasterSidebarLauncher({
  disabled,
  onOpen,
}: {
  disabled: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      aria-label="Open Ask Setta"
      className="setta-master-sidebar-launcher"
      data-testid="master-sidebar-launcher"
      disabled={disabled}
      onClick={onOpen}
      type="button"
    >
      <span aria-hidden="true" className="setta-master-sidebar-launcher-icon">
        <Sparkles />
      </span>
      <span className="min-w-0 flex-1 truncate text-left">Ask Setta</span>
      <MessageCircleMore aria-hidden="true" className="h-3.5 w-3.5 shrink-0 opacity-55" />
    </button>
  );
}
