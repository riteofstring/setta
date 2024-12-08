import { useSectionInfos } from "state/definitions";
import { maybeRunGuiToYaml } from "./guiToYaml";

export function onMouseOverSetPreviewVariantId(sectionId, id) {
  useSectionInfos.setState((state) => {
    state.x[sectionId].previewVariantId = id;
  });
  maybeRunGuiToYaml(sectionId);
}

export function onMouseLeaveSetPreviewVariantId(sectionId) {
  useSectionInfos.setState((state) => {
    state.x[sectionId].previewVariantId = null;
  });
  maybeRunGuiToYaml(sectionId);
}

export function onClickSetVariantId(sectionId, id) {
  useSectionInfos.setState((state) => {
    state.x[sectionId].variantId = id;
  });
  maybeRunGuiToYaml(sectionId);
}
