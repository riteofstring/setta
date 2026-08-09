function SectionActionIcon({ children }: Readonly<{ children: React.ReactNode }>) {
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

export function MoveIcon() {
  return (
    <SectionActionIcon>
      <path d="M10 2.75v14.5M2.75 10h14.5M7.5 5.25 10 2.75l2.5 2.5M7.5 14.75l2.5 2.5 2.5-2.5M5.25 7.5 2.75 10l2.5 2.5M14.75 7.5l2.5 2.5-2.5 2.5" />
    </SectionActionIcon>
  );
}

export function RenameIcon() {
  return (
    <SectionActionIcon>
      <path d="m4 13.75-.75 3 3-.75L15 7.25 12.75 5 4 13.75ZM11.5 6.25l2.25 2.25" />
    </SectionActionIcon>
  );
}

export function StyleIcon() {
  return (
    <SectionActionIcon>
      <path d="M4 5h12M4 10h12M4 15h12" />
      <circle cx="7" cy="5" r="1.5" />
      <circle cx="13" cy="10" r="1.5" />
      <circle cx="8.5" cy="15" r="1.5" />
    </SectionActionIcon>
  );
}

export function SelectionIcon({ selected }: Readonly<{ selected: boolean }>) {
  return (
    <SectionActionIcon>
      <path d="M7 3.5H4.5a1 1 0 0 0-1 1V7M13 3.5h2.5a1 1 0 0 1 1 1V7M7 16.5H4.5a1 1 0 0 1-1-1V13M13 16.5h2.5a1 1 0 0 0 1-1V13" />
      <path
        className="setta-workspace__section-selection-check"
        d="m6.75 10 2.1 2.1 4.4-4.45"
        data-selected={String(selected)}
      />
    </SectionActionIcon>
  );
}
