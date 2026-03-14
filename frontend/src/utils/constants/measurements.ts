const EDGES_STRIP_HEIGHT_KEY_PREFIX = "edges-strip-height";
const KWARGS_CONTROLS_HEIGHT_KEY_PREFIX = "kwargs-controls-height";
const PINNED_PARAMS_AREA_HEIGHT_KEY_PREFIX = "pinned-params-area-height";
const UNPINNED_PARAMS_AREA_HEIGHT_KEY_PREFIX = "unpinned-params-area-height";
const PARAMS_FIXED_HEIGHT_KEY_PREFIX = "params-fixed-height";
const SECTION_HEADER_HEIGHT_KEY_PREFIX = "section-header-height";
const SECTION_SEARCH_HEIGHT_KEY_PREFIX = "section-search-height";
const SECTION_STYLE_PREVIEW_COLOR_KEY_PREFIX = "section-style-preview-color";

export function getEdgesStripHeightKey(sectionId: string): string {
  return `${EDGES_STRIP_HEIGHT_KEY_PREFIX}-${sectionId}`;
}

export function getKwargsControlsHeightKey(sectionId: string): string {
  return `${KWARGS_CONTROLS_HEIGHT_KEY_PREFIX}-${sectionId}`;
}

export function getPinnedParamsAreaHeightKey(sectionId: string): string {
  return `${PINNED_PARAMS_AREA_HEIGHT_KEY_PREFIX}-${sectionId}`;
}

export function getUnpinnedParamsAreaHeightKey(sectionId: string): string {
  return `${UNPINNED_PARAMS_AREA_HEIGHT_KEY_PREFIX}-${sectionId}`;
}

export function getParamsFixedHeightKey(sectionId: string): string {
  return `${PARAMS_FIXED_HEIGHT_KEY_PREFIX}-${sectionId}`;
}

export function getSectionHeaderHeightKey(sectionId: string): string {
  return `${SECTION_HEADER_HEIGHT_KEY_PREFIX}-${sectionId}`;
}

export function getSectionSearchHeightKey(sectionId: string): string {
  return `${SECTION_SEARCH_HEIGHT_KEY_PREFIX}-${sectionId}`;
}

export function getSectionStylePreviewColorKey(sectionId: string): string {
  return `${SECTION_STYLE_PREVIEW_COLOR_KEY_PREFIX}-${sectionId}`;
}
