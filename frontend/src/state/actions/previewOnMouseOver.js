import { maybeRunGuiToYaml } from "./guiToYaml";
import { setSectionInfoAttr } from "./sections/sectionInfos";

export function onMouseOverSetPreviewVariantId(sectionId, id) {
  setSectionInfoAttr({ sectionId, attr: "previewVariantId", value: id });
  maybeRunGuiToYaml(sectionId);
}

export function onMouseLeaveSetPreviewVariantId(sectionId) {
  setSectionInfoAttr({ sectionId, attr: "previewVariantId", value: null });
  maybeRunGuiToYaml(sectionId);
}

export function onClickSetVariantId(sectionId, id) {
  setSectionInfoAttr({ sectionId, attr: "variantId", value: id });
  maybeRunGuiToYaml(sectionId);
}
