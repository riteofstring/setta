import { YamlView } from "components/Params/YamlView";
import C from "constants/constants.json";
import _ from "lodash";
import React, { useEffect, useState } from "react";
import { dbSectionToDict } from "requests/sections";
import {
  addCodeInfoBatch,
  batchUpdateCodeInfoChildren,
} from "state/actions/codeInfo";
import { initializeParam } from "state/actions/initializeParam";
import { useCodeInfo } from "state/definitions";
import { getSectionInfo } from "state/getters/sectionInfo";
import { useGetSectionInfo } from "state/hooks/sections";
import { createNewId } from "utils/idNameCreation";
import { newCodeInfo } from "utils/objs/codeInfo";
import { parse, stringify } from "yaml";
import { ParamGroupContainer } from "../../Params/GroupContainer";
import { KwargsControls } from "../SectionParts/KwargsControls";

function _GlobalVariablesArea({ sectionId }) {
  const showYaml = useGetSectionInfo(sectionId, "showYaml");
  const [yamlValue, setYamlValue] = useState("");
  const [originalObj, setOriginalObj] = useState({});

  useEffect(() => {
    if (showYaml) {
      toYaml(sectionId, setYamlValue, setOriginalObj);
    } else {
      toGUI(sectionId, yamlValue, originalObj);
    }
  }, [showYaml]);

  return !showYaml ? (
    <>
      <KwargsControls sectionId={sectionId} objInfoId={null} />
      <ParamGroupContainer sectionId={sectionId} objInfoId={null} />
    </>
  ) : (
    <YamlView
      sectionId={sectionId}
      yamlValue={yamlValue}
      setYamlValue={setYamlValue}
    />
  );
}

export const GlobalVariablesArea = React.memo(_GlobalVariablesArea);

async function toYaml(sectionId, setYamlValue, setOriginalObj) {
  const res = await dbSectionToDict(sectionId);
  if (res.status === 200) {
    const originalObj = parseValues(res.data);
    setOriginalObj(originalObj.output);
    setYamlValue(stringify(originalObj.prettyOutput));
  }
}

function parseValues(obj) {
  for (let key in obj) {
    if (typeof obj[key] === "object" && obj[key] !== null) {
      obj[key] = parseValues(obj[key]);
    } else if (typeof obj[key] === "string") {
      try {
        obj[key] = JSON.parse(obj[key]);
      } catch (e) {
        // If parsing fails, keep the original value
      }
    }
  }
  return obj;
}

async function toGUI(sectionId, yamlValue, originalObj) {
  const newObj = parse(yamlValue);
  const fOriginalObj = flattenObject(originalObj);
  const fNewObj = flattenObject(newObj, true);
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

  // add remaining new entries
  for (const v of fNewObj) {
    if (usedPaths.has(JSON.stringify(v.keyPath))) {
      continue;
    }
    const curr = _.pick(v, ["key", "keyPath", "value"]);
    curr.id = createNewId();
    output.push(curr);
  }

  const { codeInfoId } = getSectionInfo(sectionId);
  const idsToChildren = { [codeInfoId]: [] };

  for (const v of output) {
    idsToChildren[v.id] = [];
  }

  for (const v of output) {
    if (v.keyPath.length > 1) {
      // find parent
      const match = _.find(output, (x) =>
        _.isEqual(x.keyPath, v.keyPath.slice(0, -1)),
      );
      if (match) {
        idsToChildren[match.id].push(v.id);
      }
    } else {
      idsToChildren[codeInfoId].push(v.id);
    }
  }

  const cState = useCodeInfo.getState().x;
  const infos = {};
  const newInfoIds = [];
  for (const v of output) {
    infos[v.id] = newCodeInfo({
      id: v.id,
      name: v.key,
      editable: true,
      rcType: C.PARAMETER,
      value: v.value,
    });
    if (!(v.id in cState)) {
      newInfoIds.push(v.id);
    }
  }

  addCodeInfoBatch(infos);
  batchUpdateCodeInfoChildren(idsToChildren);
  initializeParam(sectionId, newInfoIds);
}

function updateOutputs({ v, matches, usedOriginalIds, usedPaths, output }) {
  const curr = _.pick(matches[0], ["key", "keyPath", "value"]);
  curr.id = v.id;
  output.push(curr);
  usedOriginalIds.add(v.id);
  usedPaths.add(JSON.stringify(curr.keyPath));
}

function flattenObject(obj, isPrettyObj = false) {
  let result = [];

  function flatten(id, item, keyPath) {
    if (typeof item === "object" && item !== null) {
      if (keyPath.length > 0) {
        result.push({
          id,
          keyPath,
          value: null,
          key: keyPath[keyPath.length - 1],
        });
      }
      for (const [key, value] of Object.entries(item)) {
        const newKeyPath = [...keyPath, key];
        if (isPrettyObj) {
          flatten(null, value, newKeyPath);
        } else {
          flatten(value.id, value.value, newKeyPath);
        }
      }
    } else {
      result.push({
        id,
        keyPath,
        value: item,
        key: keyPath[keyPath.length - 1],
      });
    }
  }

  flatten(null, obj, []);
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
