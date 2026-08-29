import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { getSectionOrThrow } from "../document/documentSelectors";
import { getRegisteredSectionKindOrThrow } from "../document/sectionKindRegistry";
import {
  useWorkspaceAppearance,
  useWorkspaceDocument,
} from "../document/stores";
import {
  getSectionContainerShellClassName,
  getSectionSurfaceClassName,
} from "../section/sectionChrome";
import { DEFAULT_SECTION_BG_COLOR } from "../section/sectionColors";
import { deriveSectionStyleTheme } from "../section/sectionStyleColors";
import { resolveSectionStyleVars } from "../section/sectionStyleVars";
import { WorkspaceSectionBodyContent } from "../section/container/SectionContainerContent";
import { SectionHeader } from "../section/header/SectionHeader";
import { useWorkspaceHost } from "../workspaceHostContext";

export type WorkspaceSectionWindowSurfaceProps = {
  sectionId: string;
  /** Window placement owns these controls; canvas-only controls stay hidden. */
  headerActions?: ReactNode;
  /** Forwards controlled drag and other native header behavior to the section header. */
  headerProps?: Omit<ComponentPropsWithoutRef<"header">, "children" | "ref"> & {
    "data-testid"?: string;
  };
};

/**
 * A section's normal registered presentation for an external window or dock.
 * It shares the live body and header composition without mounting canvas-only
 * resizers, refs, DnD wrappers, or XYFlow shells.
 */
export function WorkspaceSectionWindowSurface({
  headerActions = null,
  headerProps,
  sectionId,
}: WorkspaceSectionWindowSurfaceProps) {
  const host = useWorkspaceHost();
  const section = useWorkspaceDocument((state) =>
    getSectionOrThrow(state, sectionId),
  );
  const darkMode = useWorkspaceAppearance((state) => state.darkMode);
  const definition = getRegisteredSectionKindOrThrow(host, section.kind);
  const isMetaControl = definition.presentation?.type === "meta-control";
  const sectionStyleTheme =
    !isMetaControl && section.styleColor
      ? deriveSectionStyleTheme(section.styleColor, darkMode)
      : null;
  const hasSectionStyleTheme = sectionStyleTheme !== null;
  const bgColor = isMetaControl ? "bg-transparent" : DEFAULT_SECTION_BG_COLOR;
  const outerShellClassName = [
    getSectionContainerShellClassName({
      hasSectionStyleTheme,
      isActiveSection: false,
      positionAndSizeLocked: section.positionAndSizeLocked,
      useMetaControlStyle: isMetaControl,
    }),
    "h-full !w-full [&:active]:outline-transparent",
  ].join(" ");
  const innerShellClassName = getSectionSurfaceClassName({
    bgColor,
    hasSectionStyleTheme,
    positionAndSizeLocked: section.positionAndSizeLocked,
  });

  return (
    <section
      className={outerShellClassName}
      data-section-id={sectionId}
      data-section-type={section.kind}
      data-testid="section-window-surface"
      data-workspace-section-window-surface="true"
      style={resolveSectionStyleVars(sectionStyleTheme)}
    >
      <div className={innerShellClassName}>
        <SectionHeader
          extraControls={headerActions}
          hasSectionStyleTheme={hasSectionStyleTheme}
          headerProps={headerProps}
          sectionId={sectionId}
          showSectionContainerControls={false}
        />
        <div
          className={`section-main-full-w flex min-h-0 flex-1 flex-col overflow-hidden ${bgColor}`}
        >
          <WorkspaceSectionBodyContent
            definition={definition}
            hasSectionStyleTheme={hasSectionStyleTheme}
            section={section}
          />
        </div>
      </div>
    </section>
  );
}
