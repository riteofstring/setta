import { dbMakeReplacements } from "requests/sections";
import { useSectionInfos, useSettings } from "state/definitions";
import { RENAME_REFERENCES_ON_SECTION_MOVE_MODES } from "utils/constants";

export async function maybeOpenRenameReferencesModal() {
  const renameMode =
    useSettings.getState().backend.renameReferencesOnSectionMoveMode;

  if (renameMode === RENAME_REFERENCES_ON_SECTION_MOVE_MODES.NEVER_RENAME) {
    return;
  }

  // TODO
  // const atLeastOneReplacement = dbcall...
  const atLeastOneReplacement = false;

  if (!atLeastOneReplacement) {
    return;
  }

  if (renameMode === RENAME_REFERENCES_ON_SECTION_MOVE_MODES.ALWAYS_ASK) {
    // openRenameReferencesModal(
    //   codeAreaReplacements,
    //   codeInfoReplacements,
    //   paramEVReplacements,
    // );
  } else if (
    renameMode === RENAME_REFERENCES_ON_SECTION_MOVE_MODES.ALWAYS_RENAME
  ) {
    // await makeReplacements(
    //   codeAreaReplacements,
    //   codeInfoReplacements,
    //   paramEVReplacements,
    // );
  }
}

export async function makeReplacements(
  codeAreaReplacements,
  codeInfoReplacements,
  paramEVReplacements,
) {
  const res = await dbMakeReplacements(
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
      }
      for (const [codeInfoId, newData] of Object.entries(newCodeInfoValues)) {
        curr = state.codeInfo[codeInfoId];
        curr.name = newData[0];
      }
      for (const [variantId, params] of Object.entries(newParamEVValues)) {
        for (const [referringParamInfoId, newData] of Object.entries(params)) {
          curr = state.variants[variantId].values[referringParamInfoId];
          curr.value = newData[0];
        }
      }
    });
  }
}
