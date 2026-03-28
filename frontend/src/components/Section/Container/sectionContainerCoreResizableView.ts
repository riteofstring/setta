import { getIsRoot } from "state/actions/uiTypes/utils";
import { SectionTypeEnum, type SectionType } from "utils/generatedTypes";

type SectionContainerCoreResizableViewInput = {
  sectionTypeName: SectionType;
  textBlockMetaControlStyle: boolean;
  isUserView: boolean;
  positionAndSizeLocked: boolean;
  hideHeader: boolean;
  benchmarkActive: boolean;
  renderSectionHeader: boolean;
  renderFullSectionBody: boolean;
};

export type SectionContainerCoreResizableView = {
  isRoot: boolean;
  useMetaControlStyle: boolean;
  showMetaControlDragHandle: boolean;
  frameClassName?: string;
  layoutClassName?: string;
  headerKind:
    | "meta-control-menu"
    | "text-block-meta-control-menu"
    | "section-header"
    | "none";
  shouldRenderIncrementer: boolean;
};

export function buildSectionContainerCoreResizableView({
  sectionTypeName,
  textBlockMetaControlStyle,
  isUserView,
  positionAndSizeLocked,
  hideHeader,
  benchmarkActive,
  renderSectionHeader,
  renderFullSectionBody,
}: SectionContainerCoreResizableViewInput): SectionContainerCoreResizableView {
  const isMetaControl = sectionTypeName === SectionTypeEnum.MetaControl;
  const isRoot = getIsRoot(sectionTypeName);
  const useMetaControlStyle = isMetaControl || textBlockMetaControlStyle;
  const shouldRenderMetaMenu = isMetaControl && !isUserView;
  const shouldRenderTextBlockMetaMenu =
    textBlockMetaControlStyle && !isUserView;
  const shouldRenderHeader =
    !hideHeader && (!benchmarkActive || renderSectionHeader);

  let headerKind: SectionContainerCoreResizableView["headerKind"] = "none";
  if (isMetaControl) {
    headerKind = shouldRenderMetaMenu ? "meta-control-menu" : "none";
  } else if (textBlockMetaControlStyle) {
    headerKind = shouldRenderTextBlockMetaMenu
      ? "text-block-meta-control-menu"
      : "none";
  } else if (shouldRenderHeader) {
    headerKind = "section-header";
  }

  return {
    isRoot,
    useMetaControlStyle,
    showMetaControlDragHandle:
      useMetaControlStyle && !isUserView && !positionAndSizeLocked,
    frameClassName: useMetaControlStyle
      ? "before:!border-transparent dark:before:!border-transparent group-hover/card-section:before:!border-setta-400/60 dark:group-hover/card-section:before:!border-setta-700/60"
      : undefined,
    layoutClassName: isMetaControl ? "grid-cols-1 grid-rows-1" : undefined,
    headerKind,
    shouldRenderIncrementer: isRoot && (!benchmarkActive || renderFullSectionBody),
  };
}
