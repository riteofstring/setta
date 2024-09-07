import { YamlView } from "components/Params/YamlView";
import React, { useEffect, useState } from "react";
import { dbSectionToDict } from "requests/sections";
import { useGetSectionInfo } from "state/hooks/sections";
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
      toGUI(yamlValue, originalObj);
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
    setOriginalObj(originalObj);
    setYamlValue(stringify(originalObj));
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

async function toGUI(yamlValue, originalObj) {
  const newObj = parse(yamlValue);
  const fOriginalObj = flattenObject(originalObj);
  const fNewObj = flattenObject(newObj);
  console.log(fOriginalObj);
  console.log(fNewObj);
  for (const v of fOriginalObj) {
    console.log(v.keyPath);
    const matches = fNewObj.filter((x) => x.key === v.key);
    if (matches.length > 0) {
      sortPathsBySimilarity(matches, v.keyPath);
      console.log(matches[0].keyPath);
    }
  }
}

function flattenObject(obj) {
  let result = [];

  function flatten(item, keyPath) {
    if (Array.isArray(item)) {
      item.forEach((element, index) => {
        flatten(element, [...keyPath, `[${index}]`]);
      });
    } else if (typeof item === "object" && item !== null) {
      for (const [key, value] of Object.entries(item)) {
        flatten(value, [...keyPath, key]);
      }
    } else {
      result.push({
        keyPath,
        value: item,
        key: keyPath[keyPath.length - 1],
      });
    }
  }

  flatten(obj, []);
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
