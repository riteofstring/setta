import {
  computeInfoToFullName,
  keyForInfoToFullName,
} from "components/Utils/CodeMirror/utils";
import _ from "lodash";
import { dbMakeEVRefReplacements } from "requests/infoToEVReferrer";
import {
  useInfoToEVReferrer,
  useSectionInfos,
  useSettings,
} from "state/definitions";
import { RENAME_REFERENCES_ON_SECTION_MOVE_MODES } from "utils/constants";
import { openRenameReferencesModal } from "./modal";

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
    const { sectionId, paramInfoId } = evRef;
    if (!(sectionId in output)) {
      output[sectionId] = {};
    }
    if (!(paramInfoId in output[sectionId])) {
      output[sectionId][paramInfoId] = [];
    }
    output[sectionId][paramInfoId].push({
      originalEVRef: evRef,
      ...metadata,
    });
  }
}

export function getRequiredReplacements() {
  const codeAreaReplacements = {};
  const codeInfoReplacements = {};
  const paramEVReplacements = {};
  const state = useSectionInfos.getState();

  const infoToFullName = computeInfoToFullName();
  let curr;
  for (const sectionId of Object.keys(useSectionInfos.getState().x)) {
    const referrersToSection = useInfoToEVReferrer.getState()[sectionId];
    if (!referrersToSection) {
      continue;
    }
    for (const [paramInfoId, details] of Object.entries(referrersToSection)) {
      for (const oneReferrer of details) {
        const { variantId, codeInfoId, referringParamInfoId, originalEVRef } =
          oneReferrer;

        const newName = infoToFullName[keyForInfoToFullName(originalEVRef)];
        if (originalEVRef.keyword === newName) {
          continue;
        }

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

        curr.replacements.push({ originalEVRef, newName });
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

export async function maybeOpenRenameReferencesModal() {
  const renameMode =
    useSettings.getState().backend.renameReferencesOnSectionMoveMode;

  if (renameMode === RENAME_REFERENCES_ON_SECTION_MOVE_MODES.NEVER_RENAME) {
    return;
  }

  const [codeAreaReplacements, codeInfoReplacements, paramEVReplacements] =
    getRequiredReplacements();

  if (
    _.size(codeAreaReplacements) === 0 &&
    _.size(codeInfoReplacements) === 0 &&
    _.size(paramEVReplacements) === 0
  ) {
    return;
  }

  if (renameMode === RENAME_REFERENCES_ON_SECTION_MOVE_MODES.ALWAYS_ASK) {
    openRenameReferencesModal(
      codeAreaReplacements,
      codeInfoReplacements,
      paramEVReplacements,
    );
  } else if (
    renameMode === RENAME_REFERENCES_ON_SECTION_MOVE_MODES.ALWAYS_RENAME
  ) {
    await makeReplacements(
      codeAreaReplacements,
      codeInfoReplacements,
      paramEVReplacements,
    );
  }
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
      let curr;
      for (const [variantId, newData] of Object.entries(newCodeAreaValues)) {
        curr = state.variants[variantId];
        curr.code = newData[0];
        curr.evRefs = updateEVRefsWithNewData(curr.evRefs, newData[1]);
      }
      for (const [codeInfoId, newData] of Object.entries(newCodeInfoValues)) {
        curr = state.codeInfo[codeInfoId];
        curr.name = newData[0];
        curr.evRefs = updateEVRefsWithNewData(curr.evRefs, newData[1]);
      }
      for (const [variantId, params] of Object.entries(newParamEVValues)) {
        for (const [referringParamInfoId, newData] of Object.entries(params)) {
          curr = state.variants[variantId].values[referringParamInfoId];
          curr.value = newData[0];
          curr.evRefs = updateEVRefsWithNewData(curr.evRefs, newData[1]);
        }
      }
    });
  }
}

function updateEVRefsWithNewData(evRefs, newData) {
  for (const n of newData) {
    const [oldPos, newEVRef] = n;
    const idx = evRefs.findIndex((e) => (e.startPos = oldPos));
    if (idx !== -1) {
      evRefs[idx] = newEVRef;
    }
  }
  return evRefs.sort((a, b) => a.startPos - b.startPos);
}
