import {
  computeInfoToFullName,
  keyForInfoToFullName,
} from "components/Utils/CodeMirror/utils";
import { dbMakeEVRefTemplateVarReplacements } from "requests/infoToEVReferrer";
import {
  useInfoToEVReferrer,
  useInfoToTemplateVarReferrer,
  useSectionInfos,
  useSettings,
} from "state/definitions";
import { RENAME_REFERENCES_ON_SECTION_MOVE_MODES } from "utils/constants";
import { templatePrefix } from "utils/utils";
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

export function getInfoToTemplateVarReferrer(state) {
  const output = {};
  for (const [variantId, variant] of Object.entries(state.variants)) {
    processTemplateVarForUpdater(variant.templateVars, output, { variantId });
  }
  return output;
}

function processTemplateVarForUpdater(templateVars, output, metadata) {
  for (const t of templateVars) {
    const { sectionId } = t;
    if (!sectionId) {
      return;
    }
    if (!(sectionId in output)) {
      output[sectionId] = [];
    }
    output[sectionId].push({
      originalTemplateVar: t,
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
  let atLeastOneReplacement = false;
  let referrers;

  for (const sectionId of Object.keys(useSectionInfos.getState().x)) {
    referrers = useInfoToEVReferrer.getState()[sectionId];
    if (referrers) {
      const changed = setEVRefReplacements(
        referrers,
        codeAreaReplacements,
        codeInfoReplacements,
        paramEVReplacements,
        state,
        infoToFullName,
      );
      atLeastOneReplacement ||= changed;
    }

    referrers = useInfoToTemplateVarReferrer.getState()[sectionId];
    if (referrers) {
      const changed = setTemplateVarReplacements(
        referrers,
        codeAreaReplacements,
        state,
      );
      atLeastOneReplacement ||= changed;
    }
  }

  return [
    codeAreaReplacements,
    codeInfoReplacements,
    paramEVReplacements,
    atLeastOneReplacement,
  ];
}

function setEVRefReplacements(
  evReferrersToSection,
  codeAreaReplacements,
  codeInfoReplacements,
  paramEVReplacements,
  state,
  infoToFullName,
) {
  let curr;
  let atLeastOneReplacement = false;
  for (const details of Object.values(evReferrersToSection)) {
    for (const oneReferrer of details) {
      const { variantId, codeInfoId, referringParamInfoId, originalEVRef } =
        oneReferrer;

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
      const newName = infoToFullName[keyForInfoToFullName(originalEVRef)];
      curr.replacements.push({ originalEVRef, newName });
      if (originalEVRef.keyword !== newName) {
        atLeastOneReplacement = true;
      }
    }
  }
  return atLeastOneReplacement;
}

function setTemplateVarReplacements(
  templateVarReferrersToSection,
  codeAreaReplacements,
  state,
) {
  let curr;
  let atLeastOneReplacement = false;
  for (const oneReferrer of templateVarReferrersToSection) {
    const { variantId, originalTemplateVar } = oneReferrer;
    curr = getCodeAreaReplacementObj(codeAreaReplacements, variantId, state);
    const matchingSection = Object.values(state.x).find(
      (s) => s.id === originalTemplateVar.sectionId,
    );
    if (matchingSection) {
      const newName = templatePrefix(matchingSection.name);
      curr.replacements.push({ originalTemplateVar, newName });
      if (originalTemplateVar.keyword !== newName) {
        atLeastOneReplacement = true;
      }
    }
  }
  return atLeastOneReplacement;
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

  const [
    codeAreaReplacements,
    codeInfoReplacements,
    paramEVReplacements,
    atLeastOneReplacement,
  ] = getRequiredReplacements();

  if (!atLeastOneReplacement) {
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
  const res = await dbMakeEVRefTemplateVarReplacements(
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
        curr.evRefs = newData[1];
        curr.templateVars = newData[2];
      }
      for (const [codeInfoId, newData] of Object.entries(newCodeInfoValues)) {
        curr = state.codeInfo[codeInfoId];
        curr.name = newData[0];
        curr.evRefs = newData[1];
      }
      for (const [variantId, params] of Object.entries(newParamEVValues)) {
        for (const [referringParamInfoId, newData] of Object.entries(params)) {
          curr = state.variants[variantId].values[referringParamInfoId];
          curr.value = newData[0];
          curr.evRefs = newData[1];
        }
      }
    });
  }
}
