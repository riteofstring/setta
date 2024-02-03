import _ from "lodash";
import { ManyCodeInfoType } from "z_utils/types/codeInfo";

export function assembleCollectionsForSectionConfig(
  allCodeInfo: ManyCodeInfoType,
  collections
) {
  // keep only necessary keys
  const results = _.mapValues(collections, (x) =>
    _.pick(x, ["id", "name", "description", "path", "children"])
  );
  // re-assign children to be list of objects instead of list of ids
  _.forEach(results, (v) => {
    v["children"] = v["children"].map((x) =>
      _.pick(allCodeInfo[x], ["id", "name", "path"])
    );
  });
  return results;
}
