import type { ReactNode } from "react";

type DrawingToolbarIconName =
  | "actual-size"
  | "arrow"
  | "clear"
  | "delete"
  | "draw"
  | "ellipse"
  | "erase"
  | "fit"
  | "grid"
  | "hand"
  | "highlighter"
  | "line"
  | "rectangle"
  | "redo"
  | "select"
  | "snap"
  | "text"
  | "undo"
  | "zoom-in"
  | "zoom-out";

const DRAWING_TOOLBAR_ICONS: Record<DrawingToolbarIconName, ReactNode> = {
  "actual-size": (
    <>
      <path d="M8 4H4v4m12-4h4v4M8 20H4v-4m12 4h4v-4" />
      <path d="M9 9h6v6H9z" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 19 19 5" />
      <path d="M12 5h7v7" />
    </>
  ),
  clear: (
    <>
      <path d="M5 7h14M9 7V4h6v3m2 0-1 13H8L7 7" />
      <path d="M10 11v5m4-5v5" />
    </>
  ),
  delete: (
    <>
      <path d="m4 12 5-6h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5-6Z" />
      <path d="m12 9 5 6m0-6-5 6" />
    </>
  ),
  draw: (
    <>
      <path d="m4 20 4.2-1 10.9-11a2.1 2.1 0 0 0-3-3L5.2 16 4 20Z" />
      <path d="m14.8 6.4 3 3" />
    </>
  ),
  ellipse: <ellipse cx="12" cy="12" rx="7" ry="7" />,
  erase: (
    <>
      <path d="m4.8 14.8 7.7-9a2 2 0 0 1 2.9-.2l3 2.6a2 2 0 0 1 .2 2.8l-7.7 9H7.2l-2.4-2.1a2 2 0 0 1 0-3.1Z" />
      <path d="m9.2 9.7 6 5.1M10.9 20h8.3" />
    </>
  ),
  fit: (
    <>
      <path d="M8 4v4H4m12-4v4h4M8 20v-4H4m12 4v-4h4" />
      <rect height="6" rx="1" width="8" x="8" y="9" />
    </>
  ),
  grid: (
    <>
      <path d="M4 4h16v16H4zM9.3 4v16m5.4-16v16M4 9.3h16M4 14.7h16" />
    </>
  ),
  hand: (
    <path d="M7.5 11V7.5a1.5 1.5 0 0 1 3 0V10m0-4.5a1.5 1.5 0 0 1 3 0V10m0-3a1.5 1.5 0 0 1 3 0v4m0-2a1.5 1.5 0 0 1 3 0v4.5c0 4-2.7 6.5-6.5 6.5h-1.2a6 6 0 0 1-4.6-2.2L4.6 14a1.6 1.6 0 0 1 2.3-2.2l1.6 1.5" />
  ),
  highlighter: (
    <>
      <path d="m6 16 8.8-10.4a2 2 0 0 1 2.8-.2l1 .8a2 2 0 0 1 .2 2.8L10 19.5 6 16Z" />
      <path d="m12.8 8 4 3.4M4 20h9" />
    </>
  ),
  line: <path d="M5 19 19 5" />,
  rectangle: <rect height="14" rx="1.5" width="14" x="5" y="5" />,
  redo: (
    <>
      <path d="m15 7 4 4-4 4" />
      <path d="M18.5 11H10a5 5 0 0 0-5 5v2" />
    </>
  ),
  select: <path d="m6 3 11 10-5 .7 3.2 5.4-2.4 1.4-3.1-5.4L6 18V3Z" />,
  snap: (
    <>
      <path d="M6 4v9a6 6 0 0 0 12 0V4" />
      <path d="M6 8h4m4 0h4" />
    </>
  ),
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
  "zoom-in": (
    <>
      <circle cx="10.5" cy="10.5" r="5.5" />
      <path d="m15 15 4 4M8 10.5h5m-2.5-2.5v5" />
    </>
  ),
  "zoom-out": (
    <>
      <circle cx="10.5" cy="10.5" r="5.5" />
      <path d="m15 15 4 4M8 10.5h5" />
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
