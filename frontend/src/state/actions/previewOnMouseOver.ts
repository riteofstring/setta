import { useProjectState } from "state/definitions";
import { maybeRunGuiToYaml } from "./guiToYaml";

export function onMouseEnterSetPreviewVariantId(sectionId, id) {
  let selectedVariantId;
  useProjectState.setState((state) => {
    selectedVariantId = state.sections[sectionId].variantId;
    state.sections[sectionId].previewVariantId = id;
  });
  if (selectedVariantId !== id) {
    maybeRunGuiToYaml(sectionId, id);
  }
}

export function onMouseLeaveSetPreviewVariantId(sectionId) {
  useProjectState.setState((state) => {
    state.sections[sectionId].previewVariantId = null;
  });
  // don't call gui to yaml because either we already switched to a new variant
  // so it was called at that point
  // or we haven't switched variants, and we don't want to overwrite
  // the current "in-progress" yaml with information that's outdated.
}
