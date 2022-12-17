import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";

export async function noAuthGetCollectionsAndModules({
  searchTerm,
  searchCollectionsInMemory,
}) {
  let results = searchCollectionsInMemory({ searchTerm });

  // keep only necessary keys
  results = _.mapValues(results, (x) =>
    _.pick(x, ["id", "name", "description", "path", "children"])
  );

  const allCodeInfo = useCodeInfo.getState().allCodeInfo;
  // re-assign children to be list of objects instead of list of ids
  _.forEach(results, (v) => {
    v["children"] = v["children"].map((x) =>
      _.pick(allCodeInfo[x], ["id", "name", "path"])
    );
  });
  return results;
}

export async function noAuthGetCollectionDetails() {
  return {};
}
