import { useCodeInfoCols } from "state/definitions";
import { getSectionCodeInfoColId } from "./sectionVariants";

export function setAllCodeInfoCols(x) {
  useCodeInfoCols.setState({ x });
}

export function getCodeInfoChildren(sectionId) {
  return useCodeInfoCols.getState().x[getSectionCodeInfoColId(sectionId)][
    "children"
  ];
}
