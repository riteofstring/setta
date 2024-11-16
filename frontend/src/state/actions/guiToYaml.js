import C from "constants/constants.json";
import _ from "lodash";
import { dbSectionToDict } from "requests/guiToYaml";
import {
  addCodeInfoBatch,
  batchUpdateCodeInfoAttrs,
  batchUpdateCodeInfoChildren,
} from "state/actions/codeInfo";
import { initializeParam } from "state/actions/initializeParam";
import { getParamIdsToShowInArea } from "state/actions/sections/sectionContents";
import {
  getSectionSelectedItem,
  setParamEnteredValueBatch,
} from "state/actions/sectionVariants";
import { useCodeInfo, useSectionInfos } from "state/definitions";
import { getSectionInfo } from "state/getters/sectionInfo";
import { createNewParamId } from "utils/idNameCreation";
import { newCodeInfo } from "utils/objs/codeInfo";
import { parseAllDocuments, stringify } from "yaml";

export async function guiToYaml(sectionId, setYamlValue, setOriginalObj) {
  const selectedItem = getSectionSelectedItem(sectionId);
  const selectedItemName = selectedItem
    ? useCodeInfo.getState().x[selectedItem].name
    : null;
  const pinnedIds = getParamIdsToShowInArea(sectionId, true);
  const unpinnedIds = getParamIdsToShowInArea(sectionId, false);

  const res = await dbSectionToDict(sectionId, pinnedIds, unpinnedIds);
  if (res.status === 200) {
    const fullOriginalObj = processObject(res.data);
    setOriginalObj(_.pick(fullOriginalObj, ["pinned", "unpinned"]));
    const pinnedStr = stringify(fullOriginalObj.prettyPinned);
    const unpinnedStr = stringify(fullOriginalObj.prettyUnpinned);

    let newYamlValue = "";
    if (!_.isNil(selectedItemName)) {
      newYamlValue += `${selectedItemName}\n---\n`;
    }
    if (_.size(fullOriginalObj.prettyPinned) > 0) {
      newYamlValue += `${pinnedStr}\n---\n`;
    } else if (newYamlValue !== "") {
      newYamlValue += "\n---\n";
    }
    if (_.size(fullOriginalObj.prettyUnpinned) > 0) {
      newYamlValue += unpinnedStr;
    }
    setYamlValue(newYamlValue);
  }
}

function processValue(value) {
  if (typeof value === "string") {
    if (value === "") {
      return value;
    } else if (value === "true") {
      return true; // Convert string "true" to boolean true
    } else if (value === "false") {
      return false; // Convert string "false" to boolean false
    } else if (!isNaN(value)) {
      return Number(value); // Convert numeric strings to numbers
    } else {
      return value; // Keep the string as is
    }
  } else if (Array.isArray(value)) {
    // Recursively process each element in the array
    return value.map(processValue);
  } else if (typeof value === "object" && value !== null) {
    // Recursively process nested objects
    return processObject(value);
  } else {
    return value; // Return the value as is for other data types
  }
}

function processObject(obj) {
  const result = {};
  for (const key of Object.keys(obj)) {
    result[key] = processValue(obj[key]);
  }
  return result;
}

