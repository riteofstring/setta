import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";
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
import {
  allocateWorkspaceSectionWindowId,
  canWorkspaceSectionOpenInWindow,
  createWorkspaceSectionWindowContentId,
  getExternalWorkspaceSectionWindowBinding,
  getWorkspaceSectionWindowBinding,
} from "../../windowing/workspaceSectionWindowing";
import {
  moveWorkspaceWindowToCanvasSection,
  showWorkspaceSectionInFloatingWindow,
} from "../../windowing/windowingState";
import { WorkspaceSectionWindowToggleButton } from "../../windowing/WorkspaceSectionWindowToggleButton";
import { useOptionalWorkspaceWindowing } from "../../windowing/workspaceWindowingContext";

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

  extraControls?: ReactNode;

  showSectionContainerControls?: boolean;

  headerProps?: Omit<ComponentPropsWithoutRef<"header">, "children" | "ref"> & {
    "data-testid"?: string;
  };
};

export function SectionHeader({
  sectionId,
  hasSectionStyleTheme,
  extraControls = null,
  showSectionContainerControls = true,
  headerProps,
}: SectionHeaderProps) {
  const tagColor = useWorkspaceDocument(
    (x) => getSectionOrThrow(x, sectionId).tagColor,
  );
  const sectionKind = useWorkspaceDocument(
    (x) => getSectionOrThrow(x, sectionId).kind,
  );
  const host = useWorkspaceHost();
  const deleteActionLabel = getSectionKindDeleteActionLabel(host, sectionKind);
  const {
    className: headerClassName,
    style: headerStyle,
    ...nativeHeaderProps
  } = headerProps ?? {};

  return (
    <header
      {...nativeHeaderProps}
      className={getSectionHeaderClassName(headerClassName)}
      style={getSectionHeaderStyle({
        hasSectionStyleTheme,
        style: headerStyle,
      })}
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
        {showSectionContainerControls ? (
          <SectionWindowControl
            hasSectionStyleTheme={hasSectionStyleTheme}
            sectionId={sectionId}
          />
        ) : null}
        {extraControls}
        {showSectionContainerControls ? (
          <>
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
          </>
        ) : null}
      </div>
    </header>
  );
}

function SectionWindowControl({
  hasSectionStyleTheme,
  sectionId,
}: {
  hasSectionStyleTheme: boolean;
  sectionId: string;
}) {
  const host = useWorkspaceHost();
  const windowing = useOptionalWorkspaceWindowing();
  const section = useWorkspaceDocument((state) =>
    getSectionOrThrow(state, sectionId),
  );
  const viewport = windowing?.viewport;
  if (!windowing || !viewport) return null;
  const binding = getWorkspaceSectionWindowBinding(windowing.state, sectionId);
  const externalBinding = getExternalWorkspaceSectionWindowBinding(
    windowing.state,
    sectionId,
  );
  return (
    <WorkspaceSectionWindowToggleButton
      hasOpenExternalWindow={externalBinding !== null}
      hasSectionStyleTheme={hasSectionStyleTheme}
      layoutEditable={windowing.layoutEditable}
      onOpenInFloatingWindow={() => {
        windowing.onStateChange(
          showWorkspaceSectionInFloatingWindow(
            windowing.state,
            {
              contentId: createWorkspaceSectionWindowContentId(sectionId),
              id:
                binding?.id ??
                allocateWorkspaceSectionWindowId(windowing.state, sectionId),
              sectionId,
              title: section.name,
            },
            viewport,
            { layoutEditable: windowing.layoutEditable },
          ),
        );
      }}
      onShowInCanvas={() => {
        if (!binding) return;
        windowing.onStateChange(
          moveWorkspaceWindowToCanvasSection(windowing.state, binding.id, {
            layoutEditable: windowing.layoutEditable,
          }),
        );
      }}
      sectionId={sectionId}
      sectionWindowingSupported={canWorkspaceSectionOpenInWindow(host, section)}
    />
  );
}

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

function getSectionHeaderClassName(className: string | undefined): string {
  return className
    ? `${sectionHeaderBaseClassName} ${className}`
    : sectionHeaderBaseClassName;
}

function getSectionHeaderStyle({
  hasSectionStyleTheme,
  style,
}: {
  hasSectionStyleTheme: boolean;
  style: CSSProperties | undefined;
}): CSSProperties | undefined {
  if (!hasSectionStyleTheme) {
    return style;
  }
  return { color: "var(--setta-section-style-text)", ...style };
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
