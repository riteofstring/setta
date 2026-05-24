import { useLocalStorage, useTemporaryMiscState } from "state/definitions";
import { getSectionStylePreviewColorKey } from "utils/constants";
import { deriveSectionStyleTheme } from "utils/sectionStyleColors";

export function useHasSectionStyleTheme(
  sectionId: string,
  styleColor: string | null,
) {
  const darkMode = useLocalStorage((x) => x.darkMode);
  const styleColorPreviewKey = getSectionStylePreviewColorKey(sectionId);
  const previewStyleColor = useTemporaryMiscState(
    (x) => x[styleColorPreviewKey] as string | null | undefined,
  );
  const resolvedStyleColor =
    previewStyleColor === undefined ? styleColor : previewStyleColor;
  return Boolean(
    resolvedStyleColor && deriveSectionStyleTheme(resolvedStyleColor, darkMode),
  );
}

export function resolveThemeClassName(
  hasSectionStyleTheme: boolean,
  themedClassName: string,
  fallbackClassName: string,
) {
  return hasSectionStyleTheme ? themedClassName : fallbackClassName;
}