export function yamlToGUI(sectionId, yamlValue, originalObj) {
  const docs = parseAllDocuments(yamlValue);
  console.log("docs", docs);
  let selectedItemName = null;
  let pinned = {};
  let unpinned = {};
  if (docs.length === 3) {
    selectedItemName = docs[0].toJS();
    pinned = docs[1].toJS();
    unpinned = docs[2].toJS();
  } else if (docs.length === 2) {
    pinned = docs[0].toJS();
    unpinned = docs[1].toJS();
  } else {
    unpinned = docs[0]?.toJS();
  }
  pinned = pinned ?? {};
  unpinned = unpinned ?? {};

  const fOriginalObj = mergePinnedAndUnpinned(
    flattenObject(originalObj.pinned),
    flattenObject(originalObj.unpinned),
  );
  const fNewObj = mergePinnedAndUnpinned(
    flattenObject(pinned, true),
    flattenObject(unpinned, true),
  );

  const output = [];
  const usedOriginalIds = new Set();
  const usedPaths = new Set();

  // match by key
  for (const v of fOriginalObj) {
    if (usedOriginalIds.has(v.id)) {
      continue;
    }
    let matches = fNewObj.filter(
      (x) => x.key === v.key && !usedPaths.has(JSON.stringify(x.keyPath)),
    );
    if (matches.length > 0) {
      sortPathsBySimilarity(matches, v.keyPath);
      updateOutputs({ v, matches, usedOriginalIds, usedPaths, output });
    }
  }

  // match by value
  // maybe this can be improved, like match by value + number of children
  for (const v of fOriginalObj) {
    if (usedOriginalIds.has(v.id)) {
      continue;
    }
    let matches = fNewObj.filter(
      (x) => x.value === v.value && !usedPaths.has(JSON.stringify(x.keyPath)),
    );
    if (matches.length > 0) {
      sortPathsBySimilarity(matches, v.keyPath);
      updateOutputs({ v, matches, usedOriginalIds, usedPaths, output });
    }
  }

  const { jsonSource } = useSectionInfos.getState().x[sectionId];
  // add remaining new entries
  for (const v of fNewObj) {
    if (usedPaths.has(JSON.stringify(v.keyPath))) {
      continue;
    }
    const curr = _.pick(v, ["key", "keyPath", "value", "isPinned"]);
    curr.id = createNewParamId(curr.keyPath, jsonSource);
    curr.isNewParam = true;
    output.push(curr);
  }

  const keyPathToIndex = {};
  for (const [idx, v] of fNewObj.entries()) {
    keyPathToIndex[JSON.stringify(v.keyPath)] = idx;
  }

  output.sort((a, b) => {
    const indexA = keyPathToIndex[JSON.stringify(a.keyPath)];
    const indexB = keyPathToIndex[JSON.stringify(b.keyPath)];
    return indexA - indexB;
  });

  //TODO: what should editing selectedName do? The following assumes it has no effect.
  const selectedItem = getSectionSelectedItem(sectionId);
  const parentId = selectedItem ?? getSectionInfo(sectionId).codeInfoId;
  const idsToChildren = {};
  if (parentId) {
    idsToChildren[parentId] = [];
  }
  for (const v of output) {
    idsToChildren[v.id] = [];
  }

  // process everything except pinned parameters that already exist
  updateIdsToChildren({
    idsToChildren,
    output: output.filter((v) => !(v.isPinned && !v.isNewParam)),
    inputParentId: parentId,
    insertAtOriginalIdx: false,
  });

  // pinned parameters that already exist should be inserted at their original indices
  updateIdsToChildren({
    idsToChildren,
    output: output.filter((v) => v.isPinned && !v.isNewParam),
    inputParentId: parentId,
    insertAtOriginalIdx: true,
  });

  const cState = useCodeInfo.getState().x;
  const newInfos = {};
  const updatedInfos = {};
  const paramInfoIdToValue = {};
  const { configLanguage } = useSectionInfos.getState().x[sectionId];
  for (const v of output) {
    if (!(v.id in cState)) {
      newInfos[v.id] = newCodeInfo({
        id: v.id,
        name: v.key,
        editable: v.editable ?? selectedItem === null,
        rcType: C.PARAMETER,
        isPinned: v.isPinned,
      });
    } else {
      updatedInfos[v.id] = { name: v.key, isPinned: v.isPinned };
    }
    paramInfoIdToValue[v.id] =
      configLanguage === "json"
        ? JSON.stringify(v.value)
        : unprocessValue(v.value);
  }
  console.log("newInfos", newInfos);

  addCodeInfoBatch(newInfos);
  batchUpdateCodeInfoAttrs(updatedInfos);
  batchUpdateCodeInfoChildren(idsToChildren);
  initializeParam(sectionId, Object.keys(newInfos));
  setParamEnteredValueBatch({ sectionId, paramInfoIdToValue });
}

