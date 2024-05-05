import _ from "lodash";
import { useKeywordRegex } from "models/info/keywordRegex";

export function roundUpIdx(numList, x) {
  let closest = undefined;

  // Loop through each number in the list
  for (let num of numList) {
    if (num >= x) {
      // Check if the number is larger than x
      // If closest is not set or current number is closer to x than the current closest
      if (closest === undefined || num - x < closest - x) {
        closest = num;
      }
    }
  }

  return closest;
}

export function computeEVReferences(project) {
  const evCols = project["evCols"];
  const evRefs = {};
  const { pattern: keywordRegex, fullNameToInfo } = useKeywordRegex.getState();
  for (const [dbSource, colsInSource] of Object.entries(evCols)) {
    evRefs[dbSource] = {};
    for (const [evColId, evColInfo] of Object.entries(colsInSource)) {
      evRefs[dbSource][evColId] = { name: evColInfo.name, values: {} };
      for (const [codeInfoId, value] of Object.entries(evColInfo.values)) {
        evRefs[dbSource][evColId].values[codeInfoId] = findRefs(
          keywordRegex,
          fullNameToInfo,
          value,
        );
      }
    }
  }
  project["evRefs"] = evRefs;
}

function findRefs(keywordRegex, fullNameToInfo, value) {
  let match;
  const output = [];
  while ((match = keywordRegex.exec(value))) {
    output.push(_.pick(fullNameToInfo[match[0]], ["sectionId", "paramInfoId"]));
  }
  return output;
}
