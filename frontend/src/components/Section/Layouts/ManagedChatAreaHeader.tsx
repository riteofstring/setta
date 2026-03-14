import { PlanModeBadge } from "components/Chat/PlanModeBadge";

export function ManagedChatAreaHeader({
  shellClassName,
  showPlanModeBadge,
  showZeroScopeBanner,
  hasAnyAgenticEdge,
  hasWriteScope,
  canUseManagedChat,
  showHistory,
  onToggleHistory,
  onStartNewChat,
  onDismissZeroScopeBanner,
}: {
  shellClassName: string;
  showPlanModeBadge: boolean;
  showZeroScopeBanner: boolean;
  hasAnyAgenticEdge: boolean;
  hasWriteScope: boolean;
  canUseManagedChat: boolean;
  showHistory: boolean;
  onToggleHistory: () => void;
  onStartNewChat: () => void;
  onDismissZeroScopeBanner: () => void;
}) {
  return (
    <>
      {showPlanModeBadge ? (
        <div
          className={`${shellClassName} flex items-center justify-end gap-2 pt-2`}
        >
          <PlanModeBadge />
        </div>
      ) : null}
      {showZeroScopeBanner ? (
        <div className={`${shellClassName} pt-2`}>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-sm dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
            <div className="flex items-start justify-between gap-3">
              <p>
                No outgoing scope links. This chat has no project access. Add
                Chat → Section or Chat → Chat links, or use Project Chat for
                full access.
              </p>
              <button
                type="button"
                className="shrink-0 rounded-md border border-amber-300/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700 transition-colors hover:border-amber-500 hover:text-amber-900 dark:border-amber-500/50 dark:text-amber-200 dark:hover:border-amber-300 dark:hover:text-amber-100"
                onClick={onDismissZeroScopeBanner}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ) : hasAnyAgenticEdge && !hasWriteScope ? (
        <div className={`${shellClassName} pt-2`}>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-sm dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
            No writable sections in scope. This chat cannot modify sections. Add
            a Chat → Section edge (Scope sections) or use Project Chat for full
            access.
          </div>
        </div>
      ) : null}
      <div
        className={`${shellClassName} flex items-center justify-between gap-2 pt-2`}
      >
        <div className="flex min-h-6 items-center">
          {!hasAnyAgenticEdge ? (
            <span
              data-testid="managed-chat-zero-scope-indicator"
              className="inline-flex items-center gap-1 rounded-md border border-amber-300/80 bg-amber-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700 dark:border-amber-500/50 dark:bg-amber-950/30 dark:text-amber-200"
            >
              <span aria-hidden="true" className="text-[11px] leading-none">
                !
              </span>
              Scope limited
            </span>
          ) : null}
        </div>
        {canUseManagedChat ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-setta-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-setta-600 transition-colors hover:border-setta-400 hover:text-setta-800 dark:border-setta-700 dark:text-setta-300 dark:hover:border-setta-500 dark:hover:text-setta-100"
              onClick={onToggleHistory}
            >
              {showHistory ? "Back" : "History"}
            </button>
            <button
              type="button"
              className="rounded-md border border-setta-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-setta-600 transition-colors hover:border-setta-400 hover:text-setta-800 dark:border-setta-700 dark:text-setta-300 dark:hover:border-setta-500 dark:hover:text-setta-100"
              onClick={onStartNewChat}
            >
              New Chat
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
