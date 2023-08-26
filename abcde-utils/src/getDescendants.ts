import _ from "lodash";

function findAllChildren(allCodeInfo, collectionIds, condition = null) {
  return _.flatten(collectionIds.map((x) => allCodeInfo[x].children));
}
