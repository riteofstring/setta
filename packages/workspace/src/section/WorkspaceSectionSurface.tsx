import type { ComponentPropsWithoutRef, ReactNode } from "react";
import {
  getSectionOrThrow,
  isGroupSection,
} from "../document/documentSelectors";
import {
  canWorkspaceSectionOwnNestedSections,
  getRegisteredSectionKindOrThrow,
  type SectionKindDefinition,
} from "../document/sectionKindRegistry";
import {
  useWorkspaceAppearance,
  useWorkspaceDocument,
} from "../document/stores";
import type { WorkspaceSection } from "../document/types";
import type { WorkspaceHost } from "../workspaceHost";
import { useWorkspaceHost } from "../workspaceHostContext";
import {
  getSectionContainerShellClassName,
  getSectionSurfaceClassName,
} from "./sectionChrome";
import { DEFAULT_SECTION_BG_COLOR } from "./sectionColors";
import { deriveSectionStyleTheme } from "./sectionStyleColors";
import { resolveSectionStyleVars } from "./sectionStyleVars";
import { MaybeManyNestedSections } from "./container/ManyNestedSections";
import { renderNestedSectionContainer } from "./container/SectionContainer";
import { WorkspaceSectionBodyContent } from "./container/SectionContainerContent";
import { SectionHeader } from "./header/SectionHeader";

type WorkspaceSectionSurfaceHeaderProps = Omit<
  ComponentPropsWithoutRef<"header">,
  "children" | "ref"
> & {
  "data-testid"?: string;
};

type WorkspaceSectionSurfaceProps = {
  sectionId: string;

  className?: string;
  dataTestId?: string;
  headerActions?: ReactNode;
  headerProps?: WorkspaceSectionSurfaceHeaderProps;
  includeDescendants?: boolean;
};

function joinClassNames(
  ...classNames: ReadonlyArray<string | undefined>
): string {
  return classNames.filter(Boolean).join(" ");
}

function getWorkspaceSectionSurfaceDefinition({
  host,
  isGroup,
  sectionKind,
}: {
  host: WorkspaceHost;
  isGroup: boolean;
  sectionKind: string;
}): SectionKindDefinition | null {
  if (isGroup) {
    return null;
  }
  return getRegisteredSectionKindOrThrow(host, sectionKind);
}

function getWorkspaceSectionSurfaceAppearance({
  darkMode,
  definition,
  section,
}: {
  darkMode: boolean;
  definition: SectionKindDefinition | null;
  section: WorkspaceSection;
}) {
  const isMetaControl = definition?.presentation?.type === "meta-control";
  const sectionStyleTheme =
    !isMetaControl && section.styleColor
      ? deriveSectionStyleTheme(section.styleColor, darkMode)
      : null;
  return {
    bgColor: isMetaControl ? "bg-transparent" : DEFAULT_SECTION_BG_COLOR,
    hasSectionStyleTheme: sectionStyleTheme !== null,
    isMetaControl,
    sectionStyleTheme,
  };
}

export function WorkspaceSectionSurface({
  className,
  dataTestId,
  headerActions = null,
  headerProps,
  includeDescendants = false,
  sectionId,
}: WorkspaceSectionSurfaceProps) {
  const host = useWorkspaceHost();
  const section = useWorkspaceDocument((state) =>
    getSectionOrThrow(state, sectionId),
  );
  const darkMode = useWorkspaceAppearance((state) => state.darkMode);
  const isGroup = isGroupSection(section);
  const definition = getWorkspaceSectionSurfaceDefinition({
    host,
    isGroup,
    sectionKind: section.kind,
  });
  const canOwnNestedSections = canWorkspaceSectionOwnNestedSections(
    host,
    section,
  );
  const { bgColor, hasSectionStyleTheme, isMetaControl, sectionStyleTheme } =
    getWorkspaceSectionSurfaceAppearance({ darkMode, definition, section });

  if (isGroup && !includeDescendants) {
    throw new Error("Group section surfaces require descendant rendering.");
  }

  const outerShellClassName = joinClassNames(
    getSectionContainerShellClassName({
      hasSectionStyleTheme,
      isActiveSection: false,
      positionAndSizeLocked: section.positionAndSizeLocked,
      useMetaControlStyle: isMetaControl,
    }),
    "h-full !w-full [&:active]:outline-transparent",
    className,
  );
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
      data-testid={dataTestId}
      data-workspace-section-surface="true"
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
          <WorkspaceSectionSurfaceMain
            canOwnNestedSections={canOwnNestedSections}
            definition={definition}
            hasSectionStyleTheme={hasSectionStyleTheme}
            includeDescendants={includeDescendants}
            isGroup={isGroup}
            section={section}
          />
        </div>
      </div>
    </section>
  );
}

function WorkspaceSectionSurfaceMain({
  canOwnNestedSections,
  definition,
  hasSectionStyleTheme,
  includeDescendants,
  isGroup,
  section,
}: {
  canOwnNestedSections: boolean;
  definition: SectionKindDefinition | null;
  hasSectionStyleTheme: boolean;
  includeDescendants: boolean;
  isGroup: boolean;
  section: WorkspaceSection;
}) {
  if (isGroup) {
    return (
      <div className="min-h-0 flex-1 overflow-auto">
        <MaybeManyNestedSections
          isGroup
          renderSection={renderNestedSectionContainer}
          sectionId={section.id}
        />
      </div>
    );
  }
  if (!definition) {
    throw new Error(`Section ${section.id} has no registered kind definition.`);
  }
  return (
    <>
      <WorkspaceSectionBodyContent
        definition={definition}
        hasSectionStyleTheme={hasSectionStyleTheme}
        section={section}
      />
      {includeDescendants && canOwnNestedSections ? (
        <div className="min-h-0 overflow-auto">
          <MaybeManyNestedSections
            isGroup={false}
            renderSection={renderNestedSectionContainer}
            sectionId={section.id}
          />
        </div>
      ) : null}
    </>
  );
}
