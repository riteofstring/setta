import { useCodeInfoCols } from "state/definitions";
import { getSectionCodeInfoColId } from "./sectionVariants";

export function setAllCodeInfoCols(x) {
  useCodeInfoCols.setState({ x });
}

export function getCodeInfoChildren(sectionId) {
  console.log(
    "getSectionCodeInfoColId(sectionId)",
    getSectionCodeInfoColId(sectionId),
  );
  console.log("useCodeInfoCols.getState().x", useCodeInfoCols.getState().x);
  return useCodeInfoCols.getState().x[getSectionCodeInfoColId(sectionId)][
    "children"
  ];
}
