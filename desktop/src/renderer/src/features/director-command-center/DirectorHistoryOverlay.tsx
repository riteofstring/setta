import type { WorkstreamGraph } from "@generated/backend";
import { X } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";

export type DirectorHistory = WorkstreamGraph["nodes"];

export function compactDirectorHistory(graph: WorkstreamGraph | null): DirectorHistory {
  if (graph === null) {
    return [];
  }
  return graph.nodes
    .filter((node) =>
      ["user_goal", "director_decision", "milestone", "completed", "failed", "cancelled"].includes(
        node.kind,
      ),
    )
    .slice(-5);
}

export function DirectorHistoryOverlaySlot({
  history,
  isOpen,
  onClose,
}: {
  history: DirectorHistory;
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) {
    return null;
  }
  return <HistoryOverlay history={history} onClose={onClose} />;
}

function HistoryOverlay({ history, onClose }: { history: DirectorHistory; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    trapDialogFocus(event, dialogRef.current);
  };

  return (
    <div className="director-history-overlay">
      <button
        aria-label="Close history"
        className="director-history-backdrop"
        onClick={onClose}
        type="button"
      />
      <section
        aria-label="Thread history"
        aria-modal="true"
        className="director-history-dialog"
        onKeyDown={onKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header>
          <div>
            <p className="director-rail-kicker">Thread history</p>
            <h2>Recent user and outcome turns</h2>
          </div>
          <button
            aria-label="Close history"
            className="director-artifact-detail-close"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={15} />
          </button>
        </header>
        <HistoryOverlayBody history={history} />
      </section>
    </div>
  );
}

function HistoryOverlayBody({ history }: { history: DirectorHistory }): ReactNode {
  if (history.length === 0) {
    return <p className="director-rail-summary">No work has been selected.</p>;
  }
  return (
    <ol className="director-history-dialog-list">
      {history.map((node) => (
        <li data-node-kind={node.kind} key={node.id}>
          <span>{node.publicSummary}</span>
        </li>
      ))}
    </ol>
  );
}

function trapDialogFocus(event: ReactKeyboardEvent<HTMLElement>, dialog: HTMLElement | null): void {
  if (dialog === null) {
    return;
  }
  const focusable = Array.from(
    dialog.querySelectorAll<HTMLElement>(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
    ),
  ).filter((node) => !node.hasAttribute("disabled") && !node.getAttribute("aria-hidden"));
  if (focusable.length === 0) {
    event.preventDefault();
    dialog.focus();
    return;
  }
  const first = focusable[0] as HTMLElement;
  const last = focusable[focusable.length - 1] as HTMLElement;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
