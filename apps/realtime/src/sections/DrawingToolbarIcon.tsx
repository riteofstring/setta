import type { ReactNode } from "react";

type DrawingToolbarIconName =
  | "clear"
  | "draw"
  | "erase"
  | "highlighter"
  | "image"
  | "redo"
  | "select"
  | "text"
  | "undo";

const DRAWING_TOOLBAR_ICONS: Record<DrawingToolbarIconName, ReactNode> = {
  clear: (
    <>
      <path d="M5 7h14M9 7V4h6v3m2 0-1 13H8L7 7" />
      <path d="M10 11v5m4-5v5" />
    </>
  ),
  draw: (
    <>
      <path d="m4 20 4.2-1 10.9-11a2.1 2.1 0 0 0-3-3L5.2 16 4 20Z" />
      <path d="m14.8 6.4 3 3" />
    </>
  ),
  erase: (
    <>
      <path d="m4.8 14.8 7.7-9a2 2 0 0 1 2.9-.2l3 2.6a2 2 0 0 1 .2 2.8l-7.7 9H7.2l-2.4-2.1a2 2 0 0 1 0-3.1Z" />
      <path d="m9.2 9.7 6 5.1M10.9 20h8.3" />
    </>
  ),
  highlighter: (
    <>
      <path d="m6 16 8.8-10.4a2 2 0 0 1 2.8-.2l1 .8a2 2 0 0 1 .2 2.8L10 19.5 6 16Z" />
      <path d="m12.8 8 4 3.4M4 20h9" />
    </>
  ),
  image: (
    <>
      <rect height="15" rx="2" width="18" x="3" y="4.5" />
      <circle cx="8" cy="9" r="1.5" />
      <path d="m4.5 17 4.2-4 3.1 2.6 2.7-3 5 4.4" />
    </>
  ),
  redo: (
    <>
      <path d="m15 7 4 4-4 4" />
      <path d="M18.5 11H10a5 5 0 0 0-5 5v2" />
    </>
  ),
  select: <path d="m6 3 11 10-5 .7 3.2 5.4-2.4 1.4-3.1-5.4L6 18V3Z" />,
  text: (
    <>
      <path d="M5 5h14M12 5v14" />
      <path d="M8 19h8" />
    </>
  ),
  undo: (
    <>
      <path d="M9 7 5 11l4 4" />
      <path d="M5.5 11H14a5 5 0 0 1 5 5v2" />
    </>
  ),
};

export function DrawingToolbarIcon({ name }: { name: DrawingToolbarIconName }) {
  return (
    <svg
      aria-hidden="true"
      className="realtime-drawing-toolbar-icon"
      fill="none"
      viewBox="0 0 24 24"
    >
      {DRAWING_TOOLBAR_ICONS[name]}
    </svg>
  );
}
