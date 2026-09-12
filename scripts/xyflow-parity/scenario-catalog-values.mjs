export const DESKTOP_VIEWPORT = Object.freeze({ height: 696, width: 1_492 });
export const COMPACT_VIEWPORT = Object.freeze({ height: 364, width: 630 });
export const WIDE_VIEWPORT = Object.freeze({ height: 720, width: 3_440 });
export const TALL_WIDE_VIEWPORT = Object.freeze({
  height: 1_200,
  width: 3_440,
});

export function sectionSelector(sectionId) {
  return `[data-section-id="${sectionId}"]`;
}
