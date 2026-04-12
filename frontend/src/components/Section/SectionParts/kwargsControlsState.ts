import { deriveSectionStyleTheme } from "utils/sectionStyleColors";
import { getKwargsControlsContainerClassName } from "./kwargsControlsStyles";

type KwargsThemeStateArgs = {
  resolvedStyleColor: string | null;
  darkMode: boolean;
  isCallableSection: boolean;
};

type KwargsActionStateArgs = {
  selectedParams: Array<string>;
  edgeInputParams: Array<string>;
  pinnedParams: Array<string>;
  deletableSelectedParamIds: Array<string>;
  canEditLayout: boolean;
  canEditStructure: boolean;
  variantIsFrozen: boolean;
};

export function getKwargsControlsThemeState({
  resolvedStyleColor,
  darkMode,
  isCallableSection,
}: KwargsThemeStateArgs) {
  const hasSectionStyleTheme = Boolean(
    resolvedStyleColor
      ? deriveSectionStyleTheme(resolvedStyleColor, darkMode)
      : null,
  );

  return {
    hasSectionStyleTheme,
    controlsContainerClassName: getKwargsControlsContainerClassName({
      hasSectionStyleTheme,
      isCallableSection,
    }),
    argsLabelColorClassName: hasSectionStyleTheme
      ? "text-[color:var(--setta-section-style-muted-text)]"
      : "text-setta-600/70 dark:text-setta-400/30",
    argsIconButtonColorClassName: hasSectionStyleTheme
      ? "text-[color:var(--setta-section-style-muted-text)] hover:text-[color:var(--setta-section-style-outline)] focus-visible:ring-[var(--setta-section-style-outline)]"
      : "text-setta-500 hover:text-blue-500 dark:hover:text-blue-500",
  };
}

export function getKwargsControlsActionState({
  selectedParams,
  edgeInputParams,
  pinnedParams,
  deletableSelectedParamIds,
  canEditLayout,
  canEditStructure,
  variantIsFrozen,
}: KwargsActionStateArgs) {
  const selectedAreAllEdgeInputs =
    selectedParams.length > 0 &&
    selectedParams.every((paramId) => edgeInputParams.includes(paramId));
  const selectedHasAnyEdgeInputs = selectedParams.some((paramId) =>
    edgeInputParams.includes(paramId),
  );
  const shouldUnpinSelected =
    selectedParams.length > 0 &&
    selectedParams.every((paramId) => pinnedParams.includes(paramId));
  const canPinParams =
    selectedParams.length > 0 && !variantIsFrozen && canEditLayout;
  const canConvertToEdge =
    selectedParams.length > 0 && !variantIsFrozen && canEditStructure;
  const canDeleteSelected =
    deletableSelectedParamIds.length > 0 &&
    !variantIsFrozen &&
    canEditStructure;

  return {
    selectedAreAllEdgeInputs,
    selectedHasAnyEdgeInputs,
    shouldUnpinSelected,
    canPinParams,
    pinParamsDisabled: !canPinParams,
    pinButtonLabel: shouldUnpinSelected
      ? "Unpin selected args"
      : "Pin selected args",
    canConvertToEdge,
    convertToEdgeDisabled: !canConvertToEdge,
    deleteSelectedDisabled: !canDeleteSelected,
    ...getConvertToEdgePresentation(selectedAreAllEdgeInputs, canEditLayout),
  };
}

function getConvertToEdgePresentation(
  selectedAreAllEdgeInputs: boolean,
  canEditLayout: boolean,
) {
  if (!selectedAreAllEdgeInputs) {
    return {
      convertToEdgeAriaLabel: "Convert to edge connectors",
      convertToEdgeIconClassName: "gg-link",
      convertToEdgeTooltip: "Convert selected args to edge connectors",
    };
  }

  return {
    convertToEdgeAriaLabel: "Convert selected edge args back to params",
    convertToEdgeIconClassName: "gg-unlink",
    convertToEdgeTooltip: canEditLayout
      ? "Move selected edge args back to unpinned"
      : "Convert selected edge args back to params",
  };
}
