export {
  getSectionChildren,
  getSectionIsHorizontalOrientation,
  getSectionType,
  isBaseCodeSectionType,
} from "./sectionStructureQueries";
export {
  getAttachedTerminalParentIdForTerminalSection,
  getEmbeddedAttachedTerminalForCodeSection,
  getEmbeddedAttachedTerminalParentIdForTerminalSection,
} from "./sectionTerminalAttachmentQueries";
export type { EmbeddedAttachedTerminalInfo } from "./sectionTerminalAttachmentQueries";
