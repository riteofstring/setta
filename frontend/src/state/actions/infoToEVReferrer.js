import {
  computeInfoToFullName,
  keyForInfoToFullName,
} from "components/Utils/CodeMirror/utils";
import { dbMakeEVRefReplacements } from "requests/infoToEVReferrer";
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
  return [codeAreaReplacements, codeInfoReplacements, paramEVReplacements];
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

export async function maybeOpenRenameReferencesModal(sectionIds) {
  const [codeAreaReplacements, codeInfoReplacements, paramEVReplacements] =
    getRequiredReplacements(sectionIds);

  //   if (_.size(codeAreaReplacements) > 0 || _.size(codeInfoReplacements) >0 || _.size(paramEVReplacements) >0){
  //     openRenameReferencesModal()
  //   }

  makeReplacements(
    codeAreaReplacements,
    codeInfoReplacements,
    paramEVReplacements,
  );
}

export async function makeReplacements(
  codeAreaReplacements,
  codeInfoReplacements,
  paramEVReplacements,
) {
  const res = await dbMakeEVRefReplacements(
    codeAreaReplacements,
    codeInfoReplacements,
    paramEVReplacements,
  );
  if (res.status === 200) {
    const { newCodeAreaValues, newCodeInfoValues, newParamEVValues } = res.data;
    useSectionInfos.setState((state) => {
      for (const [variantId, newValue] of Object.entries(newCodeAreaValues)) {
        state.variants[variantId].code = newValue;
      }
      for (const [codeInfoId, newValue] of Object.entries(newCodeInfoValues)) {
        state.codeInfo[codeInfoId].name = newValue;
      }
      for (const [variantId, params] of Object.entries(newParamEVValues)) {
        for (const [referringParamInfoId, newValue] of Object.entries(params)) {
          state.variants[variantId].values[referringParamInfoId].value =
            newValue;
        }
      }
    });
  }
}
