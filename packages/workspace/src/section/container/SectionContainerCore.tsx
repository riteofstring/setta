import type { CSSProperties, KeyboardEvent } from "react";
import { applyActiveSectionChange } from "../../canvas/activeSectionController";
import { useViewportInteractionActive } from "../../canvas/useViewportInteractionActive";
import { getSectionOrThrow } from "../../document/documentSelectors";
import { getMetaControlPresentation } from "../../document/sectionKindRegistry";
import {
  useActiveSections,
  useWorkspaceAppearance,
  useWorkspaceDocument,
} from "../../document/stores";
import { getSectionContainerShellClassName } from "../sectionChrome";
import { getOnSectionClick } from "../sectionClick";
import { useSectionRefAndInit } from "../sectionRefs";
import { deriveSectionStyleTheme } from "../sectionStyleColors";
import { resolveSectionStyleVars } from "../sectionStyleVars";
import { SectionContainerContent } from "./SectionContainerContent";

// The reference's `SectionContainerCore`: the leaf section shell. Selection is outline-only on
// an absolutely positioned overlay, so neither selection nor border presence shifts layout, and
// the shell hoists itself onto the compositor while the viewport is panning or zooming. The
// edge-handle layers, AI/agentic highlights, and style-color previews remain excluded; the
// direct-on-canvas milestone restores the reference's transparent shell branch. The reference
// renders the shell as a `<section>`; the repository's accessibility gate forbids interactive
// roles on sections, so the package renders a visually identical `<div>`.
export function SectionContainerCore({ sectionId }: { sectionId: string }) {
  const section = useWorkspaceDocument((x) => getSectionOrThrow(x, sectionId));
  const isActiveSection = useActiveSections((x) => x.activeIds.includes(sectionId));
  const darkMode = useWorkspaceAppearance((x) => x.darkMode);
  const viewportInteractionActive = useViewportInteractionActive();
  const refForPosition = useSectionRefAndInit(sectionId, "selfOnly");
  const isMetaControl = getMetaControlPresentation(section) !== null;

  // Frozen main suppresses authored section-style colors for the transparent meta presentation.
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
  const sectionShellStyle = getSectionShellStyle(
    resolveSectionStyleVars(sectionStyleTheme),
    viewportInteractionActive,
  );

  // The reference activates sections through its app-level shortcut engine; the package keeps
  // keyboard activation on the shell itself for the repository's accessibility gate. A group
  // role preserves the semantics of the interactive header and body descendants.
  function onKeyDown(event: KeyboardEvent) {
    if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      event.stopPropagation();
      applyActiveSectionChange({ interaction: "section-click", sectionId });
    }
  }

  // This surface owns pointer and programmatic-focus activation without hiding its real controls.
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className={`${sectionShellClassName} ${isActiveSection ? "z-[150]" : "z-10"}`}
      onClick={getOnSectionClick(sectionId)}
      onKeyDown={onKeyDown}
      role="group"
      aria-label={`${section.name} ${isMetaControl ? "meta control" : "section"}${isActiveSection ? ", selected" : ""}`}
      aria-keyshortcuts="Enter Space"
      tabIndex={-1} // keeps section focusable for programmatic focus
      ref={refForPosition}
      data-section-id={sectionId}
      data-section-type={section.kind}
      data-section-presentation={isMetaControl ? "meta-control" : "section"}
      data-section-active={isActiveSection ? "true" : "false"}
      style={sectionShellStyle}
    >
      <SectionContainerContent section={section} hasSectionStyleTheme={hasSectionStyleTheme} />
    </div>
  );
}

function getSectionShellStyle(
  sectionStyleVars: CSSProperties | undefined,
  viewportInteractionActive: boolean,
): CSSProperties | undefined {
  if (!viewportInteractionActive) {
    return sectionStyleVars;
  }
  return {
    ...sectionStyleVars,
    willChange: "transform",
    transform: "translateZ(0)",
    backfaceVisibility: "hidden",
    isolation: "isolate",
  } satisfies CSSProperties;
}
