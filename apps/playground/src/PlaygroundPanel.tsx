import { useEffect, useRef, type ReactNode } from "react";

type PlaygroundPanelProps = Readonly<{
  children: ReactNode;
  id: string;
  onClose(): void;
  title: string;
}>;

export function PlaygroundPanel({ children, id, onClose, title }: PlaygroundPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const headingId = `${id}-heading`;

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) {
      throw new Error("The playground panel element is unavailable.");
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    panel.addEventListener("keydown", handleKeyDown);
    return () => {
      panel.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      aria-labelledby={headingId}
      className="playground-panel"
      id={id}
      ref={panelRef}
      role="dialog"
      tabIndex={-1}
    >
      <div className="playground-panel__header">
        <h2 id={headingId}>{title}</h2>
        <button className="playground-panel__close" onClick={onClose} type="button">
          Close
        </button>
      </div>
      {children}
    </div>
  );
}
