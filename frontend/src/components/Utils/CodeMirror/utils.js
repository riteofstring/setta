import { useKeywordRegex, useSectionInfos } from "state/definitions";
import { getSectionDBSource } from "state/getters/sectionInfo";

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
  const evRefs = {};
  const { pattern: keywordRegex, fullNameToInfo } = useKeywordRegex.getState();
  for (const sectionId of Object.keys(project["sections"])) {
    evRefs[sectionId] = {};
    const dbSource = getSectionDBSource(sectionId);
    const { variantId } = useSectionInfos.getState().x[sectionId];
    const sectionVariant = project["sectionVariants"][dbSource][variantId];
    for (const [paramInfoId, value] of Object.entries(sectionVariant.values)) {
      evRefs[sectionId][paramInfoId] = findRefsOLD({
        keywordRegex,
        fullNameToInfo,
        value,
      });
    }
  }

  return evRefs;
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

export function findRefsOLD({ keywordRegex, fullNameToInfo, value }) {
  let match;
  const output = [];
  while ((match = keywordRegex.exec(value))) {
    const startPos = match.index;
    const endPos = startPos + match[0].length;
    const info = fullNameToInfo[match[0]];
    output.push({
      sectionId: info["sectionId"],
      paramInfoId: info["paramInfoId"],
      isArgsObj: info["isArgsObj"],
      startPos,
      endPos,
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
}) {
  let match;
  const output = [];
  const { pattern: keywordRegex } = useKeywordRegex.getState();
  while ((match = keywordRegex.exec(value))) {
    if (
      doesNotReferToSelf({
        fullNameToInfo,
        keyword: match[0],
        sectionId,
        paramInfoId,
      })
    )
      output.push(match[0]);
  }
  return output;
}
