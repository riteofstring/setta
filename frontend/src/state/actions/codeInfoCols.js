import { useCodeInfoCols } from "state/definitions";
import { createNewId } from "utils/idNameCreation";
import { getSectionCodeInfoColId } from "./sectionVariants";

export function setAllCodeInfoCols(x) {
  useCodeInfoCols.setState({ x });
}

export function getCodeInfoChildren(sectionId) {
  return useCodeInfoCols.getState().x[getSectionCodeInfoColId(sectionId)][
    "children"
  ];
}

export function initManyCodeInfoCols(sectionIds) {
  const sectionIdToCodeInfoColId = {};
  useCodeInfoCols.setState((x) => {
    sectionIds.forEach((s) => {
      const id = createNewId();
      x.x[id] = { id, children: { null: [] } };
      sectionIdToCodeInfoColId[s] = id;
    });
  });
  return sectionIdToCodeInfoColId;
}