function updateOutputs({ v, matches, usedOriginalIds, usedPaths, output }) {
  const curr = _.pick(matches[0], ["key", "keyPath", "value", "isPinned"]);
  curr.id = v.id;
  curr.editable = v.editable;
  output.push(curr);
  usedOriginalIds.add(v.id);
  usedPaths.add(JSON.stringify(curr.keyPath));
}

function flattenObject(obj, isPrettyObj = false) {
  let result = [];

  function flatten(id, item, editable, keyPath) {
    if (typeof item === "object" && !Array.isArray(item) && item !== null) {
      if (keyPath.length > 0) {
        result.push({
          id,
          keyPath,
          value: null,
          editable,
          key: keyPath[keyPath.length - 1],
        });
      }
      for (const [key, value] of Object.entries(item)) {
        const newKeyPath = [...keyPath, key];
        if (isPrettyObj) {
          flatten(null, value, null, newKeyPath);
        } else {
          flatten(value.id, value.value, value.editable, newKeyPath);
        }
      }
    } else {
      result.push({
        id,
        keyPath,
        value: item,
        editable,
        key: keyPath[keyPath.length - 1],
      });
    }
  }

  flatten(null, obj, null, []);
  return result;
}

// Function to calculate similarity between two YAML paths
function calculatePathSimilarity(path1, path2) {
  const minLength = Math.min(path1.length, path2.length);
  const maxLength = Math.max(path1.length, path2.length);
  let commonElements = 0;

  for (let i = 0; i < minLength; i++) {
    if (path1[path1.length - 1 - i] === path2[path2.length - 1 - i]) {
      commonElements++;
    } else {
      break;
    }
  }

  // Similarity is based on common elements from the end and penalized for length difference
  return (commonElements / maxLength) * (minLength / maxLength);
}

// Function to sort list of YAML paths based on similarity to reference path
function sortPathsBySimilarity(matches, referencePath) {
  return matches.sort((a, b) => {
    const similarityA = calculatePathSimilarity(a.keyPath, referencePath);
    const similarityB = calculatePathSimilarity(b.keyPath, referencePath);
    return similarityB - similarityA; // Sort in descending order of similarity
  });
}

function mergePinnedAndUnpinned(pinned, unpinned) {
  for (const p of unpinned) {
    p.isPinned = false;
  }

  const pinnedNotInUnpinned = [];
  for (const p of pinned) {
    const match = unpinned.find((x) => _.isEqual(x.keyPath, p.keyPath));
    if (!match) {
      pinnedNotInUnpinned.push({ ...p, isPinned: true });
    }
  }

  return [...pinnedNotInUnpinned, ...unpinned];
}

function unprocessValue(value) {
  if (typeof value === "boolean") {
    return value.toString(); // Convert boolean to string "true" or "false"
  } else if (typeof value === "number") {
    return value.toString(); // Convert number to string
  } else if (Array.isArray(value)) {
    // Recursively process each element in the array
    return value.map(unprocessValue);
  } else if (typeof value === "object" && value !== null) {
    // Recursively process nested objects
    return unprocessObject(value);
  } else if (value === null) {
    return "";
  } else {
    return value; // Return the value as is for other data types (e.g., strings)
  }
}

function unprocessObject(obj) {
  const result = {};
  for (const key of Object.keys(obj)) {
    result[key] = unprocessValue(obj[key]);
  }
  return result;
}

function updateIdsToChildren({
  idsToChildren,
  output,
  inputParentId,
  insertAtOriginalIdx,
}) {
  for (const v of output) {
    let parentId = inputParentId;

    if (v.keyPath.length > 1) {
      // find parent
      const match = _.find(output, (x) =>
        _.isEqual(x.keyPath, v.keyPath.slice(0, -1)),
      );
      if (match) {
        parentId = match.id;
      } else {
        continue;
      }
    }

    if (!parentId) {
      continue;
    }

    if (insertAtOriginalIdx) {
      const originalIdx = useCodeInfo
        .getState()
        .x[parentId].children.indexOf(v.id);
      idsToChildren[parentId].splice(originalIdx, 0, v.id);
    } else {
      idsToChildren[parentId].push(v.id);
    }
  }
}
