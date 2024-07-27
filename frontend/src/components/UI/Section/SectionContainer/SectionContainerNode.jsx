import { useNodeInternals } from "state/definitions/nodeInternals";
import { SectionContainer } from "./SectionContainer";

export function SectionContainerNode({ id }) {
  // In SectionPane, topLevelSectionPositions doesn't update fast enough.
  // So we have to double check here if id actually exists in the state.
  // For example, id might have been deleted, but topLevelSectionPositions hasn't yet updated.
  const sectionIsTopLevel = useNodeInternals((x) => x.x.has(id));
  return sectionIsTopLevel && <SectionContainer sectionId={id} />;
}
