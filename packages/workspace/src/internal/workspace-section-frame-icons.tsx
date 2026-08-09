import type { ReactNode } from "react";

function sectionActionIcon(children: ReactNode) {
  return (
    <svg
      aria-hidden="true"
      className="setta-workspace__section-action-icon"
      fill="none"
      focusable="false"
      viewBox="0 0 20 20"
    >
      {children}
    </svg>
  );
}

// Section chrome icons rerender on every selection commit and interaction
// broadcast, so each variant is a module constant: identical element
// identities let React bail out of the SVG subtrees instead of recreating
// them for every affected frame and handle.
const moveIcon = sectionActionIcon(
  <path d="M10 2.75v14.5M2.75 10h14.5M7.5 5.25 10 2.75l2.5 2.5M7.5 14.75l2.5 2.5 2.5-2.5M5.25 7.5 2.75 10l2.5 2.5M14.75 7.5l2.5 2.5-2.5 2.5" />,
);

export function MoveIcon() {
  return moveIcon;
}

const renameIcon = sectionActionIcon(
  <path d="m4 13.75-.75 3 3-.75L15 7.25 12.75 5 4 13.75ZM11.5 6.25l2.25 2.25" />,
);

export function RenameIcon() {
  return renameIcon;
}

const styleIcon = sectionActionIcon(
  <>
    <path d="M4 5h12M4 10h12M4 15h12" />
    <circle cx="7" cy="5" r="1.5" />
    <circle cx="13" cy="10" r="1.5" />
    <circle cx="8.5" cy="15" r="1.5" />
  </>,
);

export function StyleIcon() {
  return styleIcon;
}

function selectionIcon(selected: boolean) {
  return sectionActionIcon(
    <>
      <path d="M7 3.5H4.5a1 1 0 0 0-1 1V7M13 3.5h2.5a1 1 0 0 1 1 1V7M7 16.5H4.5a1 1 0 0 1-1-1V13M13 16.5h2.5a1 1 0 0 0 1-1V13" />
      <path
        className="setta-workspace__section-selection-check"
        d="m6.75 10 2.1 2.1 4.4-4.45"
        data-selected={String(selected)}
      />
    </>,
  );
}

const selectedSelectionIcon = selectionIcon(true);
const unselectedSelectionIcon = selectionIcon(false);

export function SelectionIcon({ selected }: Readonly<{ selected: boolean }>) {
  return selected ? selectedSelectionIcon : unselectedSelectionIcon;
}

function detachIcon(detached: boolean) {
  return sectionActionIcon(
    <>
      <path d="M7.25 5.25H4.5a1 1 0 0 0-1 1v9.25a1 1 0 0 0 1 1h9.25a1 1 0 0 0 1-1v-2.75" />
      <path d={detached ? "M8 9.5h6.5v-6" : "M9 3.5h7.5V11"} />
      <path d={detached ? "m11.5 6.5 3 3 3-3" : "m8.5 11.5 8-8"} />
    </>,
  );
}

const detachedDetachIcon = detachIcon(true);
const attachedDetachIcon = detachIcon(false);

export function DetachIcon({ detached }: Readonly<{ detached: boolean }>) {
  return detached ? detachedDetachIcon : attachedDetachIcon;
}
