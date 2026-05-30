import type { SectionContentSurface } from "components/Section/sectionContentSurface";
import { SectionTypeEnum } from "utils/generatedTypes";

function getPinnedParamsBgClassName(sectionTypeName: SectionTypeEnum) {
  if (sectionTypeName === SectionTypeEnum.Callable) {
    return "bg-white dark:bg-blue-950/30";
  }
  if (sectionTypeName === SectionTypeEnum.GlobalVariables) {
    return "bg-setta-50 dark:bg-blue-950/30";
  }
  return "bg-setta-100/50 dark:bg-blue-950/30";
}

export function getPinnedParamsSurfaceClassNames({
  contentSurface,
  hasSectionStyleTheme,
  positionAndSizeLocked,
  sectionTypeName,
  shouldRoundBottom,
}: {
  contentSurface: SectionContentSurface;
  hasSectionStyleTheme: boolean;
  positionAndSizeLocked: boolean;
  sectionTypeName: SectionTypeEnum;
  shouldRoundBottom: boolean;
}) {
  const usesPaneSurface = contentSurface === "pane";
  const pinnedBgClassName = usesPaneSurface
    ? "bg-transparent"
    : hasSectionStyleTheme
      ? "bg-[color:var(--setta-section-style-panel-bg)]"
      : getPinnedParamsBgClassName(sectionTypeName);
  const roundedBottomClassName =
    !usesPaneSurface && shouldRoundBottom
      ? positionAndSizeLocked
        ? "rounded-b-sm"
        : "rounded-b-xl"
      : "";
  return {
    pinnedBgClassName,
    pinnedShadowClassName: usesPaneSurface ? "" : "shadow-sm",
    roundedBottomClassName,
  };
}
