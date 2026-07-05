import { AlertTriangle, X } from "lucide-react";

export function WorkspaceLayoutRecoveryNotice({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  if (!message) {
    return null;
  }
  return (
    <div
      className="app-no-drag absolute top-10 right-3 left-3 z-50 flex min-w-0 items-start gap-2 rounded-sm border border-amber-500/35 bg-amber-950/70 px-2.5 py-2 text-xs text-amber-100 shadow-lg"
      data-testid="workspace-layout-recovery"
      role="alert"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0 flex-1 break-words leading-4">{message}</div>
      <button
        aria-label="Dismiss layout recovery notice"
        className="grid h-5 w-5 shrink-0 place-items-center rounded-sm text-amber-100/80 hover:bg-amber-100/10 hover:text-amber-50 focus-visible:bg-amber-100/10 focus-visible:text-amber-50"
        onClick={onDismiss}
        title="Dismiss layout recovery notice"
        type="button"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export function WorkspacePaneHost({
  refCallback,
}: {
  refCallback: (host: HTMLDivElement | null) => void;
}) {
  return (
    <article
      className="workspace-pane-host app-no-drag"
      data-focused="false"
      data-maximized="false"
      data-moving="false"
      data-pane-id=""
      data-runtime-state="live"
      data-surface-kind=""
      data-testid="workspace-pane-host"
      data-tone="slate"
      data-visible="false"
      ref={refCallback}
    />
  );
}
