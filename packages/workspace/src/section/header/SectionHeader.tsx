import type { CSSProperties } from "react";
import { getSectionOrThrow } from "../../document/documentSelectors";
import {
  getSectionKindDeleteActionLabel,
  getSectionKindHeaderControls,
} from "../../document/sectionKindRegistry";
import { useActiveSections, useWorkspaceDocument } from "../../document/stores";
import { DeleteOrHideButton } from "./DeleteOrHideButton";
import { LockPositionButton } from "./LockPositionButton";
import { MenuButton } from "./MenuButton";
import { MinimizeButton } from "./MinimizeButton";
import { SectionTitle, type SectionTitleClassNames } from "./SectionTitle";
import { useWorkspaceHost } from "../../workspaceHostContext";

// The reference's `SectionHeader`, trimmed to the slice-reachable groups: the leading icon,
// tag-color indicator, and editable title, then the container controls (lock, minimize,
// delete). Diagnostics, run/entry-code, attached-terminal, chat-follow, TextBlock display-mode,
// and section-window controls left with their features. The measured-height tracking fed only
// the params-area minimum height, which stayed application-side.
const sectionHeaderBaseClassName =
  "section-title mx-2 flex flex-row items-center";
const editingTitleBaseClassName =
  "cursor-text nodrag px-1 py-0 leading-5 -ms-1 bg-setta-100 focus-visible:ring-0 focus-visible:outline-none rounded-md box-border border border-solid border-transparent focus-visible:border-blue-500 dark:bg-setta-800 w-full font-bold text-[.7rem] tracking-tight";
const editingTitleDefaultClassName = `${editingTitleBaseClassName} dark:text-white`;
const fixedTitleBaseClassName =
  "select-none italic focus-visible:ring-0 focus-visible:outline-none box-border border border-solid border-transparent focus-visible:border-blue-500 tracking-tighter text-xs max-w-full truncate pe-0.5";
const fixedTitleDefaultClassName = `${fixedTitleBaseClassName} text-setta-400`;
const notEditingTitleBaseClassName =
  "px-1 py-0 -ms-1 w-full focus-visible:ring-0 focus-visible:outline-none box-border rounded-md border border-solid border-transparent focus-visible:border-blue-500 leading-5 font-bold tracking-tight cursor-pointer max-w-full text-[.7rem] truncate";

type SectionHeaderProps = {
  sectionId: string;
  hasSectionStyleTheme: boolean;
};

export function SectionHeader({
  sectionId,
  hasSectionStyleTheme,
}: SectionHeaderProps) {
  const tagColor = useWorkspaceDocument(
    (x) => getSectionOrThrow(x, sectionId).tagColor,
  );
  const sectionKind = useWorkspaceDocument(
    (x) => getSectionOrThrow(x, sectionId).kind,
  );
  const host = useWorkspaceHost();
  const deleteActionLabel = getSectionKindDeleteActionLabel(host, sectionKind);

  return (
    <header
      className={sectionHeaderBaseClassName}
      style={getSectionHeaderStyle(hasSectionStyleTheme)}
    >
      <MenuButton
        sectionId={sectionId}
        sectionKind={sectionKind}
        hasSectionStyleTheme={hasSectionStyleTheme}
      />
      <SectionTagColorIndicator tagColor={tagColor} />
      <SectionCardTitle
        sectionId={sectionId}
        hasSectionStyleTheme={hasSectionStyleTheme}
      />
      <div
        className="z-10 ms-auto flex items-center"
        data-setta-workspace-compact-control-group="true"
      >
        <SectionKindHeaderControls
          sectionId={sectionId}
          sectionKind={sectionKind}
        />
        <LockPositionButton
          sectionId={sectionId}
          hasSectionStyleTheme={hasSectionStyleTheme}
        />
        <MinimizeButton
          sectionId={sectionId}
          hasSectionStyleTheme={hasSectionStyleTheme}
        />
        <DeleteOrHideButton
          sectionId={sectionId}
          hasSectionStyleTheme={hasSectionStyleTheme}
          label={deleteActionLabel ?? "Delete section"}
        />
      </div>
    </header>
  );
}

// The reference's `SectionTypeControls` slot: a registered kind places its own compact header
// controls ahead of the container controls. The subscription resolves to null for every kind that
// registers none, so a header without contributed controls never re-renders for its section.
function SectionKindHeaderControls({
  sectionId,
  sectionKind,
}: {
  sectionId: string;
  sectionKind: string;
}) {
  const host = useWorkspaceHost();
  const renderHeaderControls = getSectionKindHeaderControls(host, sectionKind);
  const section = useWorkspaceDocument((x) =>
    renderHeaderControls ? getSectionOrThrow(x, sectionId) : null,
  );
  if (!renderHeaderControls || !section) {
    return null;
  }
  return <>{renderHeaderControls(section)}</>;
}

function getSectionHeaderStyle(
  hasSectionStyleTheme: boolean,
): CSSProperties | undefined {
  if (!hasSectionStyleTheme) {
    return undefined;
  }
  return { color: "var(--setta-section-style-text)" };
}

function SectionTagColorIndicator({ tagColor }: { tagColor: string | null }) {
  if (!tagColor) {
    return null;
  }

  return (
    <span
      role="img"
      aria-label={`Color tag ${tagColor}`}
      className="nodrag ms-2.5 me-0.5 h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/10"
      style={{ backgroundColor: tagColor }}
      title={`Color tag: ${tagColor}`}
    />
  );
}

function SectionCardTitle({
  sectionId,
  hasSectionStyleTheme,
}: {
  sectionId: string;
  hasSectionStyleTheme: boolean;
}) {
  const isActiveSection = useActiveSections((x) =>
    x.activeIds.includes(sectionId),
  );
  return (
    <SectionTitle
      sectionId={sectionId}
      titleProps={getTitleStyles({ isActiveSection, hasSectionStyleTheme })}
    />
  );
}

function getTitleStyles({
  isActiveSection,
  hasSectionStyleTheme,
}: {
  isActiveSection: boolean;
  hasSectionStyleTheme: boolean;
}): SectionTitleClassNames {
  return {
    editing: hasSectionStyleTheme
      ? editingTitleBaseClassName
      : editingTitleDefaultClassName,
    notEditing: getNotEditingStyle({ isActiveSection, hasSectionStyleTheme }),
    fixed: hasSectionStyleTheme
      ? fixedTitleBaseClassName
      : fixedTitleDefaultClassName,
  };
}

function getNotEditingStyle({
  isActiveSection,
  hasSectionStyleTheme,
}: {
  isActiveSection: boolean;
  hasSectionStyleTheme: boolean;
}) {
  return [
    notEditingTitleBaseClassName,
    getNotEditingTextColorClass({ isActiveSection, hasSectionStyleTheme }),
    "font-bold",
  ]
    .filter(Boolean)
    .join(" ");
}

function getNotEditingTextColorClass({
  isActiveSection,
  hasSectionStyleTheme,
}: {
  isActiveSection: boolean;
  hasSectionStyleTheme: boolean;
}) {
  if (hasSectionStyleTheme) {
    return "";
  }
  if (!isActiveSection) {
    return "text-setta-700 dark:text-setta-300";
  }
  return "text-blue-600 dark:text-blue-400";
}
