import { useCodeInfoCols } from "state/definitions";
import { useSectionCodeInfoColId } from "./sectionVariants";

export function useCodeInfoChildren(sectionId) {
  const codeInfoColId = useSectionCodeInfoColId(sectionId);
  return useCodeInfoCols((x) => x.x[codeInfoColId]["children"]);
}
