type DrawingToolbarIconName =
  | "clear"
  | "delete"
  | "draw"
  | "ellipse"
  | "erase"
  | "rectangle"
  | "redo"
  | "select"
  | "undo";

export function DrawingToolbarIcon({ name }: { name: DrawingToolbarIconName }) {
  return (
    <svg
      aria-hidden="true"
      className="realtime-drawing-toolbar-icon"
      fill="none"
      viewBox="0 0 24 24"
    >
      {iconContents(name)}
    </svg>
  );
}

function iconContents(name: DrawingToolbarIconName) {
  switch (name) {
    case "select":
      return <path d="m6 3 11 10-5 .7 3.2 5.4-2.4 1.4-3.1-5.4L6 18V3Z" />;
    case "draw":
      return (
        <>
          <path d="m4 20 4.2-1 10.9-11a2.1 2.1 0 0 0-3-3L5.2 16 4 20Z" />
          <path d="m14.8 6.4 3 3" />
        </>
      );
    case "erase":
      return (
        <>
          <path d="m4.8 14.8 7.7-9a2 2 0 0 1 2.9-.2l3 2.6a2 2 0 0 1 .2 2.8l-7.7 9H7.2l-2.4-2.1a2 2 0 0 1 0-3.1Z" />
          <path d="m9.2 9.7 6 5.1M10.9 20h8.3" />
        </>
      );
    case "rectangle":
      return <rect height="14" rx="1.5" width="14" x="5" y="5" />;
    case "ellipse":
      return <ellipse cx="12" cy="12" rx="7" ry="7" />;
    case "undo":
      return (
        <>
          <path d="M9 7 5 11l4 4" />
          <path d="M5.5 11H14a5 5 0 0 1 5 5v2" />
        </>
      );
    case "redo":
      return (
        <>
          <path d="m15 7 4 4-4 4" />
          <path d="M18.5 11H10a5 5 0 0 0-5 5v2" />
        </>
      );
    case "delete":
      return (
        <>
          <path d="m4 12 5-6h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5-6Z" />
          <path d="m12 9 5 6m0-6-5 6" />
        </>
      );
    case "clear":
      return (
        <>
          <path d="M5 7h14M9 7V4h6v3m2 0-1 13H8L7 7" />
          <path d="M10 11v5m4-5v5" />
        </>
      );
  }
}
