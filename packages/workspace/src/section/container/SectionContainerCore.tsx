import type { KeyboardEvent, MouseEvent } from "react";
import { useWorkspaceSectionAttentionHighlight } from "../../attention/workspaceSectionAttention";
import { applyActiveSectionChange } from "../../canvas/activeSectionController";
import { openWorkspaceSectionMenu } from "../../context-menu/workspaceMenuInvocation";
import {
  getOwnerKeyboardMenuPoint,
  isWorkspaceMenuKeyboardEvent,
  shouldRetainNativeContextMenu,
} from "../../context-menu/workspaceMenuOwnership";
import { getSectionOrThrow } from "../../document/documentSelectors";
import {
  canWorkspaceSectionOwnNestedSections,
  getMetaControlPresentation,
} from "../../document/sectionKindRegistry";
import {
  useActiveSections,
  useWorkspaceAppearance,
  useWorkspaceDocument,
} from "../../document/stores";
import { useWorkspaceHost } from "../../workspaceHostContext";
import { WorkspaceGraphPorts } from "../../graph/WorkspaceGraphPorts";
import { getSectionContainerShellClassName } from "../sectionChrome";
import { getOnSectionClick } from "../sectionClick";
import { useSectionRefAndInit } from "../sectionRefs";
import { deriveSectionStyleTheme } from "../sectionStyleColors";
import { resolveSectionStyleVars } from "../sectionStyleVars";
import { SectionContainerContent } from "./SectionContainerContent";

export function SectionContainerCore({ sectionId }: { sectionId: string }) {
  const host = useWorkspaceHost();
  const section = useWorkspaceDocument((x) => getSectionOrThrow(x, sectionId));
  const isActiveSection = useActiveSections((x) =>
    x.activeIds.includes(sectionId),
  );
  const showAttention = useWorkspaceSectionAttentionHighlight(sectionId);
  const darkMode = useWorkspaceAppearance((x) => x.darkMode);
  const refForPosition = useSectionRefAndInit(sectionId, "selfOnly");
  const isMetaControl = getMetaControlPresentation(host, section) !== null;
  const canOwnNestedSections = canWorkspaceSectionOwnNestedSections(
    host,
    section,
  );

  const sectionStyleTheme =
    !isMetaControl && section.styleColor
      ? deriveSectionStyleTheme(section.styleColor, darkMode)
      : null;
  const hasSectionStyleTheme = Boolean(sectionStyleTheme);
  const sectionShellClassName = getSectionContainerShellClassName({
    isActiveSection,
    hasSectionStyleTheme,
    positionAndSizeLocked: section.positionAndSizeLocked,
    useMetaControlStyle: isMetaControl,
  });
  const sectionShellStyle = resolveSectionStyleVars(sectionStyleTheme);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (
      event.target === event.currentTarget &&
      isWorkspaceMenuKeyboardEvent(event.nativeEvent)
    ) {
      event.preventDefault();
      event.stopPropagation();
      openWorkspaceSectionMenu(
        host,
        sectionId,
        "context-menu",
        getOwnerKeyboardMenuPoint(event.currentTarget),
        event.currentTarget,
      );
      return;
    }
    if (
      event.target === event.currentTarget &&
      (event.key === "Enter" || event.key === " ")
    ) {
      event.preventDefault();
      event.stopPropagation();
      applyActiveSectionChange(host, {
        interaction: "section-click",
        sectionId,
      });
    }
  }

  function onContextMenu(event: MouseEvent<HTMLDivElement>) {
    if (shouldRetainNativeContextMenu(event.target, event.currentTarget)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    openWorkspaceSectionMenu(
      host,
      sectionId,
      "context-menu",
      { x: event.clientX, y: event.clientY },
      event.currentTarget,
    );
  }

  return (
    <div
      className={`${sectionShellClassName} setta-workspace-section-attention ${showAttention ? "setta-workspace-section-attention-active" : ""} ${isActiveSection ? "z-[150]" : "z-10"}`}
      onClick={getOnSectionClick(host, sectionId)}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
      role="group"
      aria-label={`${section.name} ${
        isMetaControl
          ? "meta control"
          : canOwnNestedSections
            ? "section with nested sections"
            : "section"
      }${isActiveSection ? ", selected" : ""}`}
      aria-keyshortcuts="Enter Space Shift+F10 ContextMenu"
      tabIndex={-1}
      ref={refForPosition}
      data-section-id={sectionId}
      data-section-type={section.kind}
      data-section-presentation={isMetaControl ? "meta-control" : "section"}
      data-section-active={isActiveSection ? "true" : "false"}
      data-workspace-section-shell="true"
      style={sectionShellStyle}
    >
      <SectionContainerContent
        section={section}
        hasSectionStyleTheme={hasSectionStyleTheme}
      />
      <WorkspaceGraphPorts sectionId={sectionId} />
    </div>
  );
}
