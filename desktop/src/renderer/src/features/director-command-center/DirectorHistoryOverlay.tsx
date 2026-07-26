import type { WorkstreamGraph } from "@generated/backend";
import { X } from "lucide-react";
import {
  useId,
  useLayoutEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

export type DirectorHistory = WorkstreamGraph["nodes"];

export function compactDirectorHistory(graph: WorkstreamGraph | null): DirectorHistory {
  if (graph === null) {
    return [];
  }
  return graph.nodes
    .filter((node) => ["user_goal", "completed", "failed", "cancelled"].includes(node.kind))
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
  const headingId = useId();
  const overlayRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useLayoutEffect(() => {
    closeButtonRef.current?.focus({ preventScroll: true });
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
    trapDialogFocus(event, overlayRef.current);
  };

  return (
    <section
      aria-labelledby={headingId}
      aria-modal="true"
      className="director-history-overlay"
      onKeyDown={onKeyDown}
      ref={overlayRef}
      role="dialog"
      tabIndex={-1}
    >
      <button
        aria-label="Close history"
        className="director-history-backdrop"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <div className="director-history-dialog">
        <header>
          <div>
            <p className="director-rail-kicker">Thread history</p>
            <h2 id={headingId}>Recent user and outcome turns</h2>
          </div>
          <button
            aria-label="Close history"
            className="director-artifact-detail-close"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <X aria-hidden="true" size={15} />
          </button>
        </header>
        <HistoryOverlayBody history={history} />
      </div>
    </section>
  );
}

function HistoryOverlayBody({ history }: { history: DirectorHistory }): ReactNode {
  if (history.length === 0) {
    return <p className="director-rail-summary">No workstream history yet.</p>;
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
  const focusable = dialogFocusableElements(dialog);
  if (focusable.length === 0) {
    event.preventDefault();
    dialog.focus();
    return;
  }
  const target = dialogFocusTarget(
    event.shiftKey,
    document.activeElement,
    dialog,
    focusable[0] as HTMLElement,
    focusable[focusable.length - 1] as HTMLElement,
  );
  if (target !== null) {
    event.preventDefault();
    target.focus();
  }
}

function dialogFocusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(
      "button:not([tabindex='-1']), [href]:not([tabindex='-1']), input:not([tabindex='-1']), select:not([tabindex='-1']), textarea:not([tabindex='-1']), [tabindex]:not([tabindex='-1'])",
    ),
  ).filter(
    (node) =>
      !node.hasAttribute("disabled") &&
      node.getAttribute("aria-hidden") !== "true" &&
      !node.closest("[inert]"),
  );
}

function dialogFocusTarget(
  shiftKey: boolean,
  active: Element | null,
  dialog: HTMLElement,
  first: HTMLElement,
  last: HTMLElement,
): HTMLElement | null {
  if (!dialog.contains(active) || active === dialog) {
    return shiftKey ? last : first;
  }
  if (shiftKey) {
    return active === first ? last : null;
  }
  return active === last ? first : null;
}
