import { insertIntoArrayOrPrepend } from "../../../../utils/utils";
import _ from "lodash";
import { SectionInfo } from "../../../../classes/jsonParser";
import { createNewId } from "../../../../utils/sectionIds"

export function funcFlipChildrenAreCollapsed(
  childrenAreCollapsed,
  setChildrenAreCollapsed
) {
  function flipChildrenAreCollapsed() {
    setChildrenAreCollapsed(!childrenAreCollapsed);
  }
  return flipChildrenAreCollapsed;
}
