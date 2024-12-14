import {
  computeInfoToFullName,
  keyForInfoToFullName,
} from "components/Utils/CodeMirror/utils";
import { useInfoToEVReferrer, useSectionInfos } from "state/definitions";

export function getInfoToEVReferrers(state) {
  const output = {};
  for (const [variantId, variant] of Object.entries(state.variants)) {
    processEVRefForUpdater(variant.evRefs, output, { variantId });
    if (variant.selectedItem) {
      const codeInfoId = variant.selectedItem;
      processEVRefForUpdater(state.codeInfo[codeInfoId].evRefs, output, {
        codeInfoId,
      });
    }
    for (const [referringParamInfoId, valueInfo] of Object.entries(
      variant.values,
    )) {
      processEVRefForUpdater(valueInfo.evRefs, output, {
        variantId,
        referringParamInfoId,
      });
    }
  }
  return output;
}

function processEVRefForUpdater(evRefs, output, metadata) {
  for (const evRef of evRefs) {
    const { sectionId, paramInfoId, isArgsObj, startPos, endPos, keyword } =
      evRef;
    const key = keyForInfoToFullName({ sectionId, paramInfoId, isArgsObj });
    if (!(sectionId in output)) {
      output[sectionId] = [];
    }
    if (!(paramInfoId in output[sectionId])) {
      output[sectionId][paramInfoId] = [];
    }
    output[sectionId][paramInfoId].push({
      key,
      startPos,
      endPos,
      keyword,
      ...metadata,
    });
  }
}

export function getRequiredReplacements(sectionIds) {
  const codeAreaReplacements = {};
  const codeInfoReplacements = {};
  const paramEVReplacements = {};
  const state = useSectionInfos.getState();

  const infoToFullName = computeInfoToFullName();
  let curr;
  for (const sectionId of sectionIds) {
    const referrersToSection = useInfoToEVReferrer.getState()[sectionId];
    if (!referrersToSection) {
      continue;
    }
    for (const [paramInfoId, details] of Object.entries(referrersToSection)) {
      for (const oneReferrer of details) {
        const {
          key,
          variantId,
          codeInfoId,
          referringParamInfoId,
          startPos,
          keyword: oldName,
        } = oneReferrer;
        const newName = infoToFullName[key];
        if (referringParamInfoId) {
          curr = getParamEVReplacementObj(
            paramEVReplacements,
            variantId,
            referringParamInfoId,
            state,
          );
        } else if (codeInfoId) {
          curr = getCodeInfoReplacementObj(
            codeInfoReplacements,
            codeInfoId,
            state,
          );
        } else {
          curr = getCodeAreaReplacementObj(
            codeAreaReplacements,
            variantId,
            state,
          );
        }

        curr.replacements.push([startPos, oldName, newName]);
      }
    }
  }
  return { codeAreaReplacements, codeInfoReplacements, paramEVReplacements };
}

function newReplacementObj(string) {
  return {
    string,
    replacements: [],
  };
}

function getParamEVReplacementObj(
  paramEVReplacements,
  variantId,
  referringParamInfoId,
  state,
) {
  if (!(variantId in paramEVReplacements)) {
    paramEVReplacements[variantId] = {};
  }
  if (!(referringParamInfoId in paramEVReplacements[variantId])) {
    paramEVReplacements[variantId][referringParamInfoId] = newReplacementObj(
      state.variants[variantId].values[referringParamInfoId].value,
    );
  }
  return paramEVReplacements[variantId][referringParamInfoId];
}

function getCodeInfoReplacementObj(codeInfoReplacements, codeInfoId, state) {
  if (!(codeInfoId in codeInfoReplacements)) {
    codeInfoReplacements[codeInfoId] = newReplacementObj(
      state.codeInfo[codeInfoId].name,
    );
  }
  return codeInfoReplacements[codeInfoId];
}

function getCodeAreaReplacementObj(codeAreaReplacements, variantId, state) {
  if (!(variantId in codeAreaReplacements)) {
    codeAreaReplacements[variantId] = newReplacementObj(
      state.variants[variantId].code,
    );
  }
  return codeAreaReplacements[variantId];
}
