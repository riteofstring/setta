import { NULL_OBJ_ID } from "abcde-utils/src/constants";
import { findAllDescendants } from "abcde-utils/src/getDescendants";
import _ from "lodash";

export function loadCodeInfoForProject(allCodeInfo, sections, uiTypes) {
  const allCollectionIds: string[] = [NULL_OBJ_ID];
  for (const u of Object.values(uiTypes) as Array<any>) {
    if ("collections" in u.config) {
      allCollectionIds.push(...u.config.collections);
    }
  }
  for (const s of Object.values(sections) as Array<any>) {
    if (s["userSpecifiedObjectId"]) {
      allCollectionIds.push(s["userSpecifiedObjectId"]);
    }
  }
  const output = findAllDescendants(allCodeInfo, allCollectionIds);
  return _.keyBy(output, "id");
}
