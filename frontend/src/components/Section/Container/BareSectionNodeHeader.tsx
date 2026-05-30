import { useIsSectionUIActive } from "state/activeSectionUI";
import { useProjectState } from "state/definitions";
import { useIsListElement } from "state/hooks/uiTypes";
import { type SectionType } from "utils/generatedTypes";
import { HeaderIcon } from "../Header/HeaderIcon";

type BareSectionNodeHeaderProps = {
  sectionId: string;
  sectionTypeName: SectionType;
  isInOtherProjectConfigs: boolean;
  hasSectionStyleTheme: boolean;
};

function getTitleClassName({
  hasSectionStyleTheme,
  isActiveSection,
  isInOtherProjectConfigs,
}: {
  hasSectionStyleTheme: boolean;
  isActiveSection: boolean;
  isInOtherProjectConfigs: boolean;
}) {
  if (hasSectionStyleTheme) {
    return "text-[color:var(--setta-section-style-text)]";
  }
  if (isInOtherProjectConfigs) {
    return isActiveSection
      ? "text-purple-800 dark:text-purple-200"
      : "text-purple-700 dark:text-purple-300";
  }
  return isActiveSection
    ? "text-blue-600 dark:text-blue-400"
    : "text-setta-700 dark:text-setta-300";
}

export function BareSectionNodeHeader({
  sectionId,
  sectionTypeName,
  isInOtherProjectConfigs,
  hasSectionStyleTheme,
}: BareSectionNodeHeaderProps) {
  const sectionName = useProjectState(
    (state) => state.sections[sectionId]?.name ?? "",
  );
  const isActiveSection = useIsSectionUIActive(sectionId);
  const isListElement = useIsListElement(sectionId);
  const titleClassName = getTitleClassName({
    hasSectionStyleTheme,
    isActiveSection,
    isInOtherProjectConfigs,
  });

  return (
    <header
      className="section-title mx-2 flex min-w-0 items-center gap-2 py-1.5"
      data-testid="bare-section-node-header"
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-base">
        <HeaderIcon
          sectionId={sectionId}
          sectionTypeName={sectionTypeName}
          isInOtherProjectConfigs={isInOtherProjectConfigs}
          isListElement={isListElement}
          hasSectionStyleTheme={hasSectionStyleTheme}
        />
      </span>
      <h2
        className={`min-w-0 truncate text-xs font-bold leading-5 ${titleClassName}`}
        title={sectionName}
      >
        {sectionName}
      </h2>
    </header>
  );
}
