// Provisional Phase 1 surface. The ratified public API is a post-parity decision; these exports
// exist so the playground can render the extracted chrome, and they may change freely.
export {
  getSectionContainerShellClassName,
  getSectionSurfaceClassName,
} from "./section/sectionChrome";
export { DEFAULT_SECTION_BG_COLOR } from "./section/sectionColors";
export { deriveSectionStyleTheme } from "./section/sectionStyleColors";
export { resolveSectionStyleVars } from "./section/sectionStyleVars";
export type { SectionStyleVars } from "./section/sectionStyleVars";
