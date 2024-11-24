import { useCodeInfo, useKeywordRegex } from "state/definitions";
import { getSectionConfig } from "state/getters/sectionInfo";

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
  const paramEVRefs = {};
  const selectedItemEVRefs = {};
  const codeEVRefs = {};
  const { fullNameToInfo } = useKeywordRegex.getState();
  const cState = useCodeInfo.getState().x;
  for (const sectionId of Object.keys(project["sections"])) {
    paramEVRefs[sectionId] = {};
    const { variantId } = getSectionConfig(sectionId);
    const sectionVariant = project["sectionVariants"][variantId];

    for (const [paramInfoId, valueInfo] of Object.entries(
      sectionVariant.values,
    )) {
      paramEVRefs[sectionId][paramInfoId] = findRefs({
        keywordPositions: valueInfo.keywordPositions,
        fullNameToInfo,
        fullText: valueInfo.value,
      });
    }

    if (sectionVariant.selectedItem) {
      const codeInfo = cState[sectionVariant.selectedItem];
      selectedItemEVRefs[sectionId] = findRefs({
        keywordPositions: codeInfo.keywordPositions,
        fullNameToInfo,
        fullText: codeInfo.name,
      });
    }

    if (sectionVariant.code) {
      codeEVRefs[sectionId] = findRefs({
        keywordPositions: sectionVariant.keywordPositions,
        fullNameToInfo,
        fullText: sectionVariant.code,
      });
    }
  }

  // console.log("codeEVRefs", codeEVRefs);

  return { paramEVRefs, selectedItemEVRefs, codeEVRefs };
}

export function findRefs({ keywordPositions, fullNameToInfo, fullText }) {
  const output = [];
  for (const k of keywordPositions) {
    const keyword = fullText.substring(k["startPos"], k["endPos"]);
    const info = fullNameToInfo[keyword];
    output.push({
      sectionId: info["sectionId"],
      paramInfoId: info["paramInfoId"],
      isArgsObj: info["isArgsObj"],
      startPos: k["startPos"],
      endPos: k["endPos"],
    });
  }

  return output;
}

export function computeInfoToFullName() {
  const output = {};
  for (const [k, v] of Object.entries(
    useKeywordRegex.getState().fullNameToInfo,
  )) {
    output[
      keyForInfoToFullName({
        sectionId: v.sectionId,
        paramInfoId: v.paramInfoId,
        isArgsObj: v.isArgsObj,
      })
    ] = k;
  }
  return output;
}

export function keyForInfoToFullName({
  sectionId,
  paramInfoId = null,
  isArgsObj = false,
}) {
  return JSON.stringify([sectionId, paramInfoId, isArgsObj]);
}

export function doesNotReferToSelf({
  fullNameToInfo,
  keyword,
  sectionId,
  paramInfoId,
}) {
  return !(
    (fullNameToInfo[keyword].sectionId === sectionId &&
      !fullNameToInfo[keyword].paramInfoId) ||
    (fullNameToInfo[keyword].sectionId === sectionId &&
      fullNameToInfo[keyword].paramInfoId === paramInfoId)
  );
}

export function findCandidateKeywords({
  sectionId,
  paramInfoId,
  value,
  fullNameToInfo,
  regexPatternKey,
}) {
  let match;
  const output = new Set();
  const keywordRegex = useKeywordRegex.getState()[regexPatternKey];
  while ((match = keywordRegex.exec(value))) {
    if (
      doesNotReferToSelf({
        fullNameToInfo,
        keyword: match[0],
        sectionId,
        paramInfoId,
      })
    )
      output.add(match[0]);
  }
  return Array.from(output);
}
