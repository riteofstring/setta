import { getSectionContainerHandlers } from "./sectionContainerEvents";
import { useWorkspaceSectionAttentionHighlight } from "../../attention/workspaceSectionAttention";
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
import type { WorkspaceSection } from "../../document/types";
import { useWorkspaceHost } from "../../workspaceHostContext";
import { WorkspaceGraphPorts } from "../../graph/WorkspaceGraphPorts";
import { getSectionContainerShellClassName } from "../sectionChrome";
import { useSectionRefAndInit } from "../sectionRefs";
import { deriveSectionStyleTheme } from "../sectionStyleColors";
import { resolveSectionStyleVars } from "../sectionStyleVars";
import { SectionContainerContent } from "./SectionContainerContent";

function getSectionStyleTheme(
  isMetaControl: boolean,
  styleColor: WorkspaceSection["styleColor"],
  darkMode: boolean,
): ReturnType<typeof deriveSectionStyleTheme> | null {
  if (isMetaControl || !styleColor) {
    return null;
  }
  return deriveSectionStyleTheme(styleColor, darkMode);
}

function getSectionClassName(
  shellClassName: string,
  showAttention: boolean,
  isActiveSection: boolean,
): string {
  const attentionClass = showAttention
    ? "setta-workspace-section-attention-active"
    : "";
  const zIndexClass = isActiveSection ? "z-[150]" : "z-10";
  return `${shellClassName} setta-workspace-section-attention ${attentionClass} ${zIndexClass}`;
}

function getSectionAriaLabel(
  name: string,
  isMetaControl: boolean,
  canOwnNestedSections: boolean,
  isActiveSection: boolean,
): string {
  let kind = "section";
  if (isMetaControl) {
    kind = "meta control";
  } else if (canOwnNestedSections) {
    kind = "section with nested sections";
  }
  const selection = isActiveSection ? ", selected" : "";
  return `${name} ${kind}${selection}`;
}

function getOptionalTrueAttribute(value: boolean): "true" | undefined {
  return value ? "true" : undefined;
}

function getSectionPresentation(isMetaControl: boolean): string {
  return isMetaControl ? "meta-control" : "section";
}

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

  const sectionStyleTheme = getSectionStyleTheme(
    isMetaControl,
    section.styleColor,
    darkMode,
  );
  const hasSectionStyleTheme = Boolean(sectionStyleTheme);
  const sectionShellClassName = getSectionContainerShellClassName({
    isActiveSection,
    hasSectionStyleTheme,
    positionAndSizeLocked: section.positionAndSizeLocked,
    useMetaControlStyle: isMetaControl,
  });
  const sectionShellStyle = resolveSectionStyleVars(sectionStyleTheme);
  const className = getSectionClassName(
    sectionShellClassName,
    showAttention,
    isActiveSection,
  );
  const ariaLabel = getSectionAriaLabel(
    section.name,
    isMetaControl,
    canOwnNestedSections,
    isActiveSection,
  );

  return (
    <div
      className={className}
      {...getSectionContainerHandlers(host, sectionId)}
      role="group"
      aria-label={ariaLabel}
      aria-keyshortcuts="Enter Space Shift+F10 ContextMenu"
      tabIndex={-1}
      ref={refForPosition}
      data-section-id={sectionId}
      data-section-type={section.kind}
      data-section-presentation={getSectionPresentation(isMetaControl)}
      data-section-active={String(isActiveSection)}
      data-workspace-section-shell="true"
      data-workspace-section-style-themed={getOptionalTrueAttribute(
        hasSectionStyleTheme,
      )}
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
