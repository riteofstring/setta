import { useSectionInfos } from "state/definitions";
import { maybeRunGuiToYaml } from "./guiToYaml";
import { getSectionInfo } from "./sectionInfos";

export function onMouseOverSetPreviewVariantId(sectionId, id) {
  let selectedVariantId;
  useSectionInfos.setState((state) => {
    selectedVariantId = state.x[sectionId].variantId;
    state.x[sectionId].previewVariantId = id;
  });
  if (selectedVariantId !== id) {
    const { displayMode } = getSectionInfo(sectionId);
    maybeRunGuiToYaml(sectionId, id, displayMode);
  }
}

export function onMouseLeaveSetPreviewVariantId(sectionId) {
  useSectionInfos.setState((state) => {
    state.x[sectionId].previewVariantId = null;
  });
  // don't call gui to yaml because either we already switched to a new variant
  // so it was called at that point
  // or we haven't switched variants, and we don't want to overwrite
  // the current "in-progress" yaml with information that's outdated.
}

export function onClickSetVariantId(sectionId, id) {
  let selectedVariantId;
  useSectionInfos.setState((state) => {
    selectedVariantId = state.x[sectionId].variantId;
    state.x[sectionId].variantId = id;
  });
  if (selectedVariantId !== id) {
    const { displayMode } = getSectionInfo(sectionId);
    maybeRunGuiToYaml(sectionId, id, displayMode);
  }
}
